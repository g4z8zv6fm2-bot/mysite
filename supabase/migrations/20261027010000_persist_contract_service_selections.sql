-- Persist the services selected by a customer while signing a public contract.
alter table public.crm_contracts
  add column if not exists selected_services text[] not null default '{}';

create or replace function public.crm_sign_public_contract(
  p_token text,
  p_signature_name text,
  p_consent boolean,
  p_selected_services text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  c public.crm_contracts%rowtype;
  v_services text[];
begin
  if p_token is null or length(p_token)<32 then
    raise exception 'Invalid signing link';
  end if;
  if coalesce(trim(p_signature_name),'')='' or length(trim(p_signature_name))>160 then
    raise exception 'Enter your full name to sign';
  end if;
  if p_consent is distinct from true then
    raise exception 'Consent is required to sign';
  end if;

  select coalesce(array_agg(distinct service), '{}')
  into v_services
  from unnest(coalesce(p_selected_services, '{}')) as u(service)
  where service in (
    'Exterior Window Cleaning',
    'Interior Window Cleaning',
    'Window Screen Cleaning',
    'Window Tracks and Sills'
  );

  update public.crm_contracts
  set status='signed',
      signature_name=trim(p_signature_name),
      signature_consent=true,
      selected_services=v_services,
      signed_at=now(),
      updated_at=now()
  where token_hash=encode(digest(p_token,'sha256'),'hex')
    and status='sent'
  returning * into c;

  if not found then
    raise exception 'This contract is unavailable, already signed, or cancelled';
  end if;

  return jsonb_build_object(
    'id',c.id,
    'status',c.status,
    'signed_at',c.signed_at,
    'selected_services',c.selected_services
  );
end $$;

revoke all on function public.crm_sign_public_contract(text,text,boolean,text[]) from public;
grant execute on function public.crm_sign_public_contract(text,text,boolean,text[]) to anon,authenticated;
