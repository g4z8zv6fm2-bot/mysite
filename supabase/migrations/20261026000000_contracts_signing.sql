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
