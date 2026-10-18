-- Run this in Supabase SQL Editor after the existing Legendary Cleaners CRM setup.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_company_idx on public.push_subscriptions(company_id);
create table if not exists public.push_reminder_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  job_id text not null,
  reminder_type text not null default 'one_hour',
  sent_at timestamptz not null default now(),
  unique(company_id, job_id, reminder_type)
);
alter table public.push_subscriptions enable row level security;
alter table public.push_reminder_log enable row level security;
drop policy if exists "employees manage own push subscriptions" on public.push_subscriptions;
create policy "employees manage own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id=auth.uid() and company_id=public.current_company_id())
  with check (user_id=auth.uid() and company_id=public.current_company_id());
grant select, insert, update, delete on public.push_subscriptions to authenticated;
-- push_reminder_log intentionally has no authenticated-user policies. Only the Edge Function uses it.
