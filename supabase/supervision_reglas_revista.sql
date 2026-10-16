-- Configuración persistente de reglas de inspección por puesto.
-- Aplicada también al proyecto Supabase Alarvix.
begin;

create table if not exists public.supervision_reglas_revista (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  instalacion_id uuid not null references public.supervision_instalaciones(id) on delete cascade,
  revistas_requeridas integer not null default 2 check (revistas_requeridas between 1 and 100),
  periodo_objetivo text not null default 'dia' check (periodo_objetivo in ('dia','turno')),
  ventanas_horarias jsonb not null default '[]'::jsonb check (jsonb_typeof(ventanas_horarias) = 'array'),
  requerir_qr boolean not null default false,
  requerir_gps boolean not null default true,
  requerir_firma boolean not null default false,
  tolerancia_omision_min integer not null default 30 check (tolerancia_omision_min between 0 and 1440),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, instalacion_id)
);

alter table public.supervision_reglas_revista enable row level security;

drop policy if exists sup_reglas_revista_select on public.supervision_reglas_revista;
create policy sup_reglas_revista_select on public.supervision_reglas_revista
  for select to authenticated
  using (tenant_id = public.sup_tenant() and public.sup_can_read() and public.sup_site_ok(instalacion_id));

drop policy if exists sup_reglas_revista_insert on public.supervision_reglas_revista;
create policy sup_reglas_revista_insert on public.supervision_reglas_revista
  for insert to authenticated
  with check (tenant_id = public.sup_tenant() and public.sup_is_admin() and public.sup_site_ok(instalacion_id));

drop policy if exists sup_reglas_revista_update on public.supervision_reglas_revista;
create policy sup_reglas_revista_update on public.supervision_reglas_revista
  for update to authenticated
  using (tenant_id = public.sup_tenant() and public.sup_is_admin() and public.sup_site_ok(instalacion_id))
  with check (tenant_id = public.sup_tenant() and public.sup_is_admin() and public.sup_site_ok(instalacion_id));

grant select, insert, update on public.supervision_reglas_revista to authenticated;

commit;
