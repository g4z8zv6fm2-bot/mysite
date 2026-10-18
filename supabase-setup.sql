-- Legendary Cleaners CRM: shared workspace + employee invitations
-- BEFORE RUNNING: replace REPLACE_WITH_OWNER_EMAIL below with the exact email
-- address that will own the company, then run this whole file in Supabase SQL Editor.
-- Do NOT put a service_role key in the website. The public anon/publishable key is safe with RLS.

create extension if not exists pgcrypto;

create table if not exists public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Legendary Cleaners',
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  email text not null,
  full_name text not null default 'Employee',
  role text not null default 'Cleaner',
  created_at timestamptz not null default now()
);
create table if not exists public.employee_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null default 'Cleaner',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(company_id,email)
);
create table if not exists public.crm_workspaces (
  company_id uuid primary key references public.crm_companies(id) on delete cascade,
  data jsonb not null default '{"jobs":[],"customers":[],"team":[],"tab":"home"}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create or replace function public.crm_owner_email() returns text
language sql immutable as $$ select lower('ChickenLover1983@outlook.com') $$;

create or replace function public.current_company_id() returns uuid
language sql stable security definer set search_path = public
as $$ select p.company_id from public.profiles p where p.user_id = auth.uid() limit 1 $$;

create or replace function public.is_company_owner() returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.role='Owner') $$;

create or replace function public.handle_new_crm_user() returns trigger
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_company uuid;
  v_invite public.employee_invites%rowtype;
  v_name text;
begin
  v_name := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), split_part(coalesce(new.email,''),'@',1), 'Employee');
  if lower(coalesce(new.email,'')) = public.crm_owner_email() then
    select id into v_company from public.crm_companies where owner_user_id = new.id limit 1;
    if v_company is null then
      insert into public.crm_companies(name, owner_user_id) values ('Legendary Cleaners',new.id) returning id into v_company;
    end if;
    insert into public.profiles(user_id,company_id,email,full_name,role)
    values(new.id,v_company,lower(new.email),v_name,'Owner')
    on conflict(user_id) do update set company_id=excluded.company_id, email=excluded.email, full_name=excluded.full_name, role='Owner';
    return new;
  end if;

  select * into v_invite from public.employee_invites
    where lower(email)=lower(coalesce(new.email,'')) order by created_at asc limit 1;
  if found then
    insert into public.profiles(user_id,company_id,email,full_name,role)
    values(new.id,v_invite.company_id,lower(new.email),coalesce(nullif(v_name,''),v_invite.full_name),v_invite.role)
    on conflict(user_id) do update set company_id=excluded.company_id,email=excluded.email,full_name=excluded.full_name,role=excluded.role;
    delete from public.employee_invites where id=v_invite.id;
  end if;
  -- Uninvited users may authenticate with Supabase but the app refuses access without a profile.
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_crm on auth.users;
create trigger on_auth_user_created_crm after insert on auth.users
for each row execute function public.handle_new_crm_user();

-- If the owner account already exists in Supabase Auth, attach it to a company now.
do $$
declare v_owner uuid; v_company uuid; v_email text := public.crm_owner_email(); v_name text;
begin
  if v_email = 'replace_with_owner_email' then
    raise notice 'Set the owner email in public.crm_owner_email() before inviting employees.';
    return;
  end if;
  select id, coalesce(nullif(raw_user_meta_data->>'full_name',''),split_part(email,'@',1)) into v_owner,v_name
    from auth.users where lower(email)=v_email limit 1;
  if v_owner is not null then
    select id into v_company from public.crm_companies where owner_user_id=v_owner limit 1;
    if v_company is null then insert into public.crm_companies(name,owner_user_id) values('Legendary Cleaners',v_owner) returning id into v_company; end if;
    insert into public.profiles(user_id,company_id,email,full_name,role)
      values(v_owner,v_company,v_email,coalesce(v_name,'Owner'),'Owner')
      on conflict(user_id) do update set company_id=excluded.company_id,email=excluded.email,full_name=excluded.full_name,role='Owner';
    insert into public.crm_workspaces(company_id,data,updated_by) values(v_company,'{"jobs":[],"customers":[],"team":[],"tab":"home"}'::jsonb,v_owner) on conflict(company_id) do nothing;
  end if;
end $$;

alter table public.crm_companies enable row level security;
alter table public.profiles enable row level security;
alter table public.employee_invites enable row level security;
alter table public.crm_workspaces enable row level security;

drop policy if exists "company members can read their company" on public.crm_companies;
create policy "company members can read their company" on public.crm_companies for select to authenticated using (id=public.current_company_id());
drop policy if exists "members can read profiles in their company" on public.profiles;
create policy "members can read profiles in their company" on public.profiles for select to authenticated using (user_id=auth.uid() or company_id=public.current_company_id());
drop policy if exists "owners read invites" on public.employee_invites;
create policy "owners read invites" on public.employee_invites for select to authenticated using (company_id=public.current_company_id() and public.is_company_owner());
drop policy if exists "owners create invites" on public.employee_invites;
create policy "owners create invites" on public.employee_invites for insert to authenticated with check (company_id=public.current_company_id() and public.is_company_owner() and created_by=auth.uid());
drop policy if exists "owners update invites" on public.employee_invites;
create policy "owners update invites" on public.employee_invites for update to authenticated using (company_id=public.current_company_id() and public.is_company_owner()) with check (company_id=public.current_company_id() and public.is_company_owner() and created_by=auth.uid());
drop policy if exists "owners delete invites" on public.employee_invites;
create policy "owners delete invites" on public.employee_invites for delete to authenticated using (company_id=public.current_company_id() and public.is_company_owner());
drop policy if exists "members read shared workspace" on public.crm_workspaces;
create policy "members read shared workspace" on public.crm_workspaces for select to authenticated using (company_id=public.current_company_id());
drop policy if exists "members create shared workspace" on public.crm_workspaces;
create policy "members create shared workspace" on public.crm_workspaces for insert to authenticated with check (company_id=public.current_company_id() and updated_by=auth.uid());
drop policy if exists "members update shared workspace" on public.crm_workspaces;
create policy "members update shared workspace" on public.crm_workspaces for update to authenticated using (company_id=public.current_company_id()) with check (company_id=public.current_company_id() and updated_by=auth.uid());

grant select on public.crm_companies, public.profiles, public.employee_invites, public.crm_workspaces to authenticated;
grant insert, update, delete on public.employee_invites to authenticated;
grant insert, update on public.crm_workspaces to authenticated;

-- End setup. In Supabase Auth settings, enable Email provider. For public signup,
-- consider requiring email confirmation. Uninvited signups won't receive a company profile.
