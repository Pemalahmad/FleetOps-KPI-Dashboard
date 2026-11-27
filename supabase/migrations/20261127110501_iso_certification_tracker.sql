create table public.fleet_iso_records (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.fleet_teams(id),
  kind text not null check (kind in ('certificate','audit','finding')),
  certificate_id uuid,
  audit_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 180),
  status text not null check (
    kind='certificate' and status in ('planned','pending_verification','verified','suspended','withdrawn','superseded') or
    kind='audit' and status in ('scheduled','completed','cancelled') or
    kind='finding' and status in ('open','in_progress','resolved')
  ),
  standard text check (standard in ('ISO 39001:2012','ISO 45001:2018','ISO 14001:2026','ISO 14001:2015','ISO 9001:2026','ISO 9001:2015')),
  entity text check (char_length(entity) <= 180),
  sites text check (char_length(sites) <= 400),
  scope text check (char_length(scope) <= 800),
  issuer text check (char_length(issuer) <= 180),
  certificate_number text check (char_length(certificate_number) <= 120),
  issue_on date check (issue_on between date '1900-01-01' and date '2200-01-01'),
  due_on date check (due_on between date '1900-01-01' and date '2200-01-01'),
  closed_on date check (closed_on between date '1900-01-01' and date '2200-01-01'),
  audit_type text check (audit_type in ('internal','initial','surveillance','recertification')),
  severity text check (severity in ('minor','major','critical')),
  evidence text check (char_length(evidence) <= 380),
  notes text check (char_length(notes) <= 1200),
  owner_id uuid not null,
  manager_id uuid not null,
  created_by uuid not null,
  checked_by text,
  checked_at timestamptz,
  escalated_at timestamptz,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  unique (team_id,id),
  foreign key (team_id,certificate_id) references public.fleet_iso_records(team_id,id),
  foreign key (team_id,audit_id) references public.fleet_iso_records(team_id,id),
  foreign key (team_id,owner_id) references public.fleet_team_members(team_id,user_id),
  foreign key (team_id,manager_id) references public.fleet_team_members(team_id,user_id),
  foreign key (team_id,created_by) references public.fleet_team_members(team_id,user_id),
  check (issue_on is null or due_on is null or due_on > issue_on),
  check (
    kind='certificate' and certificate_id is null and audit_id is null and standard is not null and entity is not null and scope is not null or
    kind='audit' and certificate_id is not null and audit_id is null and audit_type is not null and due_on is not null or
    kind='finding' and certificate_id is not null and audit_id is not null and severity is not null and due_on is not null and notes is not null
  )
);
create index fleet_iso_records_team_deadline on public.fleet_iso_records(team_id,due_on);
create index fleet_iso_records_certificate on public.fleet_iso_records(team_id,certificate_id);
create index fleet_iso_records_audit on public.fleet_iso_records(team_id,audit_id);

create table public.fleet_iso_events (
  id bigint generated always as identity primary key,
  team_id uuid not null,
  iso_id uuid not null,
  actor text not null,
  action text not null check (action in ('created','updated','escalated','verified','resolved')),
  at timestamptz not null default now(),
  snapshot jsonb not null,
  foreign key (team_id,iso_id) references public.fleet_iso_records(team_id,id)
);
create index fleet_iso_events_record on public.fleet_iso_events(iso_id,id desc);

alter table public.fleet_iso_records enable row level security;
alter table public.fleet_iso_events enable row level security;
create policy fleet_iso_records_read on public.fleet_iso_records for select to authenticated
  using (fleet_private.team_role(team_id) is not null);
create policy fleet_iso_events_read on public.fleet_iso_events for select to authenticated
  using (fleet_private.team_role(team_id) is not null);
revoke all on public.fleet_iso_records, public.fleet_iso_events from public, anon, authenticated;
grant select on public.fleet_iso_records, public.fleet_iso_events to authenticated;

alter table public.fleet_case_notifications
  alter column case_id drop not null,
  add column iso_id uuid,
  add column iso_title text check (char_length(iso_title) <= 180),
  drop constraint fleet_case_notifications_event_type_check,
  add constraint fleet_notice_type check (event_type in ('assigned','overdue','iso_assigned','iso_renewal','iso_audit','iso_finding')),
  add constraint fleet_notice_destination check (
    case_id is not null and iso_id is null and event_type in ('assigned','overdue') or
    case_id is null and iso_id is not null and event_type in ('iso_assigned','iso_renewal','iso_audit','iso_finding')
  ),
  add foreign key (team_id,iso_id) references public.fleet_iso_records(team_id,id);
create unique index fleet_iso_notice_once on public.fleet_case_notifications(iso_id,recipient_id,event_key) where iso_id is not null;

create function fleet_private.iso_today() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'Asia/Dubai')::date; $$;

create function fleet_private.save_iso(p_team uuid, p_id uuid, p_revision bigint, p_record jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := fleet_private.team_role(p_team);
  v_old public.fleet_iso_records;
  v_new public.fleet_iso_records;
  v_saved public.fleet_iso_records;
  v_action text;
  v_verify boolean;
  v_today date := fleet_private.iso_today();
begin
  if v_role is null then raise exception 'Team membership required.' using errcode='42501'; end if;
  if p_record is null or jsonb_typeof(p_record) <> 'object' or octet_length(p_record::text) > 9200 then
    raise exception 'Enter a valid ISO tracker record.';
  end if;
  v_new := jsonb_populate_record(null::public.fleet_iso_records,p_record);
  v_new.checked_by := null;
  v_new.checked_at := null;
  v_new.title := nullif(trim(v_new.title),'');
  v_new.entity := nullif(trim(v_new.entity),'');
  v_new.sites := nullif(trim(v_new.sites),'');
  v_new.scope := nullif(trim(v_new.scope),'');
  v_new.issuer := nullif(trim(v_new.issuer),'');
  v_new.certificate_number := nullif(trim(v_new.certificate_number),'');
  v_new.evidence := nullif(trim(v_new.evidence),'');
  v_new.notes := nullif(trim(v_new.notes),'');
  if p_id is not null then
    select * into v_old from public.fleet_iso_records where id=p_id and team_id=p_team for update;
    if not found or (v_role <> 'admin' and v_actor not in (v_old.owner_id,v_old.manager_id,v_old.created_by)) then
      raise exception 'You cannot edit this ISO record.' using errcode='42501';
    end if;
    if v_old.revision is distinct from p_revision then raise exception 'This record changed. Refresh and try again.' using errcode='40001'; end if;
    if v_new.kind is distinct from v_old.kind or v_new.certificate_id is distinct from v_old.certificate_id or v_new.audit_id is distinct from v_old.audit_id then
      raise exception 'Keep the original record type and audit links.';
    end if;
    if v_role <> 'admin' and v_actor not in (v_old.manager_id,v_old.created_by) and
      (v_new.owner_id is distinct from v_old.owner_id or v_new.manager_id is distinct from v_old.manager_id) then
      raise exception 'A manager, reporter or team administrator must change assignments.' using errcode='42501';
    end if;
  end if;
  if v_new.title is null then raise exception 'Enter a record title.'; end if;
  if not exists (select 1 from public.fleet_team_members m where m.team_id=p_team and m.user_id=v_new.owner_id and m.active)
    or not exists (select 1 from public.fleet_team_members m where m.team_id=p_team and m.user_id=v_new.manager_id and m.active) then
    raise exception 'Choose an active owner and accountable manager from this team.';
  end if;

  if v_new.kind='certificate' then
    if v_new.standard is null or v_new.entity is null or v_new.scope is null then raise exception 'Enter the standard, legal entity and certificate scope.'; end if;
    v_verify := v_new.status='verified' and (v_old.status is distinct from 'verified' or
      row(v_new.standard,v_new.entity,v_new.sites,v_new.scope,v_new.issuer,v_new.certificate_number,v_new.issue_on,v_new.due_on,v_new.evidence)
      is distinct from row(v_old.standard,v_old.entity,v_old.sites,v_old.scope,v_old.issuer,v_old.certificate_number,v_old.issue_on,v_old.due_on,v_old.evidence));
    if v_verify then
      if v_role <> 'admin' and (p_id is null or v_actor is distinct from v_old.manager_id) then
        raise exception 'A team administrator or the assigned manager must verify the certificate.' using errcode='42501';
      end if;
      if v_new.issuer is null or v_new.certificate_number is null or v_new.issue_on is null or v_new.due_on is null or
        v_new.evidence is null or v_new.issue_on > v_today then
        raise exception 'Verify the issuer, number, issue date, expiry and evidence reference.';
      end if;
      v_new.checked_by := fleet_private.verified_email(); v_new.checked_at := now();
    elsif v_new.status='verified' then
      v_new.checked_by := v_old.checked_by; v_new.checked_at := v_old.checked_at;
    end if;
  else
    if not exists (select 1 from public.fleet_iso_records r where r.team_id=p_team and r.id=v_new.certificate_id and r.kind='certificate') then
      raise exception 'Choose a certificate from this team.';
    end if;
    if v_new.kind='audit' and v_new.status='completed' and
      (v_new.closed_on is null or v_new.closed_on > v_today or v_new.evidence is null) then
      raise exception 'Enter the completed audit date and report reference.';
    end if;
    if v_new.kind='finding' then
      if not exists (select 1 from public.fleet_iso_records r where r.team_id=p_team and r.id=v_new.audit_id
        and r.kind='audit' and r.certificate_id=v_new.certificate_id) then raise exception 'Choose an audit for this certificate.'; end if;
      if v_new.status='resolved' then
        if p_id is null then raise exception 'Record the finding before resolving it.'; end if;
        if v_actor=v_old.owner_id or v_actor=v_new.owner_id or (v_role <> 'admin' and v_actor<>v_old.manager_id) then
          raise exception 'An independent manager or administrator must verify the finding.' using errcode='42501';
        end if;
        if v_new.evidence is null then raise exception 'Enter corrective action and effectiveness evidence.'; end if;
        v_new.checked_by := fleet_private.verified_email(); v_new.checked_at := now();
        v_new.closed_on := v_today;
      else
        v_new.closed_on := null;
      end if;
    end if;
  end if;

  if p_id is null then
    insert into public.fleet_iso_records (team_id,kind,certificate_id,audit_id,title,status,standard,entity,sites,scope,issuer,
      certificate_number,issue_on,due_on,closed_on,audit_type,severity,evidence,notes,owner_id,manager_id,created_by,checked_by,checked_at)
    values (p_team,v_new.kind,v_new.certificate_id,v_new.audit_id,v_new.title,v_new.status,v_new.standard,v_new.entity,v_new.sites,v_new.scope,v_new.issuer,
      v_new.certificate_number,v_new.issue_on,v_new.due_on,v_new.closed_on,v_new.audit_type,v_new.severity,v_new.evidence,v_new.notes,
      v_new.owner_id,v_new.manager_id,v_actor,v_new.checked_by,v_new.checked_at)
    returning * into v_saved;
    v_action := 'created';
  else
    update public.fleet_iso_records set title=v_new.title,status=v_new.status,standard=v_new.standard,entity=v_new.entity,
      sites=v_new.sites,scope=v_new.scope,issuer=v_new.issuer,certificate_number=v_new.certificate_number,issue_on=v_new.issue_on,
      due_on=v_new.due_on,closed_on=v_new.closed_on,audit_type=v_new.audit_type,severity=v_new.severity,evidence=v_new.evidence,
      notes=v_new.notes,owner_id=v_new.owner_id,manager_id=v_new.manager_id,checked_by=v_new.checked_by,checked_at=v_new.checked_at,
      escalated_at=case when due_on is distinct from v_new.due_on or status='resolved' then null else escalated_at end,
      updated_at=now(),revision=revision+1
    where id=p_id returning * into v_saved;
    v_action := 'updated';
  end if;

  if v_verify then v_action := 'verified'; end if;
  if v_saved.status='resolved' then v_action := 'resolved'; end if;
  insert into public.fleet_iso_events (team_id,iso_id,actor,action,snapshot)
    values (p_team,v_saved.id,fleet_private.verified_email(),v_action,to_jsonb(v_saved));
  if v_saved.status not in ('resolved','completed','cancelled','withdrawn','superseded') then
    insert into public.fleet_case_notifications (team_id,iso_id,iso_title,recipient_id,event_type,event_key)
      select p_team,v_saved.id,v_saved.title,recipient,'iso_assigned','iso-assigned:' || v_saved.revision
      from (select distinct recipient from unnest(array[
        case when v_saved.owner_id is distinct from v_old.owner_id then v_saved.owner_id end,
        case when v_saved.manager_id is distinct from v_old.manager_id then v_saved.manager_id end
      ]) recipient where recipient is not null and recipient<>v_actor) changed
      on conflict do nothing;
  end if;
  return v_saved.id;
end;
$$;

create function fleet_private.enqueue_iso_deadlines() returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_today date := fleet_private.iso_today();
  v_count bigint;
begin
  with escalated as (
    update public.fleet_iso_records set escalated_at=now()
    where kind='finding' and status in ('open','in_progress') and due_on<v_today and escalated_at is null
    returning *
  )
  insert into public.fleet_iso_events (team_id,iso_id,actor,action,snapshot)
    select team_id,id,'FleetOps','escalated',to_jsonb(escalated) from escalated;

  with upcoming as (
    select id,team_id,title,owner_id,manager_id,due_on,
      case
        when kind='certificate' and status in ('verified','pending_verification') and due_on<=v_today+90 then 'iso_renewal'
        when kind='audit' and status='scheduled' and due_on<=v_today+30 then 'iso_audit'
        when kind='finding' and status in ('open','in_progress') and due_on<v_today then 'iso_finding'
      end as notice,
      case when due_on<v_today then 'overdue' when due_on=v_today then 'today'
           when due_on<=v_today+30 then '30' when due_on<=v_today+60 then '60' else '90' end as window
    from public.fleet_iso_records where due_on<=v_today+90
  )
  insert into public.fleet_case_notifications (team_id,iso_id,iso_title,recipient_id,event_type,event_key)
    select r.team_id,r.id,r.title,m.user_id,r.notice,r.notice || ':' || r.due_on || ':' || r.window
    from upcoming r join public.fleet_team_members m on m.team_id=r.team_id and m.active and m.user_id in (r.owner_id,r.manager_id)
    where r.notice is not null
    on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function fleet_private.iso_today(), fleet_private.save_iso(uuid,uuid,bigint,jsonb),
  fleet_private.enqueue_iso_deadlines() from public, anon, authenticated;
grant execute on function fleet_private.save_iso(uuid,uuid,bigint,jsonb) to authenticated;

create function public.fleet_save_iso(p_team uuid,p_id uuid,p_revision bigint,p_record jsonb)
returns uuid language sql set search_path = ''
as $$ select fleet_private.save_iso(p_team,p_id,p_revision,p_record); $$;
revoke execute on function public.fleet_save_iso(uuid,uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.fleet_save_iso(uuid,uuid,bigint,jsonb) to authenticated;

select cron.schedule('fleetops-iso-certification', '*/5 * * * *', 'select fleet_private.enqueue_iso_deadlines()');
