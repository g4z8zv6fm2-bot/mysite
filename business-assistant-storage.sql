-- Legendary Cleaners Business Assistant: private document storage
-- Run this in the Supabase SQL Editor for project uxsndyiyqttnrdeanhli.
-- This does not modify auth, employee invitations, workspace records, or push notifications.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crm-documents',
  'crm-documents',
  false,
  15728640,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = 15728640,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "CRM members read their company documents" on storage.objects;
create policy "CRM members read their company documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'crm-documents'
  and exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.company_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "CRM members upload their company documents" on storage.objects;
create policy "CRM members upload their company documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'crm-documents'
  and exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.company_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "CRM members delete their company documents" on storage.objects;
create policy "CRM members delete their company documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'crm-documents'
  and exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.company_id::text = (storage.foldername(name))[1]
  )
);
