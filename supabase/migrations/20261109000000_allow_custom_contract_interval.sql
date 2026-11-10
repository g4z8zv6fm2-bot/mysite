-- Allow the contract's custom interval option already supported by the schedule trigger and CRM form.
-- Additive schema change: preserves all existing contracts and visit records.
alter table public.crm_contracts
  drop constraint if exists crm_contracts_frequency_check;

alter table public.crm_contracts
  add constraint crm_contracts_frequency_check
  check (frequency in (
    'weekly',
    'monthly',
    'every_2_months',
    'quarterly',
    'twice_yearly',
    'yearly',
    'custom',
    'custom_dates'
  ));
