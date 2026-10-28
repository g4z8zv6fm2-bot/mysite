-- Repair employee onboarding for accounts that were created before the owner saved the invite.
-- This only links an authenticated user to an existing invitation with the same email.
create or replace function public.claim_my_crm_invite()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_invite public.employee_invites%rowtype;
begin
  if v_user is null then
    return false;
  end if;

  select lower(trim(email))
    into v_email
    from auth.users
   where id = v_user;

  if coalesce(v_email, '') = '' then
    return false;
  end if;

  if exists (
    select 1 from public.profiles
     where user_id = v_user
       and company_id is not null
  ) then
    return true;
  end if;

  select *
    into v_invite
    from public.employee_invites
   where lower(trim(email)) = v_email
   order by created_at asc
   limit 1
   for update;

  if not found then
    return false;
  end if;

  insert into public.profiles (user_id, company_id, email, full_name, role)
  values (
    v_user,
    v_invite.company_id,
    v_email,
    coalesce(nullif(trim(v_invite.full_name), ''), split_part(v_email, '@', 1)),
    coalesce(nullif(trim(v_invite.role), ''), 'Cleaner')
  )
  on conflict (user_id) do update
    set company_id = excluded.company_id,
        email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role;

  delete from public.employee_invites
   where id = v_invite.id;

  return true;
end;
$$;

revoke all on function public.claim_my_crm_invite() from public;
grant execute on function public.claim_my_crm_invite() to authenticated;
