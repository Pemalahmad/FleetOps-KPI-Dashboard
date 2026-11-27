create schema if not exists fleet_private;
revoke all on schema fleet_private from public, anon, authenticated;
grant usage on schema fleet_private to authenticated;

create table public.fleet_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.fleet_team_members (
  team_id uuid not null references public.fleet_teams(id),
  user_id uuid not null references auth.users(id),
  email text not null,
  role text not null check (role in ('admin', 'member')),
  active boolean not null default true,
  primary key (team_id, user_id)
);
create index fleet_members_by_user on public.fleet_team_members (user_id, team_id) where active;

create table fleet_private.invitations (
  digest bytea primary key,
  team_id uuid not null references public.fleet_teams(id),
  email text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz
);
alter table fleet_private.invitations enable row level security;

create table public.fleet_team_cases (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.fleet_teams(id),
  source_key text not null check (char_length(source_key) between 1 and 250),
  kind text not null check (kind in ('ehs', 'inspection', 'registration')),
  title text not null check (char_length(trim(title)) between 1 and 180),
  country text not null check (country in ('AE','BH','KW','OM','QA','SA')),
  due_on date not null,
  follow_up date,
  stage text not null check (
    (kind = 'ehs' and stage in ('reported','escalated','contained','corrective','closed')) or
    (kind in ('inspection','registration') and stage in ('open','escalated','awaiting_document','closed'))
  ),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object' and octet_length(context::text) <= 16384),
  proof jsonb check (proof is null or (jsonb_typeof(proof) = 'object' and octet_length(proof::text) <= 2048)),
  owner_id uuid,
  manager_id uuid,
  reporting text check (reporting in ('filed','reviewed_not_required')),
  reporting_reference text check (char_length(reporting_reference) <= 300),
  created_by uuid not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  unique (team_id, source_key),
  unique (team_id, id),
  foreign key (team_id, owner_id) references public.fleet_team_members(team_id, user_id),
  foreign key (team_id, manager_id) references public.fleet_team_members(team_id, user_id),
  foreign key (team_id, created_by) references public.fleet_team_members(team_id, user_id)
);
create index fleet_team_cases_open on public.fleet_team_cases (team_id, due_on) where stage <> 'closed';
create index fleet_team_cases_recent on public.fleet_team_cases (team_id, updated_at desc);

create table public.fleet_case_events (
  id bigint generated always as identity primary key,
  team_id uuid not null,
  case_id uuid not null,
  actor_email text not null,
  stage text not null,
  note text not null check (char_length(note) <= 1200),
  owner_email text,
  manager_email text,
  follow_up date,
  at timestamptz not null default now(),
  foreign key (team_id, case_id) references public.fleet_team_cases(team_id, id)
);
create index fleet_case_event_timeline on public.fleet_case_events (case_id, id desc);

create table public.fleet_case_notifications (
  id bigint generated always as identity primary key,
  team_id uuid not null,
  case_id uuid not null,
  recipient_id uuid not null,
  event_type text not null check (event_type in ('assigned','overdue')),
  event_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (case_id, recipient_id, event_key),
  foreign key (team_id, case_id) references public.fleet_team_cases(team_id, id),
  foreign key (team_id, recipient_id) references public.fleet_team_members(team_id, user_id)
);
create index fleet_inbox_recent on public.fleet_case_notifications (recipient_id, created_at desc);

create function fleet_private.team_role(p_team uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select member.role
  from public.fleet_team_members member
  join auth.users account on account.id = member.user_id
  where member.team_id = p_team and member.user_id = (select auth.uid()) and member.active
    and account.email_confirmed_at is not null and account.deleted_at is null
    and (account.banned_until is null or account.banned_until <= now())
$$;

alter table public.fleet_teams enable row level security;
alter table public.fleet_team_members enable row level security;
alter table public.fleet_team_cases enable row level security;
alter table public.fleet_case_events enable row level security;
alter table public.fleet_case_notifications enable row level security;
create policy fleet_teams_read on public.fleet_teams for select to authenticated
  using (fleet_private.team_role(id) is not null);
create policy fleet_members_read on public.fleet_team_members for select to authenticated
  using (active and fleet_private.team_role(team_id) is not null);
create policy fleet_cases_read on public.fleet_team_cases for select to authenticated
  using (fleet_private.team_role(team_id) is not null);
create policy fleet_events_read on public.fleet_case_events for select to authenticated
  using (fleet_private.team_role(team_id) is not null);
create policy fleet_notifications_read on public.fleet_case_notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and fleet_private.team_role(team_id) is not null);
revoke all on public.fleet_teams, public.fleet_team_members, public.fleet_team_cases, public.fleet_case_events, public.fleet_case_notifications from public, anon, authenticated;
grant select on public.fleet_teams, public.fleet_team_members, public.fleet_team_cases, public.fleet_case_events, public.fleet_case_notifications to authenticated;

create function fleet_private.verified_email() returns text
language sql stable security definer set search_path = ''
as $$
  select lower(email) from auth.users where id = (select auth.uid())
    and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until <= now())
$$;

create function fleet_private.create_team(p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := fleet_private.verified_email();
  v_team uuid;
begin
  if v_email is null then raise exception 'Use a verified team account.' using errcode = '42501'; end if;
  insert into public.fleet_teams (name) values (trim(p_name)) returning id into v_team;
  insert into public.fleet_team_members (team_id, user_id, email, role) values (v_team, auth.uid(), v_email, 'admin');
  return v_team;
end;
$$;

create function fleet_private.invite_member(p_team uuid, p_email text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_code text := gen_random_uuid()::text || gen_random_uuid()::text;
begin
  if fleet_private.team_role(p_team) is distinct from 'admin' then
    raise exception 'A team administrator must invite managers.' using errcode = '42501';
  end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Enter a valid work email.';
  end if;
  update fleet_private.invitations set expires_at = now()
  where team_id = p_team and email = v_email and accepted_at is null and expires_at > now();
  insert into fleet_private.invitations (digest, team_id, email, expires_at)
  values (sha256(convert_to(v_code, 'UTF8')), p_team, v_email, now() + interval '7 days');
  return v_code;
end;
$$;

create function fleet_private.join_team(p_code text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := fleet_private.verified_email();
  v_team uuid;
begin
  if v_email is null then raise exception 'Use a verified team account.' using errcode = '42501'; end if;
  update fleet_private.invitations set accepted_at = now()
  where digest = sha256(convert_to(trim(p_code), 'UTF8')) and email = v_email
    and accepted_at is null and expires_at > now()
  returning team_id into v_team;
  if v_team is null then raise exception 'This code is invalid, expired or assigned to a different email.' using errcode = '42501'; end if;
  insert into public.fleet_team_members (team_id, user_id, email, role)
    values (v_team, auth.uid(), v_email, 'member')
  on conflict (team_id,user_id) do update set active = true, email = excluded.email;
  return v_team;
end;
$$;

create function fleet_private.remove_member(p_team uuid, p_member uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if fleet_private.team_role(p_team) is distinct from 'admin' then
    raise exception 'A team administrator must remove access.' using errcode = '42501';
  end if;
  update public.fleet_team_members set active = false
    where team_id = p_team and user_id = p_member and role = 'member';
  if not found then raise exception 'Team member unavailable.'; end if;
end;
$$;

create function fleet_private.publish_case(
  p_team uuid, p_source text, p_kind text, p_title text, p_country text, p_due date, p_stage text, p_context jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if fleet_private.team_role(p_team) is null then raise exception 'Team membership required.' using errcode = '42501'; end if;
  if p_stage is null or p_stage = 'closed' then raise exception 'Share an active case.'; end if;
  insert into public.fleet_team_cases (team_id, source_key, kind, title, country, due_on, stage, context, created_by)
    values (p_team, p_source, p_kind, trim(p_title), p_country, p_due, p_stage, p_context, auth.uid())
  on conflict (team_id, source_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.fleet_team_cases where team_id = p_team and source_key = p_source;
  else
    insert into public.fleet_case_events (team_id, case_id, actor_email, stage, note)
      values (p_team, v_id, fleet_private.verified_email(), p_stage, 'Shared with the team.');
  end if;
  return v_id;
end;
$$;

create function fleet_private.change_case(
  p_id uuid, p_revision bigint, p_stage text, p_owner uuid, p_manager uuid, p_follow_up date,
  p_note text, p_reporting text, p_reporting_reference text, p_proof jsonb
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_case public.fleet_team_cases;
  v_role text;
  v_expected text;
  v_actor uuid := auth.uid();
  v_note text := trim(coalesce(p_note, ''));
  v_today date;
  v_proof_expiry date;
begin
  select * into v_case from public.fleet_team_cases where id = p_id for update;
  v_role := fleet_private.team_role(v_case.team_id);
  if v_role is null or (v_role <> 'admin' and v_actor is distinct from v_case.created_by
    and v_actor is distinct from v_case.owner_id and v_actor is distinct from v_case.manager_id) then
    raise exception 'You cannot update this case.' using errcode = '42501';
  end if;
  if p_revision is distinct from v_case.revision then raise exception 'The case changed. Refresh it and try again.' using errcode = '40001'; end if;
  if v_case.stage = 'closed' then raise exception 'This case is already closed.'; end if;
  if p_owner is not null and not exists (select 1 from public.fleet_team_members where team_id=v_case.team_id and user_id=p_owner and active)
    or p_manager is not null and not exists (select 1 from public.fleet_team_members where team_id=v_case.team_id and user_id=p_manager and active) then
    raise exception 'Choose active members from this team.';
  end if;
  if (p_owner is distinct from v_case.owner_id or p_manager is distinct from v_case.manager_id)
    and v_role <> 'admin' and v_actor is distinct from v_case.created_by and v_actor is distinct from v_case.manager_id then
    raise exception 'A case reporter, manager or administrator must change assignments.' using errcode = '42501';
  end if;
  if v_note = '' or char_length(v_note) > 900 then raise exception 'Record an update note up to 900 characters.'; end if;
  v_expected := case v_case.stage
    when 'reported' then 'escalated' when 'open' then 'escalated' when 'escalated' then
      case when v_case.kind = 'ehs' then 'contained' else 'awaiting_document' end
    when 'contained' then 'corrective' when 'corrective' then 'closed' when 'awaiting_document' then 'closed' end;
  if p_stage is null or (p_stage <> v_case.stage and p_stage is distinct from v_expected
    and not (p_stage = 'closed' and v_case.kind <> 'ehs' and p_proof is not null)) then
    raise exception 'Complete the current workflow step first.';
  end if;
  if (p_stage <> v_case.stage and p_stage <> 'closed') and (p_owner is null or p_manager is null or p_follow_up is null) then
    raise exception 'Choose a case owner, manager and follow-up date before advancing.';
  end if;
  if v_case.kind = 'ehs' then
    if p_proof is not null then raise exception 'EHS closure uses a reporting decision and a review note.'; end if;
    if p_stage = 'closed' and (p_owner is null or v_actor = p_owner or p_owner is distinct from v_case.owner_id or
      p_reporting is null or nullif(trim(p_reporting_reference),'') is null) then
      raise exception 'A different reviewer must record an external reporting decision and review evidence.';
    end if;
    if p_reporting is not null and nullif(trim(p_reporting_reference),'') is null then
      raise exception 'Record the filing reference or the reporting decision and basis.';
    end if;
  else
    if p_reporting is not null or p_reporting_reference is not null then raise exception 'This is a document case.'; end if;
    if p_stage = 'closed' then
      if coalesce(p_proof->>'expiresOn','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or nullif(trim(p_proof->>'reference'),'') is null then raise exception 'Attach the locally verified document reference.'; end if;
      v_proof_expiry := (p_proof->>'expiresOn')::date;
      v_today := (now() at time zone case v_case.country
        when 'AE' then 'Asia/Dubai' when 'OM' then 'Asia/Muscat' else 'Asia/Riyadh' end)::date;
      if v_proof_expiry <= v_case.due_on or v_proof_expiry < v_today then raise exception 'The document must cover the overdue date and still be current.'; end if;
    elsif p_proof is not null then raise exception 'Document proof is only recorded at closure.';
    end if;
  end if;
  update public.fleet_team_cases set stage=p_stage, owner_id=p_owner, manager_id=p_manager, follow_up=p_follow_up,
    reporting=p_reporting, reporting_reference=p_reporting_reference, proof=p_proof, revision=revision+1, updated_at=now()
    where id=p_id;
  insert into public.fleet_case_events (team_id,case_id,actor_email,stage,note,owner_email,manager_email,follow_up)
    values (v_case.team_id,p_id,fleet_private.verified_email(),p_stage,v_note,
      (select email from public.fleet_team_members where team_id=v_case.team_id and user_id=p_owner),
      (select email from public.fleet_team_members where team_id=v_case.team_id and user_id=p_manager),p_follow_up);
end;
$$;

create function fleet_private.mark_read(p_id bigint) returns void
language sql security definer set search_path = ''
as $$
  update public.fleet_case_notifications set read_at=coalesce(read_at,now())
    where id=p_id and recipient_id=(select auth.uid()) and fleet_private.team_role(team_id) is not null;
$$;

create function fleet_private.case_assignments() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.stage = 'closed' then return new; end if;
  insert into public.fleet_case_notifications (team_id,case_id,recipient_id,event_type,event_key)
    select new.team_id,new.id,recipient,'assigned','assigned:' || new.revision
    from (select distinct value as recipient from unnest(array[
      case when new.owner_id is distinct from old.owner_id then new.owner_id end,
      case when new.manager_id is distinct from old.manager_id then new.manager_id end
    ]) as value where value is not null) changed
  on conflict (case_id,recipient_id,event_key) do nothing;
  return new;
end;
$$;
create trigger fleet_case_assignments after update of owner_id, manager_id on public.fleet_team_cases
  for each row execute function fleet_private.case_assignments();

create function fleet_private.enqueue_overdue() returns bigint
language sql security definer set search_path = ''
as $$
  with ready as (
    select c.*, deadlines.due as deadline
    from public.fleet_team_cases c
    cross join lateral (select distinct due from (values
      (case when c.kind = 'ehs' then coalesce(c.follow_up,c.due_on) else c.due_on end),
      (case when c.kind <> 'ehs' then c.follow_up end)
    ) as dates(due) where due is not null) deadlines
    where c.stage <> 'closed'
  ), inserted as (
    insert into public.fleet_case_notifications (team_id,case_id,recipient_id,event_type,event_key)
      select c.team_id,c.id,m.user_id,'overdue','overdue:' || c.deadline
      from ready c join public.fleet_team_members m on m.team_id=c.team_id and m.active
        and m.user_id in (c.owner_id,c.manager_id)
      where c.deadline < (now() at time zone case c.country
        when 'AE' then 'Asia/Dubai' when 'OM' then 'Asia/Muscat' else 'Asia/Riyadh' end)::date
    on conflict (case_id,recipient_id,event_key) do nothing returning 1
  ) select count(*) from inserted;
$$;

revoke execute on all functions in schema fleet_private from public, anon, authenticated;
grant execute on function fleet_private.team_role(uuid), fleet_private.create_team(text),
  fleet_private.invite_member(uuid,text), fleet_private.join_team(text), fleet_private.remove_member(uuid,uuid),
  fleet_private.publish_case(uuid,text,text,text,text,date,text,jsonb),
  fleet_private.change_case(uuid,bigint,text,uuid,uuid,date,text,text,text,jsonb),
  fleet_private.mark_read(bigint) to authenticated;

-- Data API endpoints run as the caller. Privileged implementation functions live in an unexposed schema.
create function public.fleet_create_team(p_name text) returns uuid language sql set search_path = ''
  as $$ select fleet_private.create_team(p_name); $$;
create function public.fleet_invite_member(p_team uuid, p_email text) returns text language sql set search_path = ''
  as $$ select fleet_private.invite_member(p_team,p_email); $$;
create function public.fleet_join_team(p_code text) returns uuid language sql set search_path = ''
  as $$ select fleet_private.join_team(p_code); $$;
create function public.fleet_remove_member(p_team uuid,p_member uuid) returns void language sql set search_path = ''
  as $$ select fleet_private.remove_member(p_team,p_member); $$;
create function public.fleet_publish_case(p_team uuid,p_source text,p_kind text,p_title text,p_country text,p_due date,p_stage text,p_context jsonb)
returns uuid language sql set search_path = ''
  as $$ select fleet_private.publish_case(p_team,p_source,p_kind,p_title,p_country,p_due,p_stage,p_context); $$;
create function public.fleet_change_case(p_id uuid,p_revision bigint,p_stage text,p_owner uuid,p_manager uuid,
  p_follow_up date,p_note text,p_reporting text,p_reporting_reference text,p_proof jsonb)
returns void language sql set search_path = ''
  as $$ select fleet_private.change_case(p_id,p_revision,p_stage,p_owner,p_manager,p_follow_up,p_note,p_reporting,p_reporting_reference,p_proof); $$;
create function public.fleet_mark_read(p_id bigint) returns void language sql set search_path = ''
  as $$ select fleet_private.mark_read(p_id); $$;

revoke execute on function public.fleet_create_team(text), public.fleet_invite_member(uuid,text), public.fleet_join_team(text),
  public.fleet_remove_member(uuid,uuid), public.fleet_publish_case(uuid,text,text,text,text,date,text,jsonb),
  public.fleet_change_case(uuid,bigint,text,uuid,uuid,date,text,text,text,jsonb), public.fleet_mark_read(bigint)
  from public, anon, authenticated;
grant execute on function public.fleet_create_team(text), public.fleet_invite_member(uuid,text), public.fleet_join_team(text),
  public.fleet_remove_member(uuid,uuid), public.fleet_publish_case(uuid,text,text,text,text,date,text,jsonb),
  public.fleet_change_case(uuid,bigint,text,uuid,uuid,date,text,text,text,jsonb), public.fleet_mark_read(bigint)
  to authenticated;
