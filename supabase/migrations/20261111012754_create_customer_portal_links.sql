-- Customer portal grants use one-way token hashes and are accessible only to the server-side Edge Function.
create table public.crm_customer_portal_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  customer_id text not null,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  constraint crm_customer_portal_links_expiry_check check (expires_at > created_at)
);

create index crm_customer_portal_links_company_customer_idx
  on public.crm_customer_portal_links(company_id, customer_id);

alter table public.crm_customer_portal_links enable row level security;
revoke all on table public.crm_customer_portal_links from public, anon, authenticated;
grant all on table public.crm_customer_portal_links to service_role;
