\set ON_ERROR_STOP on
begin;
insert into auth.users (id,email,email_confirmed_at) values
  ('11000000-0000-0000-0000-000000000001','iso-admin@fleetops.test',now()),
  ('11000000-0000-0000-0000-000000000002','iso-owner@fleetops.test',now()),
  ('11000000-0000-0000-0000-000000000003','iso-outsider@fleetops.test',now());
grant usage on schema auth to authenticated;
select set_config('fleetops.iso_today',fleet_private.iso_today()::text,true);

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
select public.fleet_create_team('Synthetic ISO quality team') as team_id \gset
select public.fleet_invite_member(:'team_id','iso-owner@fleetops.test') as invite \gset
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
select public.fleet_join_team(:'invite');
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);

select set_config('fleetops.iso_team',:'team_id',true);
select set_config('fleetops.iso_roles',jsonb_build_object(
  'owner_id','11000000-0000-0000-0000-000000000002','manager_id','11000000-0000-0000-0000-000000000001')::text,true);
select public.fleet_save_iso(:'team_id',null,null,current_setting('fleetops.iso_roles')::jsonb || jsonb_build_object(
  'kind','certificate','title','Synthetic road safety certificate','status','verified','standard','ISO 39001:2012',
  'entity','Synthetic Fleet','sites','Dubai and Doha','scope','Fleet rental and maintenance','issuer','Synthetic Certification',
  'certificate_number','TEST-945','issue_on',current_setting('fleetops.iso_today')::date-100,'due_on',current_setting('fleetops.iso_today')::date+31,
  'evidence','ISSUER-VERIFY-1')) as cert_id \gset
select public.fleet_save_iso(:'team_id',null,null,current_setting('fleetops.iso_roles')::jsonb || jsonb_build_object(
  'kind','audit','title','Surveillance audit','status','scheduled','certificate_id',:'cert_id',
  'audit_type','surveillance','due_on',current_setting('fleetops.iso_today')::date+15)) as audit_id \gset
select public.fleet_save_iso(:'team_id',null,null,current_setting('fleetops.iso_roles')::jsonb || jsonb_build_object(
  'kind','finding','title','Unverified depot checklist','status','open','certificate_id',:'cert_id','audit_id',:'audit_id',
  'severity','major','due_on',current_setting('fleetops.iso_today')::date-1,'notes','Update the inspection log')) as finding_id \gset
select set_config('fleetops.iso_cert',:'cert_id',true),set_config('fleetops.iso_finding',:'finding_id',true);

select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000003',true);
do $$
begin
  if exists (select 1 from public.fleet_iso_records) or exists (select 1 from public.fleet_iso_events) then
    raise exception 'A non-member could see ISO records';
  end if;
  begin
    perform public.fleet_save_iso(current_setting('fleetops.iso_team')::uuid,null,null,'{}');
    raise exception 'A non-member could write ISO records';
  exception when insufficient_privilege then null; end;
end;
$$;

reset role;
select fleet_private.enqueue_iso_deadlines();
select fleet_private.enqueue_iso_deadlines();
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
do $$
declare
  finding uuid := current_setting('fleetops.iso_finding')::uuid;
  certificate uuid := current_setting('fleetops.iso_cert')::uuid;
  team uuid := current_setting('fleetops.iso_team')::uuid;
  draft jsonb;
begin
  if (select count(*) from public.fleet_iso_records)<>3 then raise exception 'Team owner cannot see all ISO records'; end if;
  if (select count(*) from public.fleet_case_notifications where iso_id is not null)<>6 then
    raise exception 'Assignment or deadline notices were missing or duplicated';
  end if;
  if not exists(select 1 from public.fleet_case_notifications where iso_id=certificate and event_type='iso_renewal' and event_key like '%:60')
    or not exists(select 1 from public.fleet_case_notifications where iso_id=finding and event_type='iso_finding')
    or not exists(select 1 from public.fleet_iso_events where iso_id=finding and action='escalated')
    then raise exception 'Renewal timing or finding escalation is wrong'; end if;
  begin
    update public.fleet_iso_records set status='resolved' where id=finding;
    raise exception 'Direct update bypassed record gates';
  exception when insufficient_privilege then null; end;
  select to_jsonb(r) into draft from public.fleet_iso_records r where id=finding;
  begin
    perform public.fleet_save_iso(team,finding,0,draft);
    raise exception 'A stale edit overwrote a current record';
  exception when serialization_failure then null; end;
  begin
    perform public.fleet_save_iso(team,finding,1,draft || '{"status":"resolved","evidence":"self verified"}');
    raise exception 'The finding owner approved their own work';
  exception when insufficient_privilege then null; end;
  select to_jsonb(r) into draft from public.fleet_iso_records r where id=certificate;
  begin
    perform public.fleet_save_iso(team,certificate,1,draft || '{"certificate_number":"forged"}');
    raise exception 'An unauthorized owner changed the verified number';
  exception when insufficient_privilege then null; end;
end;
$$;
select set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
select public.fleet_save_iso(:'team_id',:'finding_id',1,(select to_jsonb(r) from public.fleet_iso_records r where id=:'finding_id') ||
  '{"status":"resolved","evidence":"Effective fix verified under QA-12"}');
do $$
begin
  if not exists (select 1 from public.fleet_iso_records where id=current_setting('fleetops.iso_finding')::uuid
    and status='resolved' and checked_by='iso-admin@fleetops.test' and checked_at is not null) then
    raise exception 'Independent resolution was not recorded';
  end if;
end;
$$;
rollback;
