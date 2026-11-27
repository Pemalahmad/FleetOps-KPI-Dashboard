create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('fleetops-overdue-cases', '*/5 * * * *', 'select fleet_private.enqueue_overdue()');
