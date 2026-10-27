-- Allow company members to delete contracts and their generated visit ledger rows.
-- The existing contracts migration intentionally did not include DELETE policies,
-- which caused the UI deletion request to be rejected by row-level security.
drop policy if exists "company members delete contracts" on public.crm_contracts;
create policy "company members delete contracts"
on public.crm_contracts
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.company_id = crm_contracts.company_id
  )
);

drop policy if exists "company members delete contract visits" on public.crm_contract_visits;
create policy "company members delete contract visits"
on public.crm_contract_visits
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.company_id = crm_contract_visits.company_id
  )
);
