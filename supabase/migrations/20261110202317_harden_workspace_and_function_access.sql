-- Remove only unconditional public SELECT policies from the shared workspace table.
-- Authenticated company-member policies remain in place.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'crm_workspaces'
      and cmd = 'SELECT'
      and 'public' = any(roles)
      and regexp_replace(coalesce(qual, ''), '[()[:space:]]', '', 'g') = 'true'
  loop
    execute format('drop policy %I on public.crm_workspaces', policy_record.policyname);
  end loop;
end
$$;

-- Tighten exposed function execution without breaking employee sign-in or public contract signing.
-- The public contract RPCs intentionally remain callable by anonymous customers using an unguessable token.
revoke execute on function public.claim_my_crm_invite() from public, anon;
grant execute on function public.claim_my_crm_invite() to authenticated;

revoke execute on function public.current_company_id() from public, anon;
grant execute on function public.current_company_id() to authenticated;

revoke execute on function public.is_company_owner() from public, anon;
grant execute on function public.is_company_owner() to authenticated;

revoke execute on function public.crm_create_contract_visits() from public, anon, authenticated;
revoke execute on function public.handle_new_crm_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

revoke execute on function public.crm_owner_email() from public, anon, authenticated;
alter function public.crm_owner_email() set search_path = pg_catalog;

revoke execute on function public.crm_get_public_contract(text) from public;
grant execute on function public.crm_get_public_contract(text) to anon, authenticated;

revoke execute on function public.crm_sign_public_contract(text, text, boolean) from public;
grant execute on function public.crm_sign_public_contract(text, text, boolean) to anon, authenticated;

revoke execute on function public.crm_sign_public_contract(text, text, boolean, text[]) from public;
grant execute on function public.crm_sign_public_contract(text, text, boolean, text[]) to anon, authenticated;

revoke execute on function public.crm_sign_public_contract(text, text, boolean, text[], jsonb) from public;
grant execute on function public.crm_sign_public_contract(text, text, boolean, text[], jsonb) to anon, authenticated;
