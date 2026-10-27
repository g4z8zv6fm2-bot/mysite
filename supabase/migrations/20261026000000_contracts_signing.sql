-- Contract signing and recurring cleaning schedules for Legendary Cleaners CRM.
-- Additive migration: existing workspace/jobs/customers/team data is not modified.
create table if not exists public.crm_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  customer_id text,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null default '',
  service_address text not null default '',
  title text not null default 'Recurring Window Cleaning Agreement',
  term_years integer not null check (term_years in (2,3)),
  price numeric(12,2) not null default 0 check (price >= 0),
  start_date date not null,
  frequency text not null default 'custom' check (frequency in ('weekly','monthly','every_2_months','quarterly','twice_yearly','yearly','custom_dates')),
  interval_months integer check (interval_months is null or interval_months between 1 and 36),
  custom_dates date[] not null default '{}',
  terms text not null,
  status text not null default 'draft' check (status in ('draft','sent','signed','cancelled','expired')),
  token_hash text unique,
  signature_name text,
  signature_consent boolean not null default false,
  signed_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_contracts_company_status_idx on public.crm_contracts(company_id,status);
create index if not exists crm_contracts_company_customer_idx on public.crm_contracts(company_id,customer_id);
alter table public.crm_contracts enable row level security;
drop policy if exists "company members read contracts" on public.crm_contracts;
create policy "company members read contracts" on public.crm_contracts for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.company_id=crm_contracts.company_id));
drop policy if exists "company members create contracts" on public.crm_contracts;
create policy "company members create contracts" on public.crm_contracts for insert to authenticated
with check (created_by=auth.uid() and exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.company_id=crm_contracts.company_id));
drop policy if exists "company members update contracts" on public.crm_contracts;
create policy "company members update contracts" on public.crm_contracts for update to authenticated
using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.company_id=crm_contracts.company_id))
with check (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.company_id=crm_contracts.company_id));

create or replace function public.crm_get_public_contract(p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions
as $$
declare c public.crm_contracts%rowtype;
begin
 if p_token is null or length(p_token)<32 then return null; end if;
 select * into c from public.crm_contracts where token_hash=encode(digest(p_token,'sha256'),'hex') and status='sent' limit 1;
 if not found then return null; end if;
 return jsonb_build_object('id',c.id,'customer_name',c.customer_name,'title',c.title,'service_address',c.service_address,'term_years',c.term_years,'price',c.price,'start_date',c.start_date,'frequency',c.frequency,'interval_months',c.interval_months,'custom_dates',c.custom_dates,'terms',c.terms,'status',c.status);
end $$;

create or replace function public.crm_sign_public_contract(p_token text,p_signature_name text,p_consent boolean)
returns jsonb language plpgsql security definer set search_path=public,extensions
as $$
declare c public.crm_contracts%rowtype;
begin
 if p_token is null or length(p_token)<32 then raise exception 'Invalid signing link'; end if;
 if coalesce(trim(p_signature_name),'')='' or length(trim(p_signature_name))>160 then raise exception 'Enter your full name to sign'; end if;
 if p_consent is distinct from true then raise exception 'Consent is required to sign'; end if;
 update public.crm_contracts set status='signed',signature_name=trim(p_signature_name),signature_consent=true,signed_at=now(),updated_at=now()
 where token_hash=encode(digest(p_token,'sha256'),'hex') and status='sent' returning * into c;
 if not found then raise exception 'This contract is unavailable, already signed, or cancelled'; end if;
 return jsonb_build_object('id',c.id,'status',c.status,'signed_at',c.signed_at);
end $$;
revoke all on function public.crm_get_public_contract(text) from public;
revoke all on function public.crm_sign_public_contract(text,text,boolean) from public;
grant execute on function public.crm_get_public_contract(text) to anon,authenticated;
grant execute on function public.crm_sign_public_contract(text,text,boolean) to anon,authenticated;

-- Durable visit ledger: signing creates the contractual schedule in the database.
create table if not exists public.crm_contract_visits (
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references public.crm_contracts(id) on delete cascade,
 company_id uuid not null references public.crm_companies(id) on delete cascade,
 scheduled_date date not null,
 status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
 crm_job_key text,
 created_at timestamptz not null default now(),
 unique(contract_id,scheduled_date)
);
create index if not exists crm_contract_visits_company_date_idx on public.crm_contract_visits(company_id,scheduled_date);
alter table public.crm_contract_visits enable row level security;
drop policy if exists "company members read contract visits" on public.crm_contract_visits;
create policy "company members read contract visits" on public.crm_contract_visits for select to authenticated
using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.company_id=crm_contract_visits.company_id));
drop policy if exists "company members update contract visits" on public.crm_contract_visits;
create policy "company members update contract visits" on public.crm_contract_visits for update to authenticated
using (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.company_id=crm_contract_visits.company_id))
with check (exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.company_id=crm_contract_visits.company_id));

create or replace function public.crm_create_contract_visits()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_end date; v_step interval; v_date date; v_custom date;
begin
 if new.status <> 'signed' or old.status = 'signed' then return new; end if;
 v_end := (new.start_date + make_interval(years => new.term_years));
 if new.frequency='custom_dates' then
   foreach v_custom in array coalesce(new.custom_dates,'{}'::date[]) loop
     if v_custom>=new.start_date and v_custom<v_end then
       insert into public.crm_contract_visits(contract_id,company_id,scheduled_date)
       values(new.id,new.company_id,v_custom) on conflict(contract_id,scheduled_date) do nothing;
     end if;
   end loop;
 else
   v_step := case new.frequency
     when 'weekly' then interval '1 week'
     when 'monthly' then interval '1 month'
     when 'every_2_months' then interval '2 months'
     when 'quarterly' then interval '3 months'
     when 'twice_yearly' then interval '6 months'
     when 'yearly' then interval '1 year'
     when 'custom' then make_interval(months => greatest(coalesce(new.interval_months,1),1))
     else interval '1 month' end;
   v_date := new.start_date;
   while v_date < v_end loop
     insert into public.crm_contract_visits(contract_id,company_id,scheduled_date)
     values(new.id,new.company_id,v_date) on conflict(contract_id,scheduled_date) do nothing;
     v_date := (v_date + v_step)::date;
   end loop;
 end if;
 return new;
end $$;
drop trigger if exists crm_contract_signed_schedule on public.crm_contracts;
create trigger crm_contract_signed_schedule after update of status on public.crm_contracts
for each row when (new.status='signed' and old.status is distinct from 'signed')
execute function public.crm_create_contract_visits();
