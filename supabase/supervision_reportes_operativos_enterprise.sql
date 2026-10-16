-- ALARVIX | Reportes operativos enterprise
-- Mantiene las revistas de supervisión separadas de las rondas operativas de guardas.
begin;

alter table public.supervision_revistas add column if not exists codigo_checkin text;

do $$
begin
 if to_regprocedure('public.supervision_checkin_legacy(uuid,text,double precision,double precision,text)') is null then
  alter function public.supervision_checkin(uuid,text,double precision,double precision,text) rename to supervision_checkin_legacy;
 end if;
end $$;

create or replace function public.supervision_checkin(
 p_instalacion uuid,p_metodo text,p_lat double precision default null,p_lng double precision default null,p_codigo text default null
) returns public.supervision_revistas
language plpgsql security definer set search_path=public as $$
declare v_row public.supervision_revistas;
begin
 select * into v_row from public.supervision_checkin_legacy(p_instalacion,p_metodo,p_lat,p_lng,p_codigo);
 update public.supervision_revistas
 set codigo_checkin=case when p_metodo in ('QR','NFC') then nullif(trim(coalesce(p_codigo,'')),'') else null end
 where id=v_row.id returning * into v_row;
 return v_row;
end $$;
revoke all on function public.supervision_checkin_legacy(uuid,text,double precision,double precision,text) from public,anon,authenticated;
revoke all on function public.supervision_checkin(uuid,text,double precision,double precision,text) from public,anon;
grant execute on function public.supervision_checkin(uuid,text,double precision,double precision,text) to authenticated;

create table if not exists public.supervision_rutas_operativas(
 id uuid primary key default gen_random_uuid(),tenant_id text not null,
 instalacion_id uuid not null references public.supervision_instalaciones(id) on delete restrict,
 nombre text not null,descripcion text,
 tiempo_estimado_minutos integer not null default 30 check(tiempo_estimado_minutos between 1 and 1440),
 activo boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(tenant_id,id)
);
create table if not exists public.supervision_ruta_puntos(
 id uuid primary key default gen_random_uuid(),tenant_id text not null,
 ruta_id uuid not null references public.supervision_rutas_operativas(id) on delete restrict,
 activo_id uuid not null references public.supervision_activos(id) on delete restrict,
 orden integer not null check(orden>0),obligatorio boolean not null default true,created_at timestamptz not null default now(),
 unique(tenant_id,ruta_id,orden),unique(tenant_id,ruta_id,activo_id)
);
create table if not exists public.supervision_rondas_operativas(
 id uuid primary key default gen_random_uuid(),tenant_id text not null,
 ruta_id uuid not null references public.supervision_rutas_operativas(id) on delete restrict,
 instalacion_id uuid not null references public.supervision_instalaciones(id) on delete restrict,
 guarda_id uuid,guarda_nombre text,programada_at timestamptz not null default now(),
 iniciada_at timestamptz,finalizada_at timestamptz,
 estado text not null default 'Programada' check(estado in('Programada','En curso','Completada','Omitida','Cancelada')),
 observaciones text,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.supervision_ronda_marcajes(
 id uuid primary key default gen_random_uuid(),tenant_id text not null,
 ronda_id uuid not null references public.supervision_rondas_operativas(id) on delete restrict,
 punto_ruta_id uuid not null references public.supervision_ruta_puntos(id) on delete restrict,
 activo_id uuid not null references public.supervision_activos(id) on delete restrict,
 metodo text not null check(metodo in('QR','NFC')),marcado_at timestamptz not null default now(),
 latitud double precision,longitud double precision,distancia_m double precision,
 metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);
create index if not exists idx_sup_report_revistas_tenant_fecha on public.supervision_revistas(tenant_id,created_at desc) where eliminado_at is null;
create index if not exists idx_sup_report_rondas_tenant_programada on public.supervision_rondas_operativas(tenant_id,programada_at desc);
create index if not exists idx_sup_report_marcajes_tenant_ronda on public.supervision_ronda_marcajes(tenant_id,ronda_id,marcado_at);
create index if not exists idx_sup_report_puntos_ruta on public.supervision_ruta_puntos(tenant_id,ruta_id,orden);

alter table public.supervision_rutas_operativas enable row level security;
alter table public.supervision_ruta_puntos enable row level security;
alter table public.supervision_rondas_operativas enable row level security;
alter table public.supervision_ronda_marcajes enable row level security;

drop policy if exists sup_report_routes_select on public.supervision_rutas_operativas;
drop policy if exists sup_report_routes_insert on public.supervision_rutas_operativas;
drop policy if exists sup_report_routes_update on public.supervision_rutas_operativas;
create policy sup_report_routes_select on public.supervision_rutas_operativas for select to authenticated using(tenant_id=public.sup_tenant() and public.sup_can_read() and public.sup_site_ok(instalacion_id));
create policy sup_report_routes_insert on public.supervision_rutas_operativas for insert to authenticated with check(tenant_id=public.sup_tenant() and public.sup_is_admin() and public.sup_site_ok(instalacion_id));
create policy sup_report_routes_update on public.supervision_rutas_operativas for update to authenticated using(tenant_id=public.sup_tenant() and public.sup_is_admin() and public.sup_site_ok(instalacion_id)) with check(tenant_id=public.sup_tenant() and public.sup_is_admin() and public.sup_site_ok(instalacion_id));

drop policy if exists sup_report_route_points_select on public.supervision_ruta_puntos;
drop policy if exists sup_report_route_points_insert on public.supervision_ruta_puntos;
drop policy if exists sup_report_route_points_update on public.supervision_ruta_puntos;
create policy sup_report_route_points_select on public.supervision_ruta_puntos for select to authenticated using(
 tenant_id=public.sup_tenant() and public.sup_can_read() and exists(select 1 from public.supervision_rutas_operativas r where r.id=ruta_id and r.tenant_id=supervision_ruta_puntos.tenant_id and public.sup_site_ok(r.instalacion_id)));
create policy sup_report_route_points_insert on public.supervision_ruta_puntos for insert to authenticated with check(
 tenant_id=public.sup_tenant() and public.sup_is_admin() and exists(select 1 from public.supervision_rutas_operativas r where r.id=ruta_id and r.tenant_id=supervision_ruta_puntos.tenant_id and public.sup_site_ok(r.instalacion_id)));
create policy sup_report_route_points_update on public.supervision_ruta_puntos for update to authenticated using(
 tenant_id=public.sup_tenant() and public.sup_is_admin() and exists(select 1 from public.supervision_rutas_operativas r where r.id=ruta_id and r.tenant_id=supervision_ruta_puntos.tenant_id and public.sup_site_ok(r.instalacion_id)))
 with check(tenant_id=public.sup_tenant() and public.sup_is_admin() and exists(select 1 from public.supervision_rutas_operativas r where r.id=ruta_id and r.tenant_id=supervision_ruta_puntos.tenant_id and public.sup_site_ok(r.instalacion_id)));

drop policy if exists sup_report_rounds_select on public.supervision_rondas_operativas;
drop policy if exists sup_report_rounds_insert on public.supervision_rondas_operativas;
drop policy if exists sup_report_rounds_update on public.supervision_rondas_operativas;
create policy sup_report_rounds_select on public.supervision_rondas_operativas for select to authenticated using(tenant_id=public.sup_tenant() and public.sup_can_read() and public.sup_site_ok(instalacion_id));
create policy sup_report_rounds_insert on public.supervision_rondas_operativas for insert to authenticated with check(tenant_id=public.sup_tenant() and public.sup_can_report() and public.sup_site_ok(instalacion_id));
create policy sup_report_rounds_update on public.supervision_rondas_operativas for update to authenticated using(tenant_id=public.sup_tenant() and public.sup_is_staff() and public.sup_site_ok(instalacion_id)) with check(tenant_id=public.sup_tenant() and public.sup_is_staff() and public.sup_site_ok(instalacion_id));

drop policy if exists sup_report_marks_select on public.supervision_ronda_marcajes;
drop policy if exists sup_report_marks_insert on public.supervision_ronda_marcajes;
drop policy if exists sup_report_marks_update on public.supervision_ronda_marcajes;
create policy sup_report_marks_select on public.supervision_ronda_marcajes for select to authenticated using(
 tenant_id=public.sup_tenant() and public.sup_can_read() and exists(select 1 from public.supervision_rondas_operativas ro where ro.id=ronda_id and ro.tenant_id=supervision_ronda_marcajes.tenant_id and public.sup_site_ok(ro.instalacion_id)));
create policy sup_report_marks_insert on public.supervision_ronda_marcajes for insert to authenticated with check(
 tenant_id=public.sup_tenant() and public.sup_can_report() and exists(select 1 from public.supervision_rondas_operativas ro where ro.id=ronda_id and ro.tenant_id=supervision_ronda_marcajes.tenant_id and public.sup_site_ok(ro.instalacion_id)));
create policy sup_report_marks_update on public.supervision_ronda_marcajes for update to authenticated using(
 tenant_id=public.sup_tenant() and public.sup_is_staff() and exists(select 1 from public.supervision_rondas_operativas ro where ro.id=ronda_id and ro.tenant_id=supervision_ronda_marcajes.tenant_id and public.sup_site_ok(ro.instalacion_id)))
 with check(tenant_id=public.sup_tenant() and public.sup_is_staff() and exists(select 1 from public.supervision_rondas_operativas ro where ro.id=ronda_id and ro.tenant_id=supervision_ronda_marcajes.tenant_id and public.sup_site_ok(ro.instalacion_id)));

grant select,insert,update on public.supervision_rutas_operativas to authenticated;
grant select,insert,update on public.supervision_ruta_puntos to authenticated;
grant select,insert,update on public.supervision_rondas_operativas to authenticated;
grant select,insert,update on public.supervision_ronda_marcajes to authenticated;
commit;
