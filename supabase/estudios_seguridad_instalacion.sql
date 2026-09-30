-- Alarvix: estudios de seguridad previos a la instalación
-- Ejecutar una sola vez en Supabase SQL Editor.

create table if not exists public.estudios_seguridad_instalacion (
  id text primary key,
  tenant_id text not null,
  cliente text not null,
  contacto text,
  direccion text not null,
  ciudad text,
  tipo text,
  tecnico_id text,
  tecnico_auth_id uuid,
  necesidad text,
  area text,
  accesos text,
  zonas text,
  estado text not null default 'Pendiente',
  fecha_creacion timestamptz not null default now(),
  timeline jsonb not null default '[]'::jsonb,
  created_by uuid,
  updated_at timestamptz not null default now(),
  opr_report jsonb
);

create index if not exists idx_estudios_seguridad_tenant
  on public.estudios_seguridad_instalacion (tenant_id, updated_at desc);

create index if not exists idx_estudios_seguridad_tecnico
  on public.estudios_seguridad_instalacion (tenant_id, tecnico_id, estado);

alter table public.estudios_seguridad_instalacion enable row level security;

drop policy if exists "estudios seguridad select tenant" on public.estudios_seguridad_instalacion;
create policy "estudios seguridad select tenant"
on public.estudios_seguridad_instalacion
for select to authenticated
using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

drop policy if exists "estudios seguridad insert tenant" on public.estudios_seguridad_instalacion;
create policy "estudios seguridad insert tenant"
on public.estudios_seguridad_instalacion
for insert to authenticated
with check (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

drop policy if exists "estudios seguridad update tenant" on public.estudios_seguridad_instalacion;
create policy "estudios seguridad update tenant"
on public.estudios_seguridad_instalacion
for update to authenticated
using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'))
with check (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));

drop policy if exists "estudios seguridad delete tenant" on public.estudios_seguridad_instalacion;
create policy "estudios seguridad delete tenant"
on public.estudios_seguridad_instalacion
for delete to authenticated
using (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  and lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) in ('admin','manager','supervisor','dispatcher')
);

alter publication supabase_realtime add table public.estudios_seguridad_instalacion;

create or replace function public.set_estudios_seguridad_instalacion_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_estudios_seguridad_instalacion_updated_at on public.estudios_seguridad_instalacion;
create trigger trg_estudios_seguridad_instalacion_updated_at
before update on public.estudios_seguridad_instalacion
for each row execute function public.set_estudios_seguridad_instalacion_updated_at();


-- Permite almacenar el OPR técnico del estudio sin crear otra tabla.
ALTER TABLE public.estudios_seguridad_instalacion
  ADD COLUMN IF NOT EXISTS opr_report jsonb;
