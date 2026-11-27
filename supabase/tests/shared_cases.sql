\set ON_ERROR_STOP on
begin;
-- The local fixture gives these accounts a verified email and no access outside this transaction.
insert into auth.users (id,email,email_confirmed_at) values
  ('10000000-0000-0000-0000-000000000001','reporter@fleetops.test',now()),
  ('10000000-0000-0000-0000-000000000002','manager@fleetops.test',now()),
  ('10000000-0000-0000-0000-000000000003','outsider@fleetops.test',now());
grant usage on schema auth to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.fleet_create_team('Synthetic Fleet') as team_id \gset
select public.fleet_invite_member(:'team_id','manager@fleetops.test') as invite \gset
select public.fleet_publish_case(:'team_id','case-1','ehs','Synthetic near miss','AE',current_date-2,'reported','{}') as ehs_id \gset
select public.fleet_publish_case(:'team_id','case-2','inspection','Synthetic inspection','SA',current_date-2,'open','{}') as inspection_id \gset
select set_config('fleetops.team',:'team_id',true), set_config('fleetops.ehs',:'ehs_id',true), set_config('fleetops.inspect',:'inspection_id',true),
  set_config('fleetops.invite',:'invite',true);

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
do $$
begin
  if exists (select 1 from public.fleet_team_cases) then raise exception 'An outsider read a team case'; end if;
  begin
    perform public.fleet_join_team(current_setting('fleetops.invite'));
    raise exception 'A different email used the invitation';
  exception when insufficient_privilege then null; end;
  begin
    perform public.fleet_change_case(current_setting('fleetops.ehs')::uuid,1,'reported',null,null,null,'out of scope',null,null,null);
    raise exception 'An outsider updated a team case';
  exception when insufficient_privilege then null; end;
end;
$$;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select public.fleet_join_team(:'invite');
do $$
begin
  if (select count(*) from public.fleet_team_cases) <> 2 then raise exception 'Manager could not read shared cases'; end if;
  begin
    perform public.fleet_join_team(current_setting('fleetops.invite'));
    raise exception 'Invitation was reusable';
  exception when insufficient_privilege then null; end;
  begin
    update public.fleet_team_cases set stage='closed';
    raise exception 'The API role can bypass workflow mutations';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('fleet_private.enqueue_overdue()','execute') then raise exception 'The API role can run the overdue job'; end if;
end;
$$;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.fleet_change_case(:'ehs_id',1,'escalated','10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',current_date-1,'Assigned through dispatch',null,null,null);
select public.fleet_change_case(:'inspection_id',1,'escalated','10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',current_date-1,'Manager contacted',null,null,null);
do $$
begin
  if exists(select 1 from public.fleet_case_notifications) then raise exception 'A co-member read someone else’s notification'; end if;
  begin
    perform public.fleet_change_case(current_setting('fleetops.inspect')::uuid,1,'escalated',null,null,null,'stale',null,null,null);
    raise exception 'An outdated case revision overwrote newer changes';
  exception when serialization_failure then null; end;
end;
$$;

reset role;
select fleet_private.enqueue_overdue();
select fleet_private.enqueue_overdue();

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$
declare notice bigint;
begin
  if (select count(*) from public.fleet_case_notifications where event_type='assigned') <> 2 then raise exception 'Notifications duplicate when one person owns both roles'; end if;
  if (select count(*) from public.fleet_case_notifications where event_type='overdue') <> 3 then raise exception 'Overdue notices are missing or duplicated'; end if;
  select max(id) into notice from public.fleet_case_notifications;
  perform public.fleet_mark_read(notice);
  if not exists (select 1 from public.fleet_case_notifications where id=notice and read_at is not null) then raise exception 'Inbox read state was not saved'; end if;
end;
$$;
select public.fleet_change_case(:'ehs_id',2,'contained','10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',current_date-1,'Isolated; barrier verified',null,null,null);
select public.fleet_change_case(:'ehs_id',3,'corrective','10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',current_date-1,'Interlock repaired',null,null,null);
do $$
declare
  owner uuid := '10000000-0000-0000-0000-000000000002';
begin
  begin
    perform public.fleet_change_case(current_setting('fleetops.ehs')::uuid,4,'closed',owner,owner,current_date,'self approved','filed','NOT-1',null);
    raise exception 'Owner approved their own closure';
  exception when raise_exception then if sqlerrm not like 'A different reviewer%' then raise; end if; end;
  begin
    perform public.fleet_change_case(current_setting('fleetops.inspect')::uuid,2,'closed',owner,owner,current_date,'no document',null,null,null);
    raise exception 'Compliance closed without evidence';
  exception when raise_exception then if sqlerrm not like 'Complete the current%' then raise; end if; end;
end;
$$;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.fleet_change_case(:'ehs_id',4,'closed','10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',current_date,'Independent reviewer verified functional test','filed','NOT-1',null);
select public.fleet_change_case(:'inspection_id',2,'closed','10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',current_date,'Linked garage verified the updated report',null,null,
  jsonb_build_object('reference','TEST-1','expiresOn',(current_date+30)::text));

select public.fleet_remove_member(:'team_id','10000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$
begin
  if exists (select 1 from public.fleet_case_notifications) or exists (select 1 from public.fleet_case_events)
    or exists (select 1 from public.fleet_team_cases) then raise exception 'Revoked account retained team access'; end if;
end;
$$;
rollback;
