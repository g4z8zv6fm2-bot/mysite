-- Enable database-native scheduling for one-hour job reminders.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

create or replace function public.configure_legendary_reminder_cron(p_secret text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_secret_id uuid;
  v_job_id bigint;
begin
  if p_secret is null or length(p_secret) < 32 then
    raise exception 'Reminder secret must be at least 32 characters.';
  end if;

  select id into v_secret_id
  from vault.secrets
  where name = 'lc_reminder_secret'
  limit 1;

  if v_secret_id is null then
    perform vault.create_secret(
      p_secret,
      'lc_reminder_secret',
      'Server-only key for the Legendary Cleaners reminder cron caller'
    );
  else
    perform vault.update_secret(
      v_secret_id,
      p_secret,
      'lc_reminder_secret',
      'Server-only key for the Legendary Cleaners reminder cron caller'
    );
  end if;

  select jobid into v_job_id
  from cron.job
  where jobname = 'legendary-cleaners-one-hour-reminders'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  select cron.schedule(
    'legendary-cleaners-one-hour-reminders',
    '* * * * *',
    $cron$
      select net.http_post(
        url := 'https://uxsndyiyqttnrdeanhli.supabase.co/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'lc_reminder_secret'),
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lc_reminder_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      );
    $cron$
  ) into v_job_id;

  return v_job_id;
end;
$function$;

revoke execute on function public.configure_legendary_reminder_cron(text) from public, anon, authenticated;
grant execute on function public.configure_legendary_reminder_cron(text) to service_role;
