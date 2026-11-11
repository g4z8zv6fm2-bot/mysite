-- Server-side audit trail for shared workspace changes.
create table public.crm_workspace_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  operation text not null check (operation in ('INSERT', 'UPDATE')),
  changed_sections text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create index crm_workspace_audit_company_created_idx
  on public.crm_workspace_audit(company_id, created_at desc);

alter table public.crm_workspace_audit enable row level security;
revoke all on table public.crm_workspace_audit from public, anon;
revoke insert, update, delete on table public.crm_workspace_audit from authenticated;
grant select on table public.crm_workspace_audit to authenticated;
grant all on table public.crm_workspace_audit to service_role;

create policy "Company members read workspace audit"
on public.crm_workspace_audit
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.company_id = crm_workspace_audit.company_id
  )
);

create or replace function public.log_crm_workspace_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sections text[] := '{}'::text[];
begin
  if tg_op = 'INSERT' then
    select coalesce(array_agg(k.key order by k.key), '{}'::text[])
      into v_sections
    from jsonb_object_keys(coalesce(new.data, '{}'::jsonb)) as k(key);
  else
    select coalesce(array_agg(k.key order by k.key), '{}'::text[])
      into v_sections
    from (
      select key from jsonb_object_keys(coalesce(old.data, '{}'::jsonb)) as old_keys(key)
      union
      select key from jsonb_object_keys(coalesce(new.data, '{}'::jsonb)) as new_keys(key)
    ) as k
    where old.data -> k.key is distinct from new.data -> k.key;
  end if;

  if cardinality(v_sections) > 0 then
    insert into public.crm_workspace_audit(company_id, user_id, operation, changed_sections)
    values (new.company_id, auth.uid(), tg_op, v_sections);
  end if;

  return new;
end;
$function$;

revoke execute on function public.log_crm_workspace_audit() from public, anon, authenticated;

drop trigger if exists crm_workspace_audit_after_change on public.crm_workspaces;
create trigger crm_workspace_audit_after_change
after insert or update of data on public.crm_workspaces
for each row
execute function public.log_crm_workspace_audit();
