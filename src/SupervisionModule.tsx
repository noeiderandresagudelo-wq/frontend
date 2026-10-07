import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { createAuthedSupabaseClient } from './lib/supabase';
import type { UserRole } from './api';

type Props = { token: string; tenantId: string; role: UserRole };
type Tab = 'resumen'|'novedades'|'revistas'|'auditoria'|'evidencias'|'anomalias'|'configuracion';
type Installation = { id:string; nombre:string; direccion:string|null; ciudad:string|null; latitud:number|null; longitud:number|null; geocerca_radio_m:number; estado:string };
type Asset = { id:string; instalacion_id:string; nombre_activo:string; codigo_activo:string|null; tipo_activo:string|null; estado:string; qr_codigo:string|null; nfc_codigo:string|null };
type Ticket = { id:string; numero_ticket:number; instalacion_id:string; activo_id:string|null; tipo_novedad:string; criticidad:string; estado_ticket:string; descripcion:string; causa_raiz:string|null; solucion:string|null; responsable_nombre:string|null; sla_limite:string|null; created_at:string };
type Review = { id:string; numero_revista:number; instalacion_id:string; supervisor_id:string; turno_id:string|null; estado:string; metodo_checkin:string|null; fecha_checkin:string|null; fecha_cierre:string|null; distancia_checkin_m:number|null; observaciones:string|null };
type Audit = { id:string; usuario_id:string|null; usuario_nombre:string|null; entidad:string; entidad_id:string|null; accion:string; created_at:string };
type Evidence = { id:string; novedad_id:string|null; revista_id:string|null; activo_id:string|null; storage_path:string; nombre_archivo:string|null; mime_type:string|null; tamano_bytes:number|null; latitud:number|null; longitud:number|null; captured_at:string|null; created_at:string };
type Anomaly = { id:string; usuario_id:string|null; instalacion_id:string|null; revista_id:string|null; tipo_anomalia:string; severidad:string; descripcion:string; estado:string; created_at:string };
type Notification = { id:string; tipo:string; titulo:string; mensaje:string; entidad:string|null; entidad_id:string|null; leida:boolean; created_at:string };
type SlaPolicy = { id:string; nombre:string; criticidad:string; minutos_respuesta:number; minutos_resolucion:number; activo:boolean };
type NoveltyType = { id:string; nombre:string; descripcion:string|null; activo:boolean };

const canManage=(r:UserRole)=>['admin','manager','supervisor'].includes(r);

export default function SupervisionModule({token,tenantId,role}:Props){
 const db=useMemo(()=>createAuthedSupabaseClient(token),[token]);
 const [tab,setTab]=useState<Tab>('resumen');
 const [installations,setInstallations]=useState<Installation[]>([]);
 const [assets,setAssets]=useState<Asset[]>([]);
 const [tickets,setTickets]=useState<Ticket[]>([]);
 const [reviews,setReviews]=useState<Review[]>([]);
 const [audits,setAudits]=useState<Audit[]>([]);
 const [evidences,setEvidences]=useState<Evidence[]>([]);
 const [anomalies,setAnomalies]=useState<Anomaly[]>([]);
 const [notifications,setNotifications]=useState<Notification[]>([]);
 const [slaPolicies,setSlaPolicies]=useState<SlaPolicy[]>([]);
 const [noveltyTypes,setNoveltyTypes]=useState<NoveltyType[]>([]);
 const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
 const [selectedInstallation,setSelectedInstallation]=useState('');
 const [showTicket,setShowTicket]=useState(false);
 const [gpsBusy,setGpsBusy]=useState(false);
 const [ticketInst,setTicketInst]=useState('');
 const [showInstallationForm,setShowInstallationForm]=useState(false);
 const [editingInstallation,setEditingInstallation]=useState<Installation|null>(null);
 const offlineKey=`alarvix.supervision.queue.${tenantId}`;

 const refresh=useCallback(async(silent=false)=>{
   if(!silent){setLoading(true); setError('');}
   const [i,a,n,r,au,ev,an,no,sl,nt]=await Promise.all([
     db.from('supervision_instalaciones').select('*').order('nombre'),
     db.from('supervision_activos').select('*').order('nombre_activo'),
     db.from('supervision_novedades').select('*').order('created_at',{ascending:false}).limit(200),
     db.from('supervision_revistas').select('*').order('created_at',{ascending:false}).limit(100),
     db.from('supervision_audit_logs').select('*').order('created_at',{ascending:false}).limit(200),
     db.from('supervision_evidencias').select('*').order('created_at',{ascending:false}).limit(100),
     db.from('supervision_anomalias').select('*').order('created_at',{ascending:false}).limit(100),
     db.from('supervision_notificaciones').select('*').order('created_at',{ascending:false}).limit(50),
     db.from('supervision_sla_politicas').select('*').order('criticidad'),
     db.from('supervision_tipos_novedad').select('*').eq('activo',true).order('nombre')
   ]);
   const errors=[i,a,n,r,au,ev,an,no,sl,nt].filter(x=>x.error); const e=errors[0]?.error;
   if(e) setError(e.message); else {setInstallations(i.data||[]);setAssets(a.data||[]);setTickets(n.data||[]);setReviews(r.data||[]);setAudits(au.data||[]);setEvidences(ev.data||[]);setAnomalies(an.data||[]);setNotifications(no.data||[]);setSlaPolicies(sl.data||[]);setNoveltyTypes(nt.data||[]);}
   if(!silent) setLoading(false);
 },[db]);

 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{
   const onSubmodule=(event:Event)=>{
     const tab=(event as CustomEvent<Tab>).detail;
     if(['resumen','novedades','revistas','auditoria','evidencias','anomalias','configuracion'].includes(tab)) setTab(tab);
   };
   window.addEventListener('alarvix-supervision-submodule',onSubmodule);
   return()=>window.removeEventListener('alarvix-supervision-submodule',onSubmodule);
 },[]);
 const canManageInstallations=role==='admin';
 const saveInstallation=async(event:FormEvent<HTMLFormElement>)=>{
   event.preventDefault();
   if(!canManageInstallations){setError('Solo un administrador puede crear o modificar puestos de supervisión.');return;}
   const data=new FormData(event.currentTarget);
   const payload={
     nombre:String(data.get('nombre')||'').trim(),
     direccion:String(data.get('direccion')||'').trim()||null,
     ciudad:String(data.get('ciudad')||'').trim()||null,
     latitud:data.get('latitud')?Number(data.get('latitud')):null,
     longitud:data.get('longitud')?Number(data.get('longitud')):null,
     geocerca_radio_m:Math.max(25,Number(data.get('geocerca_radio_m')||100)),
     estado:String(data.get('estado')||'Activa')
   };
   if(!payload.nombre){setError('El nombre del puesto es obligatorio.');return;}
   setLoading(true);setError('');
   let e;
   if(editingInstallation){
     const result=await db.from('supervision_instalaciones').update(payload).eq('id',editingInstallation.id);
     e=result.error;
   }else{
     const result=await db.rpc('crear_supervision_instalacion',{
       p_nombre:payload.nombre,
       p_direccion:payload.direccion,
       p_ciudad:payload.ciudad,
       p_latitud:payload.latitud,
       p_longitud:payload.longitud,
       p_geocerca_radio_m:payload.geocerca_radio_m,
       p_estado:payload.estado
     });
     e=result.error;
   }
   if(e){setError(e.message);setLoading(false);return;}
   setNotice(editingInstallation?'Puesto actualizado correctamente.':'Puesto de supervisión creado correctamente.');
   setShowInstallationForm(false);setEditingInstallation(null);
   await refresh(true);setLoading(false);
 };
 const archiveInstallation=async(id:string)=>{
   if(!canManageInstallations)return;
   if(!window.confirm('¿Archivar este puesto de supervisión? No se eliminará el historial operativo.'))return;
   setLoading(true);
   const {error:e}=await db.from('supervision_instalaciones').update({estado:'Inactiva',eliminado_at:new Date().toISOString()}).eq('id',id);
   if(e)setError(e.message);else{setNotice('Puesto archivado.');await refresh(true);}
   setLoading(false);
 };

 const syncOffline=useCallback(async()=>{if(!navigator.onLine)return;const raw=localStorage.getItem(offlineKey);if(!raw)return;let queue: {table:string;payload:unknown}[]=[];try{queue=JSON.parse(raw)}catch{queue=[]}const remaining: typeof queue=[];for(const item of queue){const {error}=await db.from(item.table).insert(item.payload as Record<string, unknown>);if(error)remaining.push(item)}localStorage.setItem(offlineKey,JSON.stringify(remaining));if(remaining.length!==queue.length){setNotice('Se sincronizaron '+(queue.length-remaining.length)+' operación(es) pendientes.');void refresh()}},[db,offlineKey,refresh]);
 useEffect(()=>{window.addEventListener('online',syncOffline);void syncOffline();return()=>window.removeEventListener('online',syncOffline)},[syncOffline]);
 useEffect(()=>{const ch=db.channel('supervision-live').on('postgres_changes',{event:'*',schema:'public',table:'supervision_novedades',filter:'tenant_id=eq.'+tenantId},()=>void refresh(true)).on('postgres_changes',{event:'*',schema:'public',table:'supervision_revistas',filter:'tenant_id=eq.'+tenantId},()=>void refresh(true)).subscribe(); return()=>{void db.removeChannel(ch)}},[db,tenantId,refresh]);

 const selected=installations.find(x=>x.id===selectedInstallation)||null;
 const open=tickets.filter(x=>x.estado_ticket!=='Cerrado').length;
 const critical=tickets.filter(x=>x.criticidad==='Crítica'&&x.estado_ticket!=='Cerrado').length;
 const overdue=tickets.filter(x=>x.estado_ticket!=='Cerrado'&&x.sla_limite&&new Date(x.sla_limite).getTime()<Date.now()).length;

 async function createTicket(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const f=new FormData(form);const payload={tenant_id:tenantId,instalacion_id:String(f.get('instalacion_id')),activo_id:String(f.get('activo_id')||'')||null,tipo_novedad:String(f.get('tipo')),criticidad:String(f.get('criticidad')),descripcion:String(f.get('descripcion')),sla_limite:f.get('sla')?new Date(String(f.get('sla'))).toISOString():null};if(!navigator.onLine){const raw=localStorage.getItem(offlineKey);const q: {table:string;payload:unknown}[]=raw?JSON.parse(raw):[];q.push({table:'supervision_novedades',payload});localStorage.setItem(offlineKey,JSON.stringify(q));setNotice('Sin conexión: novedad guardada en el dispositivo y pendiente de sincronización.');setShowTicket(false);form.reset();return}const {error}=await db.from('supervision_novedades').insert(payload);if(error)setError(error.message);else{setNotice('Novedad registrada y lista para asignación.');setShowTicket(false);form.reset();void refresh();}}
 async function closeTicket(id:string){const t=tickets.find(x=>x.id===id);if(!t)return;const causa=prompt('Causa raíz obligatoria para cerrar:');if(!causa?.trim())return;const solucion=prompt('Solución aplicada obligatoria:');if(!solucion?.trim())return;const {error}=await db.from('supervision_novedades').update({estado_ticket:'Cerrado',causa_raiz:causa.trim(),solucion:solucion.trim(),fecha_cierre:new Date().toISOString()}).eq('id',id);if(error)setError(error.message);else{setNotice('Novedad cerrada con trazabilidad.');void refresh();}}
 async function checkin(method:'GPS'|'QR'|'NFC'){
   if(!selected){setError('Selecciona una instalación.');return}
   setGpsBusy(true);setError('');
   try{
     let args:{p_instalacion:string;p_metodo:string;p_lat?:number;p_lng?:number;p_codigo?:string}={p_instalacion:selected.id,p_metodo:method};
     if(method==='GPS'){
       if(!navigator.geolocation)throw new Error('Este dispositivo no soporta GPS.');
       const pos=await new Promise<GeolocationPosition>((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:15000,maximumAge:5000}));
       args={...args,p_lat:pos.coords.latitude,p_lng:pos.coords.longitude};
     }else{
       const code=prompt(method==='QR'?'Ingresa/escanea el código QR de la instalación:':'Ingresa el identificador NFC de la instalación:');
       if(!code?.trim())return;
       args={...args,p_codigo:code.trim()};
     }
     const {error}=await db.rpc('supervision_checkin',args);
     if(error)throw new Error(error.message);
     setNotice('Check-in registrado correctamente.');setTab('revistas');void refresh();
   }catch(e){setError(e instanceof Error?e.message:'No fue posible realizar el check-in.')}finally{setGpsBusy(false)}
 }
 async function finishReview(id:string){const {error}=await db.from('supervision_revistas').update({estado:'Completada',fecha_cierre:new Date().toISOString()}).eq('id',id);if(error)setError(error.message);else{setNotice('Revista completada.');void refresh();}}

 const unreadNotifications=notifications.filter(n=>!n.leida).length;
 const anomaliesOpen=anomalies.filter(a=>a.estado==='Pendiente').length;
 const markNotification=async(id:string)=>{
   const {error}=await db.from('supervision_notificaciones').update({leida:true}).eq('id',id);
   if(error)setError(error.message);else void refresh(true);
 };

 return <div className="supervision-shell">
  <div className="supervision-head"><div><p className="eyebrow">Operación · Supervisión</p><h2>Supervisión e Incidencias</h2><p className="helper-text">Control operativo de novedades, revistas, evidencias, anomalías y trazabilidad.</p></div><div className="supervision-actions"><button className="ghost-button" onClick={()=>void refresh()} disabled={loading}>↻ Actualizar</button>{canManage(role)&&<button className="primary-button" onClick={()=>{setTicketInst(selectedInstallation);setShowTicket(true)}}>+ Nueva novedad</button>}</div></div>
  {error&&<div className="feedback error-feedback"><span>{error}</span><button className="text-button" onClick={()=>setError('')}>Cerrar</button></div>}{notice&&<div className="feedback success-feedback"><span>{notice}</span><button className="text-button" onClick={()=>setNotice('')}>Cerrar</button></div>}
  <div className="supervision-content">
      <div className="content-title"><div><span className="eyebrow">Submódulo</span><h3>{tab==='resumen'?'Resumen operativo':tab==='novedades'?'Novedades':tab==='revistas'?'Revistas y check-in':tab==='evidencias'?'Evidencias':tab==='anomalias'?'Anomalías':tab==='auditoria'?'Auditoría':'Configuración'}</h3></div>{tab==='revistas'&&<div className="installation-context"><label>Instalación supervisada<select value={selectedInstallation} onChange={e=>setSelectedInstallation(e.target.value)}>{installations.map(i=><option key={i.id} value={i.id}>{i.nombre}</option>)}</select></label></div>}</div>
      {loading?<div className="panel loading-state">Cargando supervisión…</div>:
      tab==='resumen'?<section className="stats-grid">
        <article className="stat-card"><span>Novedades abiertas</span><strong>{open}</strong><em>seguimiento activo</em></article><article className="stat-card"><span>Críticas abiertas</span><strong>{critical}</strong><em>atención prioritaria</em></article><article className="stat-card"><span>SLA vencido</span><strong>{overdue}</strong><em>requiere acción</em></article><article className="stat-card"><span>Revistas</span><strong>{reviews.length}</strong><em>histórico disponible</em></article>
        <article className="stat-card"><span>Evidencias</span><strong>{evidences.length}</strong><em>soportes registrados</em></article><article className="stat-card"><span>Anomalías pendientes</span><strong>{anomaliesOpen}</strong><em>requieren revisión</em></article><article className="stat-card"><span>Notificaciones</span><strong>{unreadNotifications}</strong><em>pendientes de lectura</em></article><article className="stat-card"><span>Activos referenciados</span><strong>{assets.length}</strong><em>solo como contexto operativo</em></article>
        <div className="panel supervision-wide"><div className="panel-header"><div><p className="eyebrow">Estado</p><h3>Prioridades de supervisión</h3></div></div><div className="priority-grid"><button className="priority-card" onClick={()=>setTab('novedades')}><strong>{open}</strong><span>Novedades por gestionar</span></button><button className="priority-card" onClick={()=>setTab('anomalias')}><strong>{anomaliesOpen}</strong><span>Anomalías pendientes</span></button><button className="priority-card" onClick={()=>setTab('auditoria')}><strong>{unreadNotifications}</strong><span>Alertas sin leer</span></button></div></div>
      </section>:
      tab==='novedades'?<section className="panel"><div className="panel-header"><div><p className="eyebrow">Gestión operativa</p><h3>Novedades</h3></div><span>{tickets.length} registros</span></div><div className="data-list">{tickets.map(t=><article className="data-item" key={t.id}><div><span className="code">#{t.numero_ticket} · {t.criticidad}</span><h3>{t.tipo_novedad}</h3><p>{t.descripcion}</p><p>{installations.find(i=>i.id===t.instalacion_id)?.nombre||'Instalación'} · {t.responsable_nombre||'Sin responsable'}</p></div><div className="data-item-side"><span className="status status-in_progress">{t.estado_ticket}</span>{t.sla_limite&&<small>SLA: {new Date(t.sla_limite).toLocaleString('es-CO')}</small>}{t.estado_ticket!=='Cerrado'&&canManage(role)&&<button className="text-button danger" onClick={()=>void closeTicket(t.id)}>Cerrar</button>}</div></article>)}{tickets.length===0&&<div className="empty-state">No hay novedades registradas.</div>}</div></section>:
      tab==='revistas'?<section className="content-grid"><div className="panel"><div className="panel-header"><div><p className="eyebrow">Inspección física</p><h3>Check-in de revista</h3></div></div><p className="helper-text">Selecciona la instalación arriba y valida la presencia mediante GPS, QR o NFC. La validación final la realiza el servidor.</p><div className="checkin-actions"><button className="primary-button" onClick={()=>void checkin('GPS')} disabled={gpsBusy}>✓ Check-in GPS</button><button className="ghost-button" onClick={()=>void checkin('QR')}>QR</button><button className="ghost-button" onClick={()=>void checkin('NFC')}>NFC</button></div>{selected&&<div className="context-card"><span className="code">INSTALACIÓN ACTIVA</span><strong>{selected.nombre}</strong><small>{selected.direccion||'Sin dirección'} · geocerca {selected.geocerca_radio_m} m</small></div>}</div><div className="panel"><div className="panel-header"><div><p className="eyebrow">Histórico</p><h3>Revistas registradas</h3></div><span>{reviews.length}</span></div><div className="data-list">{reviews.map(r=><article className="data-item" key={r.id}><div><span className="code">REV-{r.numero_revista} · {r.metodo_checkin||'—'}</span><h3>{installations.find(i=>i.id===r.instalacion_id)?.nombre||'Instalación'}</h3><p>{r.fecha_checkin?new Date(r.fecha_checkin).toLocaleString('es-CO'):'Sin check-in'} · {r.distancia_checkin_m!=null?Math.round(r.distancia_checkin_m)+' m':''}</p></div><div className="data-item-side"><span className="status status-in_progress">{r.estado}</span>{r.estado==='En curso'&&canManage(role)&&<button className="text-button" onClick={()=>void finishReview(r.id)}>Completar</button>}</div></article>)}{reviews.length===0&&<div className="empty-state">No hay revistas registradas.</div>}</div></div></section>:
      tab==='evidencias'?<section className="panel"><div className="panel-header"><div><p className="eyebrow">Soportes</p><h3>Evidencias</h3></div><span>{evidences.length} registros</span></div><div className="data-list">{evidences.map(e=><article className="data-item" key={e.id}><div><span className="code">{e.mime_type||'archivo'}</span><h3>{e.nombre_archivo||e.storage_path}</h3><p>{e.captured_at?new Date(e.captured_at).toLocaleString('es-CO'):'Sin captura'} · {e.latitud!=null&&e.longitud!=null?e.latitud.toFixed(5)+', '+e.longitud.toFixed(5):'Sin GPS'}</p></div><span>{e.tamano_bytes?Math.round(e.tamano_bytes/1024)+' KB':''}</span></article>)}{evidences.length===0&&<div className="empty-state">No hay evidencias registradas.</div>}</div></section>:
      tab==='anomalias'?<section className="panel"><div className="panel-header"><div><p className="eyebrow">Control de excepciones</p><h3>Anomalías</h3></div><span>{anomaliesOpen} pendientes</span></div><div className="data-list">{anomalies.map(a=><article className="data-item" key={a.id}><div><span className="code">{a.severidad} · {a.tipo_anomalia}</span><h3>{a.descripcion}</h3><p>{a.created_at?new Date(a.created_at).toLocaleString('es-CO'):''}</p></div><span>{a.estado}</span></article>)}{anomalies.length===0&&<div className="empty-state">No hay anomalías registradas.</div>}</div></section>:
      tab==='auditoria'?<section className="panel"><div className="panel-header"><div><p className="eyebrow">Trazabilidad</p><h3>Auditoría y notificaciones</h3></div><span>{unreadNotifications} sin leer</span></div><div className="content-grid"><div className="data-list">{audits.map(a=><article className="data-item" key={a.id}><div><span className="code">{a.accion} · {a.entidad}</span><h3>{a.usuario_nombre||'Sistema'}</h3><p>{a.created_at?new Date(a.created_at).toLocaleString('es-CO'):''} · {a.entidad_id||'—'}</p></div></article>)}{audits.length===0&&<div className="empty-state">No hay eventos de auditoría.</div>}</div><div className="data-list">{notifications.map(n=><article className="data-item" key={n.id}><div><span className="code">{n.tipo}</span><h3>{n.titulo}</h3><p>{n.mensaje}</p></div>{!n.leida&&<button className="text-button" onClick={()=>void markNotification(n.id)}>Marcar leída</button>}</article>)}{notifications.length===0&&<div className="empty-state">No hay notificaciones.</div>}</div></div></section>:
      <section className="content-grid">
       <div className="panel supervision-wide">
        <div className="panel-header"><div><p className="eyebrow">Maestro independiente</p><h3>Puestos de supervisión</h3><p className="helper-text">Este catálogo es exclusivo de Supervisión Física. No comparte instalaciones con Servicios Técnicos.</p></div>{canManageInstallations&&<button className="primary-button" onClick={()=>{setEditingInstallation(null);setShowInstallationForm(true)}}>+ Nuevo puesto</button>}</div>
        <div className="data-list">{installations.map(i=><article className="data-item" key={i.id}>
          <div><span className="code">{i.estado} · geocerca {i.geocerca_radio_m} m</span><h3>{i.nombre}</h3><p>{i.direccion||'Sin dirección'} · {i.ciudad||'Ciudad no definida'}</p><p>{i.latitud!=null&&i.longitud!=null?'GPS '+i.latitud.toFixed(6)+', '+i.longitud.toFixed(6):'Sin coordenadas GPS'}</p></div>
           <div className="data-item-side">{canManageInstallations&&<button className="text-button" onClick={()=>{setEditingInstallation(i);setShowInstallationForm(true)}}>Editar</button>}{canManageInstallations&&i.estado==='Activa'&&<button className="text-button danger" onClick={()=>void archiveInstallation(i.id)}>Archivar</button>}</div>
        </article>)}{installations.length===0&&<div className="empty-state">No hay puestos de supervisión creados. Crea el primero desde «Nuevo puesto».</div>}</div>
       </div>
       <div className="panel"><div className="panel-header"><div><p className="eyebrow">Catálogo operativo</p><h3>Tipos de novedad</h3></div></div><div className="data-list">{noveltyTypes.map(t=><article className="data-item" key={t.id}><div><span className="code">{t.activo?'ACTIVO':'INACTIVO'}</span><h3>{t.nombre}</h3><p>{t.descripcion||'Sin descripción'}</p></div></article>)}</div></div>
       <div className="panel"><div className="panel-header"><div><p className="eyebrow">SLA</p><h3>Políticas por criticidad</h3></div></div><div className="data-list">{slaPolicies.map(s=><article className="data-item" key={s.id}><div><span className="code">{s.criticidad}</span><h3>{s.nombre}</h3><p>Respuesta: {s.minutos_respuesta} min · Resolución: {s.minutos_resolucion} min</p></div><span>{s.activo?'Activo':'Inactivo'}</span></article>)}</div></div>
      </section>}
      {showInstallationForm&&<div className="supervision-modal"><form className="panel form-panel" onSubmit={saveInstallation}>
       <div className="panel-header"><div><p className="eyebrow">Maestro de puestos</p><h3>{editingInstallation?'Editar puesto de supervisión':'Nuevo puesto de supervisión'}</h3><p className="helper-text">Registro independiente del módulo de Servicios Técnicos.</p></div><button type="button" className="text-button" onClick={()=>{setShowInstallationForm(false);setEditingInstallation(null)}}>✕</button></div>
       <div className="field-row"><label>Nombre del puesto<input name="nombre" required defaultValue={editingInstallation?.nombre||''} placeholder="Ej. Torres del Norte · Portería Principal"/></label><label>Ciudad<input name="ciudad" defaultValue={editingInstallation?.ciudad||''} placeholder="Barranquilla"/></label></div>
       <label>Dirección<input name="direccion" defaultValue={editingInstallation?.direccion||''} placeholder="Dirección completa del puesto"/></label>
       <div className="field-row"><label>Latitud<input name="latitud" type="number" step="any" defaultValue={editingInstallation?.latitud??''} placeholder="10.96854"/></label><label>Longitud<input name="longitud" type="number" step="any" defaultValue={editingInstallation?.longitud??''} placeholder="-74.78132"/></label></div>
       <div className="field-row"><label>Radio de geocerca (m)<input name="geocerca_radio_m" type="number" min="25" max="1000" defaultValue={editingInstallation?.geocerca_radio_m||100}/></label><label>Estado<select name="estado" defaultValue={editingInstallation?.estado||'Activa'}><option>Activa</option><option>Inactiva</option></select></label></div>
       <div className="context-card"><span className="code">CONTROL DE CALIDAD</span><strong>Ubicación + geocerca obligatorias para check-in GPS</strong><small>Usa coordenadas verificadas del puesto. El historial de revistas no se elimina al archivar.</small></div>
       <button className="primary-button" type="submit">{editingInstallation?'Guardar cambios':'Crear puesto de supervisión'}</button>
      </form></div>}
      {showTicket&&<div className="supervision-modal"><form className="panel form-panel" onSubmit={createTicket}><div className="panel-header"><div><p className="eyebrow">Gestión operativa</p><h3>Nueva novedad</h3></div><button type="button" className="text-button" onClick={()=>setShowTicket(false)}>✕</button></div><label>Instalación<select name="instalacion_id" required value={ticketInst||installations[0]?.id||''} onChange={e=>setTicketInst(e.target.value)}>{installations.map(i=><option key={i.id} value={i.id}>{i.nombre}</option>)}</select></label><label>Activo relacionado<select name="activo_id"><option value="">Sin activo específico</option>{assets.filter(a=>a.instalacion_id===(ticketInst||installations[0]?.id)).map(a=><option key={a.id} value={a.id}>{a.codigo_activo||'SIN CÓDIGO'} · {a.nombre_activo}</option>)}</select></label><div className="field-row"><label>Tipo<select name="tipo" defaultValue="Falla técnica"><option>Falla técnica</option><option>Daño físico</option><option>Mantenimiento preventivo</option><option>Seguridad</option><option>Acceso</option><option>Otro</option></select></label><label>Criticidad<select name="criticidad" defaultValue="Media"><option>Baja</option><option>Media</option><option>Alta</option><option>Crítica</option></select></label></div><label>Descripción<textarea name="descripcion" required placeholder="Describe la novedad con suficiente detalle"/></label><label>Fecha límite SLA<input name="sla" type="datetime-local"/></label><button className="primary-button">Registrar novedad</button></form></div>}
  </div>
 </div>;
}
