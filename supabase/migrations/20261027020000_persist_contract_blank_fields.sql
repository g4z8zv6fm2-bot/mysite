-- Make underline blanks on public contracts fillable and preserve the answers with the signed contract.
alter table public.crm_contracts
  add column if not exists signed_fields jsonb not null default '{}'::jsonb;

create or replace function public.crm_sign_public_contract(
  p_token text,
  p_signature_name text,
  p_consent boolean,
  p_selected_services text[] default '{}',
  p_filled_fields jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  c public.crm_contracts%rowtype;
  v_services text[];
  v_filled_fields jsonb;
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

  select coalesce(jsonb_object_agg(key, left(trim(value),1000)), '{}'::jsonb)
  into v_filled_fields
  from jsonb_each_text(
    case when jsonb_typeof(p_filled_fields)='object' then p_filled_fields else '{}'::jsonb end
  )
  where key ~ '^blank_field_[0-9]{1,3}$'
    and length(trim(value)) > 0;

  update public.crm_contracts
  set status='signed',
      signature_name=trim(p_signature_name),
      signature_consent=true,
      selected_services=v_services,
      signed_fields=v_filled_fields,
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
    'selected_services',c.selected_services,
    'signed_fields',c.signed_fields
  );
end $$;

revoke all on function public.crm_sign_public_contract(text,text,boolean,text[],jsonb) from public;
grant execute on function public.crm_sign_public_contract(text,text,boolean,text[],jsonb) to anon,authenticated;
