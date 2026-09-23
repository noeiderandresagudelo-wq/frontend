-- Alarvix: ubicacion en tiempo real de tecnicos
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.tecnicos_ubicaciones (
  tenant_id text not null,
  tecnico_id text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, tecnico_id)
);

create index if not exists idx_tecnicos_ubicaciones_tenant_last_seen
  on public.tecnicos_ubicaciones (tenant_id, last_seen desc);

alter table public.tecnicos_ubicaciones enable row level security;

drop policy if exists "tecnicos ubicaciones select" on public.tecnicos_ubicaciones;
create policy "tecnicos ubicaciones select"
on public.tecnicos_ubicaciones
for select
to authenticated
using (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  and (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'manager', 'supervisor', 'viewer')
    or tecnico_id = auth.uid()::text
  )
);

drop policy if exists "tecnico actualiza su ubicacion" on public.tecnicos_ubicaciones;
create policy "tecnico actualiza su ubicacion"
on public.tecnicos_ubicaciones
for insert
to authenticated
with check (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  and tecnico_id = auth.uid()::text
  and (auth.jwt() -> 'app_metadata' ->> 'role') = 'technician'
);

drop policy if exists "tecnico modifica su ubicacion" on public.tecnicos_ubicaciones;
create policy "tecnico modifica su ubicacion"
on public.tecnicos_ubicaciones
for update
to authenticated
using (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  and tecnico_id = auth.uid()::text
  and (auth.jwt() -> 'app_metadata' ->> 'role') = 'technician'
)
with check (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  and tecnico_id = auth.uid()::text
  and (auth.jwt() -> 'app_metadata' ->> 'role') = 'technician'
);

-- Permite que Supabase Realtime emita cambios de esta tabla.
alter publication supabase_realtime add table public.tecnicos_ubicaciones;

-- Actualiza updated_at automáticamente.
create or replace function public.set_tecnicos_ubicaciones_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tecnicos_ubicaciones_updated_at on public.tecnicos_ubicaciones;
create trigger trg_tecnicos_ubicaciones_updated_at
before update on public.tecnicos_ubicaciones
for each row execute function public.set_tecnicos_ubicaciones_updated_at();
