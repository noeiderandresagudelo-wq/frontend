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

do $
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
end $;
