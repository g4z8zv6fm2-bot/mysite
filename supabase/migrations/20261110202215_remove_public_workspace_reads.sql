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
