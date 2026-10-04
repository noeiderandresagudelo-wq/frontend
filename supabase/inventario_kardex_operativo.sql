-- ALARVIX · KARDEX OPERATIVO TRANSACCIONAL MULTI-TENANT
-- Ejecutar una sola vez en Supabase SQL Editor.

create table if not exists public.inventario_insumos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  codigo text not null,
  nombre text not null,
  categoria text,
  stock_min numeric not null default 0,
  stock_max numeric not null default 0,
  existencia numeric not null default 0,
  costo_unitario numeric not null default 0,
  proveedor text,
  ubicacion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, codigo),
  check (existencia >= 0),
  check (stock_min >= 0),
  check (stock_max >= stock_min)
);

create table if not exists public.inventario_stock_tecnicos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  tecnico_id text not null,
  insumo_id uuid not null references public.inventario_insumos(id),
  existencia numeric not null default 0 check (existencia >= 0),
  consumido_mes numeric not null default 0 check (consumido_mes >= 0),
  updated_at timestamptz not null default now(),
  unique (tenant_id, tecnico_id, insumo_id)
);

create table if not exists public.inventario_movimientos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  fecha_hora timestamptz not null default now(),
  usuario_id uuid,
  usuario_nombre text,
  tipo text not null check (tipo in ('ENTRADA','SALIDA_TECNICO','CONSUMO_OPR','DEVOLUCION','AJUSTE')),
  insumo_id uuid not null references public.inventario_insumos(id),
  tecnico_id text,
  cantidad numeric not null check (cantidad > 0),
  movimiento numeric not null,
  existencia_anterior numeric not null,
  existencia_posterior numeric not null,
  origen text,
  destino text,
  opr_ot_relacionado text,
  observacion text,
  serial text,
  created_at timestamptz not null default now()
);

create table if not exists public.inventario_reabastecimientos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  insumo_id uuid references public.inventario_insumos(id),
  solicitud text not null,
  cantidad numeric not null check (cantidad > 0),
  estado text not null default 'SOLICITADA' check (estado in ('SOLICITADA','APROBADA','EN_COMPRA','RECIBIDA','CANCELADA')),
  proveedor text,
  observacion text,
  solicitado_por uuid,
  aprobado_por uuid,
  fecha_solicitud timestamptz not null default now(),
  fecha_recepcion timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventario_log_auditoria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  fecha_hora timestamptz not null default now(),
  usuario_id uuid,
  usuario_nombre text,
  accion text not null,
  entidad text not null,
  entidad_id text,
  detalle jsonb not null default '{}'::jsonb,
  serial text
);

create index if not exists idx_inv_insumos_tenant on public.inventario_insumos(tenant_id, activo, nombre);
create index if not exists idx_inv_stock_tech_tenant on public.inventario_stock_tecnicos(tenant_id, tecnico_id);
create index if not exists idx_inv_mov_tenant_fecha on public.inventario_movimientos(tenant_id, fecha_hora desc);
create index if not exists idx_inv_mov_insumo on public.inventario_movimientos(tenant_id, insumo_id, fecha_hora desc);
create index if not exists idx_inv_reab_tenant_estado on public.inventario_reabastecimientos(tenant_id, estado);
create index if not exists idx_inv_audit_tenant_fecha on public.inventario_log_auditoria(tenant_id, fecha_hora desc);

alter table public.inventario_insumos enable row level security;
alter table public.inventario_stock_tecnicos enable row level security;
alter table public.inventario_movimientos enable row level security;
alter table public.inventario_reabastecimientos enable row level security;
alter table public.inventario_log_auditoria enable row level security;

drop policy if exists "inventario insumos tenant select" on public.inventario_insumos;
create policy "inventario insumos tenant select" on public.inventario_insumos for select to authenticated using (tenant_id = current_tenant_id());
drop policy if exists "inventario insumos tenant insert" on public.inventario_insumos;
create policy "inventario insumos tenant insert" on public.inventario_insumos for insert to authenticated with check (tenant_id = current_tenant_id());
drop policy if exists "inventario insumos tenant update" on public.inventario_insumos;
create policy "inventario insumos tenant update" on public.inventario_insumos for update to authenticated using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
drop policy if exists "inventario stock tech select" on public.inventario_stock_tecnicos;
create policy "inventario stock tech select" on public.inventario_stock_tecnicos for select to authenticated using (tenant_id = current_tenant_id());
drop policy if exists "inventario movimientos select" on public.inventario_movimientos;
create policy "inventario movimientos select" on public.inventario_movimientos for select to authenticated using (tenant_id = current_tenant_id());
drop policy if exists "inventario reab select" on public.inventario_reabastecimientos;
create policy "inventario reab select" on public.inventario_reabastecimientos for select to authenticated using (tenant_id = current_tenant_id());
drop policy if exists "inventario reab insert" on public.inventario_reabastecimientos;
create policy "inventario reab insert" on public.inventario_reabastecimientos for insert to authenticated with check (tenant_id = current_tenant_id());
drop policy if exists "inventario reab update" on public.inventario_reabastecimientos;
create policy "inventario reab update" on public.inventario_reabastecimientos for update to authenticated using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
drop policy if exists "inventario audit select" on public.inventario_log_auditoria;
create policy "inventario audit select" on public.inventario_log_auditoria for select to authenticated using (tenant_id = current_tenant_id());

-- Blindaje de inmutabilidad: ningún UPDATE/INSERT directo del cliente puede alterar existencia.
create or replace function public.proteger_existencia_inventario()
returns trigger
language plpgsql
set search_path = ''
as $
begin
  if tg_op = 'UPDATE'
     and new.existencia is distinct from old.existencia
     and coalesce(current_setting('app.inventario_movimiento', true),'0') <> '1' then
    raise exception 'La existencia solo puede cambiar mediante un movimiento de Kardex';
  end if;
  if tg_op = 'INSERT'
     and new.existencia <> 0
     and coalesce(current_setting('app.inventario_movimiento', true),'0') <> '1' then
    raise exception 'La existencia inicial debe ser 0; registre una ENTRADA para crear stock';
  end if;
  return new;
end;
$;

drop trigger if exists trg_proteger_existencia_inventario on public.inventario_insumos;
create trigger trg_proteger_existencia_inventario
before insert or update on public.inventario_insumos
for each row execute function public.proteger_existencia_inventario();

create or replace function public.registrar_movimiento_inventario(
  p_insumo_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_tecnico_id text default null,
  p_opr_ot text default null,
  p_observacion text default null,
  p_serial text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_insumo public.inventario_insumos%rowtype;
  v_antes numeric;
  v_despues numeric;
  v_mov numeric;
  v_tech_antes numeric;
  v_tech_despues numeric;
  v_usuario_nombre text := coalesce(auth.jwt()->'user_metadata'->>'nombre', auth.jwt()->'app_metadata'->>'nombre', auth.email(), 'Usuario');
  v_usuario uuid := auth.uid();
begin
  if v_tenant is null then raise exception 'No hay tenant_id en la sesión'; end if;
  perform set_config('app.inventario_movimiento','1',true);
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  if p_tipo not in ('ENTRADA','SALIDA_TECNICO','CONSUMO_OPR','DEVOLUCION','AJUSTE') then raise exception 'Tipo de movimiento no permitido'; end if;

  select * into v_insumo from public.inventario_insumos where id = p_insumo_id and tenant_id = v_tenant for update;
  if not found then raise exception 'Insumo no encontrado para el tenant actual'; end if;

  if p_tipo in ('ENTRADA','DEVOLUCION') then v_mov := p_cantidad;
  elsif p_tipo = 'AJUSTE' then v_mov := p_cantidad;
  else v_mov := -p_cantidad;
  end if;

  v_antes := v_insumo.existencia;
  v_despues := v_antes + v_mov;

  if p_tipo in ('CONSUMO_OPR','DEVOLUCION') and nullif(trim(p_tecnico_id),'') is null then raise exception 'Este movimiento requiere técnico'; end if;

  if p_tipo = 'SALIDA_TECNICO' then
    if v_despues < 0 then raise exception 'Stock central insuficiente. Existencia actual: %, solicitado: %', v_antes, p_cantidad; end if;
    update public.inventario_insumos set existencia = v_despues, updated_at = now() where id = p_insumo_id and tenant_id = v_tenant;
    insert into public.inventario_stock_tecnicos(tenant_id, tecnico_id, insumo_id, existencia)
    values (v_tenant, p_tecnico_id, p_insumo_id, p_cantidad)
    on conflict (tenant_id, tecnico_id, insumo_id)
    do update set existencia = public.inventario_stock_tecnicos.existencia + excluded.existencia, updated_at = now();
  elsif p_tipo = 'CONSUMO_OPR' then
    select existencia into v_tech_antes from public.inventario_stock_tecnicos where tenant_id=v_tenant and tecnico_id=p_tecnico_id and insumo_id=p_insumo_id for update;
    if coalesce(v_tech_antes,0) < p_cantidad then raise exception 'Stock del técnico insuficiente. Disponible: %, solicitado: %', coalesce(v_tech_antes,0), p_cantidad; end if;
    v_tech_despues := v_tech_antes - p_cantidad;
    update public.inventario_stock_tecnicos set existencia=v_tech_despues, consumido_mes=consumido_mes+p_cantidad, updated_at=now()
    where tenant_id=v_tenant and tecnico_id=p_tecnico_id and insumo_id=p_insumo_id;
    v_antes := v_tech_antes; v_despues := v_tech_despues; v_mov := -p_cantidad;
  elsif p_tipo = 'DEVOLUCION' then
    select existencia into v_tech_antes from public.inventario_stock_tecnicos where tenant_id=v_tenant and tecnico_id=p_tecnico_id and insumo_id=p_insumo_id for update;
    if coalesce(v_tech_antes,0) < p_cantidad then raise exception 'El técnico no tiene suficiente stock para devolver'; end if;
    update public.inventario_stock_tecnicos set existencia=existencia-p_cantidad, updated_at=now()
    where tenant_id=v_tenant and tecnico_id=p_tecnico_id and insumo_id=p_insumo_id;
    update public.inventario_insumos set existencia=v_despues, updated_at=now() where id=p_insumo_id and tenant_id=v_tenant;
  else
    if v_despues < 0 then raise exception 'El ajuste dejaría el inventario en negativo'; end if;
    update public.inventario_insumos set existencia=v_despues, updated_at=now() where id=p_insumo_id and tenant_id=v_tenant;
  end if;

  insert into public.inventario_movimientos(tenant_id,usuario_id,usuario_nombre,tipo,insumo_id,tecnico_id,cantidad,movimiento,existencia_anterior,existencia_posterior,origen,destino,opr_ot_relacionado,observacion)
  values(v_tenant,v_usuario,v_usuario_nombre,p_tipo,p_insumo_id,p_tecnico_id,p_cantidad,v_mov,v_antes,v_despues,
    case when p_tipo='SALIDA_TECNICO' then 'Bodega Central' when p_tipo in ('CONSUMO_OPR','DEVOLUCION') then 'Stock Técnico' else 'Proveedor/Bodega' end,
    case when p_tipo='SALIDA_TECNICO' then 'Stock Técnico' when p_tipo='CONSUMO_OPR' then 'OPR' else 'Bodega Central' end,
    p_opr_ot,p_observacion,p_serial);

  insert into public.inventario_log_auditoria(tenant_id,usuario_id,usuario_nombre,accion,entidad,entidad_id,detalle)
  values(v_tenant,v_usuario,v_usuario_nombre,p_tipo,'inventario_insumos',p_insumo_id::text,
    jsonb_build_object('cantidad',p_cantidad,'movimiento',v_mov,'opr_ot',p_opr_ot,'tecnico_id',p_tecnico_id,'observacion',p_observacion,'serial',p_serial));

  return jsonb_build_object('ok',true,'tipo',p_tipo,'insumo_id',p_insumo_id,'existencia_anterior',v_antes,'existencia_posterior',v_despues);
end;
$$;

revoke all on function public.registrar_movimiento_inventario(uuid,text,numeric,text,text,text,text) from public;
grant execute on function public.registrar_movimiento_inventario(uuid,text,numeric,text,text,text,text) to authenticated;
revoke insert, update, delete on public.inventario_movimientos from authenticated;
revoke insert, update, delete on public.inventario_log_auditoria from authenticated;

create or replace function public.set_inventario_updated_at()
returns trigger language plpgsql set search_path=''
as $$ begin new.updated_at=now(); return new; end $$;

drop trigger if exists trg_inventario_insumos_updated_at on public.inventario_insumos;
create trigger trg_inventario_insumos_updated_at before update on public.inventario_insumos for each row execute function public.set_inventario_updated_at();
drop trigger if exists trg_inventario_reab_updated_at on public.inventario_reabastecimientos;
create trigger trg_inventario_reab_updated_at before update on public.inventario_reabastecimientos for each row execute function public.set_inventario_updated_at();

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventario_insumos') then alter publication supabase_realtime add table public.inventario_insumos; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventario_stock_tecnicos') then alter publication supabase_realtime add table public.inventario_stock_tecnicos; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventario_movimientos') then alter publication supabase_realtime add table public.inventario_movimientos; end if;
end $$;
