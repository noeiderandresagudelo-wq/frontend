-- Alarvix: Storage para logos corporativos por tenant
-- Ejecutar una sola vez en Supabase SQL Editor.

insert into storage.buckets (id, name, public)
values ('empresa-logos', 'empresa-logos', true)
on conflict (id) do update set public = true;

drop policy if exists "empresa logos upload tenant" on storage.objects;
create policy "empresa logos upload tenant"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'empresa-logos'
  and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
);

drop policy if exists "empresa logos update tenant" on storage.objects;
create policy "empresa logos update tenant"
on storage.objects
for update to authenticated
using (
  bucket_id = 'empresa-logos'
  and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
)
with check (
  bucket_id = 'empresa-logos'
  and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
);

drop policy if exists "empresa logos delete tenant" on storage.objects;
create policy "empresa logos delete tenant"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'empresa-logos'
  and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
);

drop policy if exists "empresa logos read public" on storage.objects;
create policy "empresa logos read public"
on storage.objects
for select to public
using (bucket_id = 'empresa-logos');
