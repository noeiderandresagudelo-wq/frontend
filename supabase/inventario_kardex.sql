-- Alarvix Kardex Operativo Transaccional Multi-tenant
-- Regla: la existencia NO se edita directamente; solo cambia mediante registrar_movimiento_inventario().

create extension if not exists pgcrypto;

create table if not exists public.inventario_insumos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  codigo text not null,
  nombre text not null,
  categoria text,
  existencia numeric(14,2) not null default 0,
  stock_min numeric(14,2) not null default 0,
  stock_max numeric(14,2) not null default 0,
  costo_unitario numeric(14,2) not null default 0,
  proveedor text,
  ubicacion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, codigo),
  check (existencia >= 0),
  check (stock_min >= 0),
  check (stock_max >= stock_min),
  check (costo_unitario >= 0)
);

create table if not exists public.inventario_stock_tecnicos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  tecnico_id text not null,
  insumo_id uuid not null references public.inventario_insumos(id) on delete cascade,
  existencia numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (tenant_id, tecnico_id, insumo_id),
  check (existencia >= 0)
);

create table if not exists public.inventario_movimientos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  fecha_hora timestamptz not null default now(),
  usuario_id uuid,
  usuario_nombre text,
  tipo text not null,
  insumo_id uuid not null references public.inventario_insumos(id),
  tecnico_id text,
  cantidad numeric(14,2) not null,
  existencia_anterior numeric(14,2) not null,
  existencia_posterior numeric(14,2) not null,
  opr_ot_relacionado text,
  observacion text,
  created_at timestamptz not null default now(),
  check (cantidad > 0),
  check (existencia_anterior >= 0),
  check (existencia_posterior >= 0),
  check (tipo in ('ENTRADA','SALIDA_TECNICO','CONSUMO_OPR','DEVOLUCION','AJUSTE'))
);

create table if not exists public.inventario_reabastecimientos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  insumo_id uuid references public.inventario_insumos(id),
  cantidad_solicitada numeric(14,2) not null default 0,
  proveedor text,
  estado text not null default 'SOLICITADA',
  solicitado_por uuid,
  aprobado_por uuid,
  fecha_solicitud timestamptz not null default now(),
  fecha_recepcion timestamptz,
  observacion text,
  check (cantidad_solicitada > 0),
  check (estado in ('SOLICITADA','APROBADA','EN_COMPRA','RECIBIDA','CANCELADA'))
);

create table if not exists public.inventario_auditoria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  fecha_hora timestamptz not null default now(),
  usuario_id uuid,
  usuario_nombre text,
  accion text not null,
  entidad text,
  entidad_id text,
  detalle jsonb not null default '{}'::jsonb
);

create index if not exists idx_inv_insumos_tenant on public.inventario_insumos(tenant_id, activo, nombre);
create index if not exists idx_inv_mov_tenant_fecha on public.inventario_movimientos(tenant_id, fecha_hora desc);
create index if not exists idx_inv_mov_insumo on public.inventario_movimientos(tenant_id, insumo_id, fecha_hora desc);
create index if not exists idx_inv_mov_tecnico on public.inventario_movimientos(tenant_id, tecnico_id, fecha_hora desc);
create index if not exists idx_inv_stock_tecnico on public.inventario_stock_tecnicos(tenant_id, tecnico_id);
create index if not exists idx_inv_reab_tenant on public.inventario_reabastecimientos(tenant_id, estado, fecha_solicitud desc);
create index if not exists idx_inv_audit_tenant on public.inventario_auditoria(tenant_id, fecha_hora desc);

alter table public.inventario_insumos enable row level security;
alter table public.inventario_stock_tecnicos enable row level security;
alter table public.inventario_movimientos enable row level security;
alter table public.inventario_reabastecimientos enable row level security;
alter table public.inventario_auditoria enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'inventario_insumos','inventario_stock_tecnicos','inventario_movimientos',
    'inventario_reabastecimientos','inventario_auditoria'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_tenant', t);
    execute format('create policy %I on public.%I for select to authenticated using (tenant_id = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id'')::uuid)', t || '_select_tenant', t);
  end loop;
end $$;

drop policy if exists inventario_reabastecimientos_insert_tenant on public.inventario_reabastecimientos;
create policy inventario_reabastecimientos_insert_tenant on public.inventario_reabastecimientos
for insert to authenticated
with check (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

drop policy if exists inventario_reabastecimientos_update_tenant on public.inventario_reabastecimientos;
create policy inventario_reabastecimientos_update_tenant on public.inventario_reabastecimientos
for update to authenticated
using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid)
with check (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid);

-- Los movimientos son inmutables desde el cliente: no hay INSERT/UPDATE/DELETE directo.
revoke insert, update, delete on public.inventario_movimientos from authenticated;
revoke insert, update, delete on public.inventario_auditoria from authenticated;
revoke update on public.inventario_insumos from authenticated;
revoke delete on public.inventario_insumos from authenticated;
revoke update, delete on public.inventario_stock_tecnicos from authenticated;

grant select on public.inventario_insumos, public.inventario_stock_tecnicos,
  public.inventario_movimientos, public.inventario_reabastecimientos,
  public.inventario_auditoria to authenticated;

create or replace function public.bloquear_edicion_existencia_inventario()
returns trigger language plpgsql as $$
begin
  if current_setting('alarvix.inventory_internal', true) is distinct from '1'
     and new.existencia is distinct from old.existencia then
    raise exception 'La existencia solo puede cambiar mediante un movimiento de Kardex.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_existencia_inventario on public.inventario_insumos;
create trigger trg_bloquear_existencia_inventario
before update on public.inventario_insumos
for each row execute function public.bloquear_edicion_existencia_inventario();

create or replace function public.set_inventario_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_inv_insumos_updated_at on public.inventario_insumos;
create trigger trg_inv_insumos_updated_at before update on public.inventario_insumos
for each row execute function public.set_inventario_updated_at();

drop trigger if exists trg_inv_stock_updated_at on public.inventario_stock_tecnicos;
create trigger trg_inv_stock_updated_at before update on public.inventario_stock_tecnicos
for each row execute function public.set_inventario_updated_at();

create or replace function public.registrar_movimiento_inventario(
  p_tenant_id uuid,
  p_insumo_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_tecnico_id text default null,
  p_opr_ot_relacionado text default null,
  p_observacion text default null,
  p_usuario_id uuid default null,
  p_usuario_nombre text default null
)
returns public.inventario_movimientos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventario_insumos%rowtype;
  v_mov public.inventario_movimientos%rowtype;
  v_anterior numeric;
  v_posterior numeric;
  v_delta numeric;
  v_stock numeric;
begin
  if p_tenant_id is null or p_insumo_id is null then raise exception 'Tenant e insumo son obligatorios.'; end if;
  if p_cantidad is null or p_cantidad = 0 then raise exception 'La cantidad debe ser diferente de cero.'; end if;
  if p_tipo not in ('ENTRADA','SALIDA_TECNICO','CONSUMO_OPR','DEVOLUCION','AJUSTE') then
    raise exception 'Tipo de movimiento no permitido.';
  end if;

  select * into v_item
  from public.inventario_insumos
  where id = p_insumo_id and tenant_id = p_tenant_id
  for update;

  if not found then raise exception 'Insumo no encontrado para este tenant.'; end if;

  v_anterior := v_item.existencia;

  if p_tipo in ('ENTRADA','DEVOLUCION') then
    v_delta := abs(p_cantidad);
  elsif p_tipo = 'SALIDA_TECNICO' then
    v_delta := -abs(p_cantidad);
  elsif p_tipo = 'CONSUMO_OPR' then
    v_delta := 0;
  else
    v_delta := p_cantidad;
  end if;

  if p_tipo = 'CONSUMO_OPR' then
    if p_tecnico_id is null then raise exception 'Consumo OPR requiere tecnico_id.'; end if;

    select existencia into v_stock
    from public.inventario_stock_tecnicos
    where tenant_id = p_tenant_id and tecnico_id = p_tecnico_id and insumo_id = p_insumo_id
    for update;

    if coalesce(v_stock,0) < abs(p_cantidad) then
      raise exception 'Stock insuficiente del técnico. Disponible: %, solicitado: %.', coalesce(v_stock,0), abs(p_cantidad);
    end if;

    update public.inventario_stock_tecnicos
    set existencia = existencia - abs(p_cantidad)
    where tenant_id = p_tenant_id and tecnico_id = p_tecnico_id and insumo_id = p_insumo_id;

    v_posterior := v_anterior;
  elsif p_tipo = 'SALIDA_TECNICO' then
    if p_tecnico_id is null then raise exception 'Salida a técnico requiere tecnico_id.'; end if;
    v_posterior := v_anterior - abs(p_cantidad);
    if v_posterior < 0 then raise exception 'Stock insuficiente en bodega central. Disponible: %, solicitado: %.', v_anterior, abs(p_cantidad); end if;

    insert into public.inventario_stock_tecnicos(tenant_id, tecnico_id, insumo_id, existencia)
    values (p_tenant_id, p_tecnico_id, p_insumo_id, abs(p_cantidad))
    on conflict (tenant_id, tecnico_id, insumo_id)
    do update set existencia = public.inventario_stock_tecnicos.existencia + excluded.existencia;
  elsif p_tipo = 'DEVOLUCION' then
    if p_tecnico_id is not null then
      select existencia into v_stock from public.inventario_stock_tecnicos
      where tenant_id = p_tenant_id and tecnico_id = p_tecnico_id and insumo_id = p_insumo_id
      for update;
      if coalesce(v_stock,0) < abs(p_cantidad) then raise exception 'El técnico no tiene suficiente stock para devolver.'; end if;
      update public.inventario_stock_tecnicos
      set existencia = existencia - abs(p_cantidad)
      where tenant_id = p_tenant_id and tecnico_id = p_tecnico_id and insumo_id = p_insumo_id;
    end if;
    v_posterior := v_anterior + abs(p_cantidad);
  else
    v_posterior := v_anterior + v_delta;
    if v_posterior < 0 then raise exception 'El ajuste dejaría existencia negativa.'; end if;
  end if;

  perform set_config('alarvix.inventory_internal','1',true);
  update public.inventario_insumos
  set existencia = v_posterior
  where id = p_insumo_id and tenant_id = p_tenant_id;
  perform set_config('alarvix.inventory_internal','0',true);

  insert into public.inventario_movimientos(
    tenant_id, usuario_id, usuario_nombre, tipo, insumo_id, tecnico_id,
    cantidad, existencia_anterior, existencia_posterior, opr_ot_relacionado, observacion
  ) values (
    p_tenant_id, p_usuario_id, p_usuario_nombre, p_tipo, p_insumo_id, p_tecnico_id,
    abs(p_cantidad), v_anterior, v_posterior, p_opr_ot_relacionado, p_observacion
  ) returning * into v_mov;

  insert into public.inventario_auditoria(
    tenant_id, usuario_id, usuario_nombre, accion, entidad, entidad_id, detalle
  ) values (
    p_tenant_id, p_usuario_id, p_usuario_nombre, p_tipo, 'inventario_insumos', p_insumo_id::text,
    jsonb_build_object('cantidad',abs(p_cantidad),'existencia_anterior',v_anterior,'existencia_posterior',v_posterior,'tecnico_id',p_tecnico_id,'opr_ot',p_opr_ot_relacionado)
  );

  return v_mov;
end;
$$;

revoke execute on function public.registrar_movimiento_inventario(uuid,uuid,text,numeric,text,text,text,uuid,text) from public;
grant execute on function public.registrar_movimiento_inventario(uuid,uuid,text,numeric,text,text,text,uuid,text) to authenticated;

-- Recibir una compra = movimiento ENTRADA automático.
create or replace function public.recibir_reabastecimiento_inventario(
  p_reabastecimiento_id uuid,
  p_usuario_id uuid default null,
  p_usuario_nombre text default null
) returns public.inventario_reabastecimientos
language plpgsql security definer set search_path=public as $$
declare r public.inventario_reabastecimientos%rowtype;
begin
  select * into r from public.inventario_reabastecimientos
  where id=p_reabastecimiento_id
    and tenant_id=(select (auth.jwt()->'app_metadata'->>'tenant_id')::uuid)
  for update;
  if not found then raise exception 'Reabastecimiento no encontrado.'; end if;
  if r.estado='RECIBIDA' then return r; end if;
  if r.estado not in ('APROBADA','EN_COMPRA') then raise exception 'La solicitud no está lista para recibir.'; end if;

  perform public.registrar_movimiento_inventario(
    r.tenant_id,r.insumo_id,'ENTRADA',r.cantidad_solicitada,null,
    'COMPRA-'||r.id::text,'Recepción de compra',p_usuario_id,p_usuario_nombre
  );
  update public.inventario_reabastecimientos
  set estado='RECIBIDA',fecha_recepcion=now()
  where id=r.id returning * into r;
  return r;
end;
$$;

grant execute on function public.recibir_reabastecimiento_inventario(uuid,uuid,text) to authenticated;

-- Realtime
do $$
begin
  foreach t in array array['inventario_insumos','inventario_stock_tecnicos','inventario_movimientos','inventario_reabastecimientos','inventario_auditoria'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
