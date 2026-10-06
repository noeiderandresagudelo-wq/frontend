-- ALARVIX | SUPERVISIÓN E INCIDENCIAS | INSTALACIÓN COMPLETA
-- Ejecutar este archivo completo en Supabase SQL Editor.
-- Incluye esquema base + hardening Fase 1.
-- ================================================================

-- ALARVIX | Módulo integral de Supervisión e Incidencias
-- Arquitectura nativa: Supabase/PostgreSQL + Vercel + Mobile/Capacitor.
-- Requisitos cubiertos: instalaciones, activos, novedades, SLAs, revistas,
-- turnos, geocercas, evidencias, offline sync, auditoría y anomalías.

create extension if not exists pgcrypto;

create table if not exists public.supervision_instalaciones (
  id uuid primary key default gen_random_uuid(), tenant_id text not null,
  nombre text not null, direccion text, ciudad text,
  latitud double precision, longitud double precision,
  geocerca_radio_m integer not null default 100 check (geocerca_radio_m > 0),
  estado text not null default 'Activa' check (estado in ('Activa','Inactiva')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.supervision_activos (
  id uuid primary key default gen_random_uuid(), tenant_id text not null,
  instalacion_id uuid not null references public.supervision_instalaciones(id) on delete restrict,
  nombre_activo text not null, codigo_activo text, tipo_activo text, ubicacion_detalle text,
  estado text not null default 'Operativo' check (estado in ('Operativo','Mantenimiento','Fuera de servicio')),
  qr_codigo text, nfc_codigo text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, codigo_activo)
);

create table if not exists public.supervision_novedades (
  id uuid primary key default gen_random_uuid(), tenant_id text not null,
  numero_ticket bigint generated always as identity,
  instalacion_id uuid not null references public.supervision_instalaciones(id) on delete restrict,
  activo_id uuid references public.supervision_activos(id) on delete restrict,
  tipo_novedad text not null,
  criticidad text not null default 'Media' check (criticidad in ('Baja','Media','Alta','Crítica')),
  estado_ticket text not null default 'Abierto' check (estado_ticket in ('Abierto','En proceso','Cerrado')),
  descripcion text not null, causa_raiz text, solucion text,
  responsable_id uuid, responsable_nombre text, creado_por uuid,
  fecha_asignacion timestamptz, fecha_inicio timestamptz, fecha_cierre timestamptz,
  sla_limite timestamptz, metodo_verificacion text,
  latitud_registro double precision, longitud_registro double precision,
  metadata jsonb not null default '{}'::jsonb, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.supervision_tipos_novedad (
  id uuid primary key default gen_random_uuid(), tenant_id text not null,
  nombre text not null, descripcion text, activo boolean not null default true,
  created_at timestamptz not null default now(), unique (tenant_id, nombre)
);

create table if not exists public.supervision_novedad_historial (
  id uuid primary key default gen_random_uuid(), tenant_id text not null,
  novedad_id uuid not null references public.supervision_novedades(id) on delete restrict,
  estado_anterior text, estado_nuevo text not null, accion text not null, comentario text,
  realizado_por uuid, realizado_por_nombre text, created_at timestamptz not null default now()
);

create table if not exists public.supervision_mantenimientos (
  id uuid primary key default gen_random_uuid(), tenant_id text not null,
  activo_id uuid not null references public.supervision_activos(id) on delete restrict,
  novedad_id uuid references public.supervision_novedades(id) on delete restrict,
  tipo_mantenimiento text not null, descripcion text, tecnico_id uuid,
  fecha_inicio timestamptz, fecha_fin timestamptz, resultado text,
  evidencia jsonb not null default '[]'::jsonb, created_at timestamptz not null default now()
);

create table if not exists public.supervision_instalacion_usuarios (
  id uuid primary key default gen_random_uuid(), tenant_id text not null,
  instalacion_id uuid not null references public.supervision_instalaciones(id) on delete cascade,
  usuario_id uuid not null, rol text not null check (rol in ('supervisor','auditor','administrador')),
  activo boolean not null default true, created_at timestamptz not null default now(),
  unique (tenant_id, instalacion_id, usuario_id)
);

create table if not exists public.supervision_turnos (
  id uuid primary key default gen_random_uuid(), tenant_id text not null,
  nombre text not null, hora_inicio time not null, hora_fin time not null,
  frecuencia_revistas integer not null default 1 check (frecuencia_revistas > 0),
  activo boolean not null default true, created_at timestamptz not null default now()
);

create table if not exists public.supervision_turnos_usuarios (
  id uuid primary key default gen_random_uuid(), tenant_id text not null,
  turno_id uuid not null references public.supervision_turnos(id) on delete cascade,
  usuario_id uuid not null, fecha date not null, created_at timestamptz not null default now(),
  unique (tenant_id, turno_id, usuario_id, fecha)
);

create table if not exists public.supervision_revistas (
  id uuid primary key default gen_random_uuid(), tenant_id text not null,
  numero_revista bigint generated always as identity,
  instalacion_id uuid not null references public.supervision_instalaciones(id) on delete restrict,
  supervisor_id uuid not null, turno_id uuid references public.supervision_turnos(id) on delete restrict,
  fecha_programada timestamptz, fecha_checkin timestamptz, fecha_cierre timestamptz,
  estado text not null default 'Pendiente' check (estado in ('Pendiente','En curso','Completada','Incidencia')),
  metodo_checkin text check (metodo_checkin in ('GPS','QR','NFC')),
  latitud_checkin double precision, longitud_checkin double precision, distancia_checkin_m double precision,
  observaciones text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create table if not exists public.supervision_evidencias (
  id uuid primary key default gen_random_uuid(), tenant_id text not null,
  novedad_id uuid references public.supervision_novedades(id) on delete restrict,
  revista_id uuid references public.supervision_revistas(id) on delete restrict,
  activo_id uuid references public.supervision_activos(id) on delete restrict,
  storage_path text not null, nombre_archivo text, mime_type text, tamano_bytes bigint,
  sha256 text, latitud double precision, longitud double precision, captured_at timestamptz,
  created_by uuid, created_at timestamptz not null default now(),
  check (novedad_id is not null or revista_id is not null or activo_id is not null)
);

create table if not exists public.supervision_sync_queue (
  id uuid primary key default gen_random_uuid(), tenant_id text not null, usuario_id uuid not null,
  device_id text not null, client_event_id text not null, entity_type text not null,
  entity_id uuid, operation text not null check (operation in ('insert','update','delete')),
  payload jsonb not null, client_version integer not null default 1,
  status text not null default 'pending' check (status in ('pending','processing','synced','conflict','failed')),
  attempts integer not null default 0, last_error text, created_at timestamptz not null default now(),
  processed_at timestamptz, unique (tenant_id, device_id, client_event_id)
);

create table if not exists public.supervision_audit_logs (
  id uuid primary key default gen_random_uuid(), tenant_id text not null, usuario_id uuid,
  usuario_nombre text, entidad text not null, entidad_id uuid, accion text not null,
  valor_anterior jsonb, valor_nuevo jsonb, ip_hash text, user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.supervision_anomalias (
  id uuid primary key default gen_random_uuid(), tenant_id text not null, usuario_id uuid,
  instalacion_id uuid references public.supervision_instalaciones(id) on delete restrict,
  revista_id uuid references public.supervision_revistas(id) on delete restrict,
  tipo_anomalia text not null, severidad text not null default 'Media'
    check (severidad in ('Baja','Media','Alta','Crítica')),
  descripcion text not null, datos jsonb not null default '{}'::jsonb,
  estado text not null default 'Pendiente' check (estado in ('Pendiente','Revisada','Descartada')),
  created_at timestamptz not null default now()
);

create index if not exists idx_sup_inst_tenant on public.supervision_instalaciones(tenant_id);
create index if not exists idx_sup_act_tenant_inst on public.supervision_activos(tenant_id, instalacion_id);
create index if not exists idx_sup_nov_tenant_estado on public.supervision_novedades(tenant_id, estado_ticket, criticidad);
create index if not exists idx_sup_nov_inst_activo on public.supervision_novedades(instalacion_id, activo_id);
create index if not exists idx_sup_nov_sla on public.supervision_novedades(tenant_id, sla_limite) where estado_ticket <> 'Cerrado';
create index if not exists idx_sup_hist_nov on public.supervision_novedad_historial(novedad_id, created_at desc);
create index if not exists idx_sup_rev_tenant_fecha on public.supervision_revistas(tenant_id, fecha_checkin desc);
create index if not exists idx_sup_evid_nov on public.supervision_evidencias(novedad_id);
create index if not exists idx_sup_sync_status on public.supervision_sync_queue(tenant_id, status, created_at);
create index if not exists idx_sup_audit_entity on public.supervision_audit_logs(tenant_id, entidad, entidad_id, created_at desc);
create index if not exists idx_sup_anom_status on public.supervision_anomalias(tenant_id, estado, severidad);

create or replace function public.supervision_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_sup_inst_updated on public.supervision_instalaciones;
create trigger trg_sup_inst_updated before update on public.supervision_instalaciones
for each row execute function public.supervision_touch_updated_at();
drop trigger if exists trg_sup_act_updated on public.supervision_activos;
create trigger trg_sup_act_updated before update on public.supervision_activos
for each row execute function public.supervision_touch_updated_at();
drop trigger if exists trg_sup_nov_updated on public.supervision_novedades;
create trigger trg_sup_nov_updated before update on public.supervision_novedades
for each row execute function public.supervision_touch_updated_at();

create or replace function public.supervision_validar_transicion_novedad()
returns trigger language plpgsql as $$
begin
  if old.estado_ticket = 'Cerrado' and new.estado_ticket <> 'Cerrado' then
    raise exception 'Un ticket cerrado no puede reabrirse desde este flujo';
  end if;
  if new.estado_ticket = 'Cerrado' then
    if nullif(trim(coalesce(new.causa_raiz,'')), '') is null
       or nullif(trim(coalesce(new.solucion,'')), '') is null then
      raise exception 'Un ticket no puede cerrarse sin causa raíz y solución';
    end if;
    if new.fecha_cierre is null then new.fecha_cierre = now(); end if;
  end if;
  new.version = coalesce(old.version,1) + 1;
  return new;
end;
$$;

drop trigger if exists trg_sup_nov_transition on public.supervision_novedades;
create trigger trg_sup_nov_transition before update on public.supervision_novedades
for each row execute function public.supervision_validar_transicion_novedad();

create or replace function public.supervision_audit_novedad()
returns trigger language plpgsql security definer as $$
begin
  insert into public.supervision_audit_logs(
    tenant_id, usuario_id, entidad, entidad_id, accion, valor_anterior, valor_nuevo
  ) values (
    coalesce(new.tenant_id, old.tenant_id), auth.uid(), 'supervision_novedades',
    coalesce(new.id, old.id), tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sup_nov_audit on public.supervision_novedades;
create trigger trg_sup_nov_audit after insert or update or delete on public.supervision_novedades
for each row execute function public.supervision_audit_novedad();

alter table public.supervision_instalaciones enable row level security;
alter table public.supervision_activos enable row level security;
alter table public.supervision_novedades enable row level security;
alter table public.supervision_tipos_novedad enable row level security;
alter table public.supervision_novedad_historial enable row level security;
alter table public.supervision_mantenimientos enable row level security;
alter table public.supervision_instalacion_usuarios enable row level security;
alter table public.supervision_turnos enable row level security;
alter table public.supervision_turnos_usuarios enable row level security;
alter table public.supervision_revistas enable row level security;
alter table public.supervision_evidencias enable row level security;
alter table public.supervision_sync_queue enable row level security;
alter table public.supervision_audit_logs enable row level security;
alter table public.supervision_anomalias enable row level security;

do $$
declare t text;
begin
  foreach t in array ARRAY[
    'supervision_instalaciones','supervision_activos','supervision_novedades',
    'supervision_tipos_novedad','supervision_novedad_historial','supervision_mantenimientos',
    'supervision_instalacion_usuarios','supervision_turnos','supervision_turnos_usuarios',
    'supervision_revistas','supervision_evidencias','supervision_sync_queue',
    'supervision_audit_logs','supervision_anomalias'
  ] loop
    execute format('drop policy if exists "sup_select_tenant" on public.%I',t);
    execute format('create policy "sup_select_tenant" on public.%I for select to authenticated using (tenant_id = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id''))',t);
    execute format('drop policy if exists "sup_insert_tenant" on public.%I',t);
    execute format('create policy "sup_insert_tenant" on public.%I for insert to authenticated with check (tenant_id = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id''))',t);
    execute format('drop policy if exists "sup_update_tenant" on public.%I',t);
    execute format('create policy "sup_update_tenant" on public.%I for update to authenticated using (tenant_id = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id'')) with check (tenant_id = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id''))',t);
  end loop;
end $$;

-- 20. POLÍTICAS SLA CONFIGURABLES
create table if not exists public.supervision_sla_politicas (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  nombre text not null,
  criticidad text not null check (criticidad in ('Baja','Media','Alta','Crítica')),
  minutos_respuesta integer not null check (minutos_respuesta >= 0),
  minutos_resolucion integer not null check (minutos_resolucion > 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, nombre, criticidad)
);

-- 21. NOTIFICACIONES INTERNAS
create table if not exists public.supervision_notificaciones (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  usuario_id uuid not null,
  tipo text not null,
  titulo text not null,
  mensaje text not null,
  entidad text,
  entidad_id uuid,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

-- 22. CHECKLISTS DE REVISTA
create table if not exists public.supervision_checklists (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, nombre)
);

create table if not exists public.supervision_checklist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  checklist_id uuid not null references public.supervision_checklists(id) on delete cascade,
  texto text not null,
  obligatorio boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.supervision_revista_respuestas (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  revista_id uuid not null references public.supervision_revistas(id) on delete cascade,
  item_id uuid not null references public.supervision_checklist_items(id) on delete restrict,
  resultado text not null check (resultado in ('Cumple','No cumple','No aplica')),
  observacion text,
  evidencia_id uuid references public.supervision_evidencias(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (revista_id, item_id)
);

create index if not exists idx_sup_sla_tenant on public.supervision_sla_politicas(tenant_id, activo, criticidad);
create index if not exists idx_sup_notif_user on public.supervision_notificaciones(tenant_id, usuario_id, leida, created_at desc);
create index if not exists idx_sup_checklist_tenant on public.supervision_checklists(tenant_id, activo);
create index if not exists idx_sup_check_items on public.supervision_checklist_items(checklist_id, orden);
create index if not exists idx_sup_review_answers on public.supervision_revista_respuestas(revista_id);

alter table public.supervision_sla_politicas enable row level security;
alter table public.supervision_notificaciones enable row level security;
alter table public.supervision_checklists enable row level security;
alter table public.supervision_checklist_items enable row level security;
alter table public.supervision_revista_respuestas enable row level security;

do $$
declare t text;
begin
  foreach t in array ARRAY[
    'supervision_sla_politicas','supervision_notificaciones','supervision_checklists',
    'supervision_checklist_items','supervision_revista_respuestas'
  ] loop
    execute format('drop policy if exists "sup_select_tenant" on public.%I',t);
    execute format('create policy "sup_select_tenant" on public.%I for select to authenticated using (tenant_id = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id''))',t);
    execute format('drop policy if exists "sup_insert_tenant" on public.%I',t);
    execute format('create policy "sup_insert_tenant" on public.%I for insert to authenticated with check (tenant_id = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id''))',t);
    execute format('drop policy if exists "sup_update_tenant" on public.%I',t);
    execute format('create policy "sup_update_tenant" on public.%I for update to authenticated using (tenant_id = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id'')) with check (tenant_id = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id''))',t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array ARRAY[
    'supervision_novedades','supervision_revistas','supervision_notificaciones'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ================================================================
-- FASE 1: SEGURIDAD E INTEGRIDAD
-- ================================================================

-- ALARVIX | Supervisión e Incidencias — FASE 1: seguridad e integridad
--
-- REQUISITO: haber ejecutado antes supervision_incidencias_integral.sql
--            (con el bloque final corregido: "do $$ ... end $$;").
-- Es aditivo e idempotente: se puede ejecutar más de una vez.
-- Corre en UNA transacción: si algo falla, no se aplica nada.
--
-- Qué hace:
--  1. Helpers de JWT (tenant, rol, asignación a instalación).
--  2. Reemplaza las políticas RLS genéricas por políticas por rol.
--  3. Auditoría en todas las tablas núcleo + inmutabilidad de logs e historial.
--  4. Eliminación lógica (columnas eliminado_*) y bloqueo de DELETE físico.
--  5. Máquina de estados de novedades + historial automático.
--  6. creado_por seguro y coherencia activo/instalación en novedades.
--  7. Check-in validado en el servidor (RPC supervision_checkin) + anti-duplicidad.

begin;

-- ---------------------------------------------------------------------------
-- 1. HELPERS
-- ---------------------------------------------------------------------------
create or replace function public.sup_tenant() returns text
language sql stable set search_path = public as $$
  select auth.jwt() -> 'app_metadata' ->> 'tenant_id'
$$;

create or replace function public.sup_role() returns text
language sql stable set search_path = public as $$
  select lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', ''))
$$;

-- Roles que pueden LEER datos de supervisión (el rol client queda fuera).
create or replace function public.sup_can_read() returns boolean
language sql stable set search_path = public as $$
  select public.sup_role() in ('admin','manager','supervisor','viewer','technician')
$$;

-- Roles que pueden REPORTAR (novedades, evidencias, mantenimientos).
create or replace function public.sup_can_report() returns boolean
language sql stable set search_path = public as $$
  select public.sup_role() in ('admin','manager','supervisor','technician')
$$;

-- Roles operativos de supervisión.
create or replace function public.sup_is_staff() returns boolean
language sql stable set search_path = public as $$
  select public.sup_role() in ('admin','manager','supervisor')
$$;

-- Roles administrativos (configuración).
create or replace function public.sup_is_admin() returns boolean
language sql stable set search_path = public as $$
  select public.sup_role() in ('admin','manager')
$$;

-- ¿Puede el usuario actual operar sobre esta instalación?
-- Modo compatible: un supervisor SIN asignaciones activas conserva acceso a
-- todo el tenant (para no romper instalaciones existentes). En cuanto se le
-- asigna al menos una instalación en supervision_instalacion_usuarios, queda
-- restringido a las asignadas.
create or replace function public.sup_site_ok(p_instalacion uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.sup_role() in ('admin','manager','viewer','technician') then true
    when public.sup_role() = 'supervisor' then
      not exists (
        select 1 from public.supervision_instalacion_usuarios u
        where u.tenant_id = public.sup_tenant() and u.usuario_id = auth.uid() and u.activo
      )
      or exists (
        select 1 from public.supervision_instalacion_usuarios u
        where u.tenant_id = public.sup_tenant() and u.usuario_id = auth.uid()
          and u.activo and u.instalacion_id = p_instalacion
      )
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- 2. ELIMINACIÓN LÓGICA: columnas
-- ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array[
    'supervision_instalaciones','supervision_activos','supervision_novedades',
    'supervision_revistas','supervision_evidencias','supervision_mantenimientos'
  ] loop
    execute format('alter table public.%I add column if not exists eliminado_at timestamptz', t);
    execute format('alter table public.%I add column if not exists eliminado_por uuid', t);
  end loop;
end
$do$;

-- ---------------------------------------------------------------------------
-- 3. FUNCIONES DE INTEGRIDAD (bloqueos)
-- ---------------------------------------------------------------------------
create or replace function public.supervision_block_delete() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Eliminación física no permitida en %. Use eliminación lógica (eliminado_at).', tg_table_name
    using errcode = '42501';
end
$$;

create or replace function public.supervision_block_mutation() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'Los registros de % son inmutables.', tg_table_name using errcode = '42501';
end
$$;

do $do$
declare t text;
begin
  foreach t in array array[
    'supervision_instalaciones','supervision_activos','supervision_novedades',
    'supervision_revistas','supervision_evidencias','supervision_mantenimientos'
  ] loop
    execute format('drop trigger if exists trg_sup_nodelete on public.%I', t);
    execute format('create trigger trg_sup_nodelete before delete on public.%I for each row execute function public.supervision_block_delete()', t);
  end loop;

  foreach t in array array['supervision_audit_logs','supervision_novedad_historial'] loop
    execute format('drop trigger if exists trg_sup_immutable on public.%I', t);
    execute format('create trigger trg_sup_immutable before update or delete on public.%I for each row execute function public.supervision_block_mutation()', t);
  end loop;
end
$do$;

-- ---------------------------------------------------------------------------
-- 4. AUDITORÍA GENÉRICA (valor anterior / nuevo / usuario)
-- ---------------------------------------------------------------------------
create or replace function public.supervision_audit_generic() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
begin
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);

  insert into public.supervision_audit_logs(
    tenant_id, usuario_id, entidad, entidad_id, accion, valor_anterior, valor_nuevo
  ) values (
    v_row ->> 'tenant_id', auth.uid(), tg_table_name, (v_row ->> 'id')::uuid, tg_op, v_old, v_new
  );
  return null;
end
$$;

-- El trigger de auditoría anterior (solo novedades) se reemplaza por el genérico.
drop trigger if exists trg_sup_nov_audit on public.supervision_novedades;

do $do$
declare t text;
begin
  foreach t in array array[
    'supervision_instalaciones','supervision_activos','supervision_novedades',
    'supervision_mantenimientos','supervision_instalacion_usuarios','supervision_turnos',
    'supervision_turnos_usuarios','supervision_revistas','supervision_evidencias',
    'supervision_anomalias','supervision_sla_politicas','supervision_tipos_novedad',
    'supervision_checklists','supervision_checklist_items'
  ] loop
    execute format('drop trigger if exists trg_sup_audit on public.%I', t);
    execute format('create trigger trg_sup_audit after insert or update or delete on public.%I for each row execute function public.supervision_audit_generic()', t);
  end loop;
end
$do$;

-- ---------------------------------------------------------------------------
-- 5. NOVEDADES: creado_por seguro, coherencia activo/instalación,
--    máquina de estados e historial automático
-- ---------------------------------------------------------------------------
create or replace function public.supervision_novedad_before_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then new.creado_por := auth.uid(); end if;
  if new.activo_id is not null and not exists (
    select 1 from public.supervision_activos a
    where a.id = new.activo_id and a.instalacion_id = new.instalacion_id
  ) then
    raise exception 'El activo seleccionado no pertenece a la instalación indicada.';
  end if;
  return new;
end
$$;

drop trigger if exists trg_sup_nov_before_insert on public.supervision_novedades;
create trigger trg_sup_nov_before_insert before insert on public.supervision_novedades
for each row execute function public.supervision_novedad_before_insert();

-- Reemplaza la función existente (el trigger trg_sup_nov_transition ya apunta a ella).
create or replace function public.supervision_validar_transicion_novedad() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.instalacion_id is distinct from old.instalacion_id
     or new.numero_ticket is distinct from old.numero_ticket
     or new.created_at is distinct from old.created_at
     or new.creado_por is distinct from old.creado_por then
    raise exception 'Los datos de origen de la novedad no son modificables.';
  end if;

  if old.estado_ticket = 'Cerrado' then
    if new.estado_ticket is distinct from 'Cerrado' then
      raise exception 'Un ticket cerrado no puede reabrirse desde este flujo.';
    end if;
    if new.descripcion is distinct from old.descripcion
       or new.causa_raiz is distinct from old.causa_raiz
       or new.solucion is distinct from old.solucion
       or new.criticidad is distinct from old.criticidad
       or new.tipo_novedad is distinct from old.tipo_novedad
       or new.activo_id is distinct from old.activo_id
       or new.responsable_id is distinct from old.responsable_id then
      raise exception 'Un ticket cerrado es de solo lectura.';
    end if;
  end if;

  if new.estado_ticket is distinct from old.estado_ticket then
    if not (
      (old.estado_ticket = 'Abierto'    and new.estado_ticket in ('En proceso','Cerrado')) or
      (old.estado_ticket = 'En proceso' and new.estado_ticket = 'Cerrado')
    ) then
      raise exception 'Transición no permitida: % → %', old.estado_ticket, new.estado_ticket;
    end if;
    if new.estado_ticket = 'En proceso' then
      new.fecha_inicio := coalesce(new.fecha_inicio, now());
    end if;
  end if;

  if new.estado_ticket = 'Cerrado' then
    if nullif(trim(coalesce(new.causa_raiz, '')), '') is null
       or nullif(trim(coalesce(new.solucion, '')), '') is null then
      raise exception 'Un ticket no puede cerrarse sin causa raíz y solución.';
    end if;
    if new.fecha_cierre is null then new.fecha_cierre := now(); end if;
  end if;

  new.version := coalesce(old.version, 1) + 1;
  return new;
end
$$;

create or replace function public.supervision_historial_novedad() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.supervision_novedad_historial(
      tenant_id, novedad_id, estado_anterior, estado_nuevo, accion, realizado_por
    ) values (new.tenant_id, new.id, null, new.estado_ticket, 'Creación', auth.uid());
  elsif new.estado_ticket is distinct from old.estado_ticket then
    insert into public.supervision_novedad_historial(
      tenant_id, novedad_id, estado_anterior, estado_nuevo, accion, comentario, realizado_por
    ) values (
      new.tenant_id, new.id, old.estado_ticket, new.estado_ticket, 'Cambio de estado',
      case when new.estado_ticket = 'Cerrado' then new.solucion end, auth.uid()
    );
  end if;
  return null;
end
$$;

drop trigger if exists trg_sup_nov_historial on public.supervision_novedades;
create trigger trg_sup_nov_historial after insert or update on public.supervision_novedades
for each row execute function public.supervision_historial_novedad();

-- ---------------------------------------------------------------------------
-- 6. REVISTAS: guardas anti-alteración y anti-duplicidad
-- ---------------------------------------------------------------------------
create or replace function public.supervision_revista_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.estado = 'Completada'
     and (to_jsonb(new) - 'eliminado_at' - 'eliminado_por')
         is distinct from (to_jsonb(old) - 'eliminado_at' - 'eliminado_por') then
    raise exception 'Una revista completada no puede modificarse.';
  end if;

  if new.tenant_id is distinct from old.tenant_id
     or new.numero_revista is distinct from old.numero_revista
     or new.instalacion_id is distinct from old.instalacion_id
     or new.supervisor_id is distinct from old.supervisor_id
     or new.turno_id is distinct from old.turno_id
     or new.fecha_checkin is distinct from old.fecha_checkin
     or new.metodo_checkin is distinct from old.metodo_checkin
     or new.latitud_checkin is distinct from old.latitud_checkin
     or new.longitud_checkin is distinct from old.longitud_checkin
     or new.distancia_checkin_m is distinct from old.distancia_checkin_m then
    raise exception 'Los datos del check-in no son modificables.';
  end if;

  if new.estado = 'Completada' and new.fecha_cierre is null then
    new.fecha_cierre := now();
  end if;
  return new;
end
$$;

drop trigger if exists trg_sup_revista_guard on public.supervision_revistas;
create trigger trg_sup_revista_guard before update on public.supervision_revistas
for each row execute function public.supervision_revista_guard();

-- Una sola revista "En curso" por supervisor e instalación.
-- Si ya existen duplicados, el índice se omite con un aviso (no rompe la migración).
do $do$
begin
  create unique index if not exists uq_sup_revista_en_curso
    on public.supervision_revistas (tenant_id, instalacion_id, supervisor_id)
    where estado = 'En curso' and eliminado_at is null;
exception when unique_violation then
  raise notice 'Índice uq_sup_revista_en_curso NO creado: hay revistas "En curso" duplicadas. Ciérrelas y vuelva a ejecutar.';
end
$do$;

-- ---------------------------------------------------------------------------
-- 7. CHECK-IN VALIDADO EN SERVIDOR
--    Reemplaza el INSERT directo desde el navegador (que se puede falsear).
-- ---------------------------------------------------------------------------
create or replace function public.supervision_checkin(
  p_instalacion uuid,
  p_metodo text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_codigo text default null
) returns public.supervision_revistas
language plpgsql security definer set search_path = public as $$
declare
  v_tenant text := public.sup_tenant();
  v_uid uuid := auth.uid();
  v_inst public.supervision_instalaciones%rowtype;
  v_dist double precision := 0;
  v_turno uuid;
  v_hora time := (now() at time zone 'America/Bogota')::time;
  v_fecha date := (now() at time zone 'America/Bogota')::date;
  v_row public.supervision_revistas;
begin
  if v_uid is null or v_tenant is null then
    raise exception 'Sesión no válida.' using errcode = '28000';
  end if;
  if not public.sup_is_staff() then
    raise exception 'Sin permiso para registrar revistas.' using errcode = '42501';
  end if;
  if p_metodo is null or p_metodo not in ('GPS','QR','NFC') then
    raise exception 'Método de check-in inválido.';
  end if;

  select * into v_inst
  from public.supervision_instalaciones
  where id = p_instalacion and tenant_id = v_tenant and eliminado_at is null;
  if not found then
    raise exception 'Instalación no encontrada.';
  end if;
  if not public.sup_site_ok(p_instalacion) then
    raise exception 'Instalación no asignada a este supervisor.' using errcode = '42501';
  end if;

  if p_metodo = 'GPS' then
    if p_lat is null or p_lng is null then
      raise exception 'Faltan las coordenadas GPS.';
    end if;
    if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
      raise exception 'Coordenadas GPS fuera de rango.';
    end if;
    if v_inst.latitud is null or v_inst.longitud is null then
      raise exception 'La instalación no tiene coordenadas configuradas.';
    end if;
    v_dist := 2 * 6371000 * asin(least(1, sqrt(
      power(sin(radians(p_lat - v_inst.latitud) / 2), 2)
      + cos(radians(v_inst.latitud)) * cos(radians(p_lat))
        * power(sin(radians(p_lng - v_inst.longitud) / 2), 2)
    )));
    if v_dist > v_inst.geocerca_radio_m then
      raise exception 'Fuera de geocerca: % m (radio permitido % m).', round(v_dist), v_inst.geocerca_radio_m;
    end if;
  else
    if nullif(trim(coalesce(p_codigo, '')), '') is null then
      raise exception 'Falta el código %.', p_metodo;
    end if;
    if not exists (
      select 1 from public.supervision_activos a
      where a.tenant_id = v_tenant and a.instalacion_id = p_instalacion and a.eliminado_at is null
        and ((p_metodo = 'QR'  and a.qr_codigo  = trim(p_codigo))
          or (p_metodo = 'NFC' and a.nfc_codigo = trim(p_codigo)))
    ) then
      raise exception 'Código no válido para esta instalación.';
    end if;
  end if;

  if exists (
    select 1 from public.supervision_revistas r
    where r.tenant_id = v_tenant and r.instalacion_id = p_instalacion
      and r.supervisor_id = v_uid and r.estado = 'En curso' and r.eliminado_at is null
  ) then
    raise exception 'Ya tienes una revista en curso en esta instalación. Complétala antes de marcar otra llegada.';
  end if;

  -- Turno vigente (soporta turnos nocturnos que cruzan medianoche).
  -- Prefiere el turno asignado al usuario hoy; si no hay turno, la revista se registra sin turno.
  select t.id into v_turno
  from public.supervision_turnos t
  left join public.supervision_turnos_usuarios tu
    on tu.turno_id = t.id and tu.usuario_id = v_uid and tu.fecha = v_fecha
  where t.tenant_id = v_tenant and t.activo
    and (
      (t.hora_inicio <= t.hora_fin and v_hora >= t.hora_inicio and v_hora < t.hora_fin)
      or (t.hora_inicio >  t.hora_fin and (v_hora >= t.hora_inicio or v_hora < t.hora_fin))
    )
  order by (tu.id is not null) desc, t.hora_inicio
  limit 1;

  insert into public.supervision_revistas(
    tenant_id, instalacion_id, supervisor_id, turno_id, estado, metodo_checkin,
    latitud_checkin, longitud_checkin, distancia_checkin_m, fecha_checkin
  ) values (
    v_tenant, p_instalacion, v_uid, v_turno, 'En curso', p_metodo,
    p_lat, p_lng, v_dist, now()
  ) returning * into v_row;

  return v_row;
end
$$;

revoke all on function public.supervision_checkin(uuid, text, double precision, double precision, text) from public, anon;
grant execute on function public.supervision_checkin(uuid, text, double precision, double precision, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. POLÍTICAS RLS POR ROL (reemplazan sup_select/insert/update_tenant)
-- ---------------------------------------------------------------------------
do $do$
declare t text; p text;
begin
  foreach t in array array[
    'supervision_instalaciones','supervision_activos','supervision_novedades',
    'supervision_tipos_novedad','supervision_novedad_historial','supervision_mantenimientos',
    'supervision_instalacion_usuarios','supervision_turnos','supervision_turnos_usuarios',
    'supervision_revistas','supervision_evidencias','supervision_sync_queue',
    'supervision_audit_logs','supervision_anomalias','supervision_sla_politicas',
    'supervision_notificaciones','supervision_checklists','supervision_checklist_items',
    'supervision_revista_respuestas'
  ] loop
    foreach p in array array['sup_select_tenant','sup_insert_tenant','sup_update_tenant',
                             'sup2_select','sup2_insert','sup2_update'] loop
      execute format('drop policy if exists %I on public.%I', p, t);
    end loop;
  end loop;
end
$do$;

-- 8.a Configuración: lectura para roles de lectura, escritura solo admin/manager.
do $do$
declare t text;
begin
  foreach t in array array[
    'supervision_tipos_novedad','supervision_turnos','supervision_turnos_usuarios',
    'supervision_instalacion_usuarios','supervision_sla_politicas',
    'supervision_checklists','supervision_checklist_items','supervision_anomalias'
  ] loop
    execute format('create policy sup2_select on public.%I for select to authenticated using (tenant_id = public.sup_tenant() and public.sup_can_read())', t);
    execute format('create policy sup2_insert on public.%I for insert to authenticated with check (tenant_id = public.sup_tenant() and public.sup_is_admin())', t);
    execute format('create policy sup2_update on public.%I for update to authenticated using (tenant_id = public.sup_tenant() and public.sup_is_admin()) with check (tenant_id = public.sup_tenant() and public.sup_is_admin())', t);
  end loop;

  -- 8.b Operación sin instalación directa: reporta cualquier rol operativo, edita staff.
  foreach t in array array['supervision_mantenimientos','supervision_evidencias','supervision_revista_respuestas'] loop
    execute format('create policy sup2_select on public.%I for select to authenticated using (tenant_id = public.sup_tenant() and public.sup_can_read())', t);
    execute format('create policy sup2_insert on public.%I for insert to authenticated with check (tenant_id = public.sup_tenant() and public.sup_can_report())', t);
    execute format('create policy sup2_update on public.%I for update to authenticated using (tenant_id = public.sup_tenant() and public.sup_is_staff()) with check (tenant_id = public.sup_tenant() and public.sup_is_staff())', t);
  end loop;

  -- 8.c Operación ligada a instalación: además exige acceso a esa instalación.
  foreach t in array array['supervision_activos','supervision_novedades'] loop
    execute format('create policy sup2_select on public.%I for select to authenticated using (tenant_id = public.sup_tenant() and public.sup_can_read() and public.sup_site_ok(instalacion_id))', t);
    execute format('create policy sup2_insert on public.%I for insert to authenticated with check (tenant_id = public.sup_tenant() and public.sup_is_staff() and public.sup_site_ok(instalacion_id))', t);
    execute format('create policy sup2_update on public.%I for update to authenticated using (tenant_id = public.sup_tenant() and public.sup_is_staff() and public.sup_site_ok(instalacion_id)) with check (tenant_id = public.sup_tenant() and public.sup_is_staff() and public.sup_site_ok(instalacion_id))', t);
  end loop;
end
$do$;

-- 8.d Instalaciones (geocercas): configuración administrativa.
create policy sup2_select on public.supervision_instalaciones for select to authenticated
  using (tenant_id = public.sup_tenant() and public.sup_can_read() and public.sup_site_ok(id));
create policy sup2_insert on public.supervision_instalaciones for insert to authenticated
  with check (tenant_id = public.sup_tenant() and public.sup_is_admin());
create policy sup2_update on public.supervision_instalaciones for update to authenticated
  using (tenant_id = public.sup_tenant() and public.sup_is_admin())
  with check (tenant_id = public.sup_tenant() and public.sup_is_admin());

-- 8.e Revistas: el INSERT solo ocurre vía RPC supervision_checkin (sin política de insert).
create policy sup2_select on public.supervision_revistas for select to authenticated
  using (tenant_id = public.sup_tenant() and public.sup_can_read() and public.sup_site_ok(instalacion_id));
create policy sup2_update on public.supervision_revistas for update to authenticated
  using (tenant_id = public.sup_tenant() and public.sup_is_staff() and public.sup_site_ok(instalacion_id)
         and (supervisor_id = auth.uid() or public.sup_is_admin()))
  with check (tenant_id = public.sup_tenant() and public.sup_is_staff() and public.sup_site_ok(instalacion_id)
         and (supervisor_id = auth.uid() or public.sup_is_admin()));

-- 8.f Historial y auditoría: solo lectura (los escriben los triggers).
create policy sup2_select on public.supervision_novedad_historial for select to authenticated
  using (tenant_id = public.sup_tenant() and public.sup_can_read());
create policy sup2_select on public.supervision_audit_logs for select to authenticated
  using (tenant_id = public.sup_tenant() and public.sup_is_admin());

-- 8.g Cola offline: cada usuario ve y escribe solo la suya.
create policy sup2_select on public.supervision_sync_queue for select to authenticated
  using (tenant_id = public.sup_tenant() and usuario_id = auth.uid());
create policy sup2_insert on public.supervision_sync_queue for insert to authenticated
  with check (tenant_id = public.sup_tenant() and usuario_id = auth.uid() and public.sup_can_report());
create policy sup2_update on public.supervision_sync_queue for update to authenticated
  using (tenant_id = public.sup_tenant() and usuario_id = auth.uid())
  with check (tenant_id = public.sup_tenant() and usuario_id = auth.uid());

-- 8.h Notificaciones: cada usuario ve y marca como leídas solo las suyas.
create policy sup2_select on public.supervision_notificaciones for select to authenticated
  using (tenant_id = public.sup_tenant() and usuario_id = auth.uid());
create policy sup2_update on public.supervision_notificaciones for update to authenticated
  using (tenant_id = public.sup_tenant() and usuario_id = auth.uid())
  with check (tenant_id = public.sup_tenant() and usuario_id = auth.uid());

-- Privilegios: nadie desde el navegador escribe logs, historial ni notificaciones.
revoke insert, update, delete on public.supervision_audit_logs from anon, authenticated;
revoke insert, update, delete on public.supervision_novedad_historial from anon, authenticated;
revoke insert, delete on public.supervision_notificaciones from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. REALTIME (corrige el bloque original que usaba "$" en vez de "$$")
-- ---------------------------------------------------------------------------
do $do$
declare t text;
begin
  foreach t in array array['supervision_novedades','supervision_revistas','supervision_notificaciones'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$do$;

commit;
