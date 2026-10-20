-- One record per scheduled job start, so scheduled runs never send duplicate reminders.
create table if not exists public.job_reminder_deliveries (
  company_id uuid not null,
  job_id text not null,
  job_date date not null,
  job_time time not null,
  sent_at timestamptz not null default now(),
  primary key (company_id, job_id, job_date, job_time)
);

alter table public.job_reminder_deliveries enable row level security;

-- No client-facing policies are added. The scheduled Edge Function uses the
-- Supabase service-role key, which bypasses RLS.
