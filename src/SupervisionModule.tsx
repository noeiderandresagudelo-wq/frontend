import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { createAuthedSupabaseClient } from './lib/supabase';
import type { UserRole } from './api';
import './supervision-standalone.css';
import PuestoZonaDetail from './PuestoZonaDetail';

type Props = { token: string; tenantId: string; role: UserRole };
type Tab = 'resumen'|'puestos'|'turnos'|'activos'|'revistas'|'novedades'|'evidencias'|'mantenimientos'|'anomalias'|'auditoria'|'configuracion';

type Installation = {
  id:string; tenant_id:string; codigo_puesto:string|null; nombre:string; tipo_puesto:string|null;
  coordinador_nombre:string|null; telefono_contacto:string|null; sector:string|null; direccion:string|null; ciudad:string|null;
  latitud:number|null; longitud:number|null; geocerca_radio_m:number; estado:string;
  dotacion_estado:string|null; equipamiento_estado:string|null; observaciones:string|null;
  estudio_seguridad_fecha:string|null; ultima_revista_at:string|null; proxima_revista_at:string|null;
  created_at:string; updated_at:string;
};
type Asset = { id:string; instalacion_id:string; nombre_activo:string; codigo_activo:string|null; tipo_activo:string|null; ubicacion_detalle:string|null; estado:string; qr_codigo:string|null; nfc_codigo:string|null };
type Ticket = { id:string; numero_ticket:number; instalacion_id:string; activo_id:string|null; tipo_novedad:string; criticidad:string; estado_ticket:string; descripcion:string; causa_raiz:string|null; solucion:string|null; responsable_nombre:string|null; sla_limite:string|null; created_at:string; updated_at:string };
type Review = { id:string; numero_revista:number; instalacion_id:string; supervisor_id:string; turno_id:string|null; fecha_programada:string|null; fecha_checkin:string|null; fecha_cierre:string|null; estado:string; metodo_checkin:string|null; latitud_checkin:number|null; longitud_checkin:number|null; distancia_checkin_m:number|null; observaciones:string|null };
type SupervisionWindow = { inicio:string; fin:string };
type SupervisionRule = { id:string; tenant_id:string; instalacion_id:string; revistas_requeridas:number; periodo_objetivo:'dia'|'turno'; ventanas_horarias:SupervisionWindow[]; requerir_qr:boolean; requerir_gps:boolean; requerir_firma:boolean; tolerancia_omision_min:number; activo:boolean; created_at:string; updated_at:string };
type Evidence = { id:string; novedad_id:string|null; revista_id:string|null; activo_id:string|null; storage_path:string; nombre_archivo:string|null; mime_type:string|null; tamano_bytes:number|null; captured_at:string|null; created_at:string };
type Maintenance = { id:string; activo_id:string; novedad_id:string|null; tipo_mantenimiento:string; descripcion:string|null; tecnico_id:string|null; fecha_inicio:string|null; fecha_fin:string|null; resultado:string|null };
type Anomaly = { id:string; instalacion_id:string|null; revista_id:string|null; tipo_anomalia:string; severidad:string; descripcion:string; estado:string; created_at:string };
type Audit = { id:string; usuario_id:string|null; usuario_nombre:string|null; entidad:string; entidad_id:string|null; accion:string; created_at:string };
type Notification = { id:string; tipo:string; titulo:string; mensaje:string; entidad:string|null; entidad_id:string|null; leida:boolean; created_at:string };
type SlaPolicy = { id:string; nombre:string; criticidad:string; minutos_respuesta:number; minutos_resolucion:number; activo:boolean };
type NoveltyType = { id:string; nombre:string; descripcion:string|null; activo:boolean };
type Shift = { id:string; nombre:string; hora_inicio:string; hora_fin:string; frecuencia_revistas:number; activo:boolean };
type Assignment = { id:string; instalacion_id:string; usuario_id:string; rol:string; activo:boolean };
type SupervisionUser = { id:string; nombre:string; username:string; rol:string; activo:boolean };
type Checklist = { id:string; nombre:string; activo:boolean };
type ChecklistItem = { id:string; checklist_id:string; texto:string; obligatorio:boolean; orden:number };

const labels:Record<Tab,string> = {
  resumen:'Resumen operativo', puestos:'Puestos de supervisión', turnos:'Turnos', activos:'Activos',
  revistas:'Revistas y check-in', novedades:'Novedades', evidencias:'Evidencias',
  mantenimientos:'Mantenimientos', anomalias:'Anomalías', auditoria:'Auditoría', configuracion:'Configuración'
};
const icon:Record<Tab,string> = {resumen:'⌂',puestos:'⌖',turnos:'◷',activos:'▣',revistas:'✓',novedades:'⚑',evidencias:'▤',mantenimientos:'↻',anomalias:'⚠',auditoria:'≡',configuracion:'⚙'};
const canAdmin=(role:UserRole)=>role==='admin'||role==='manager';
const canStaff=(role:UserRole)=>canAdmin(role)||role==='supervisor';

export default function SupervisionModule({token,tenantId,role}:Props){
  const db=useMemo(()=>createAuthedSupabaseClient(token),[token]);
  const [tab,setTab]=useState<Tab>('resumen');
  const [installations,setInstallations]=useState<Installation[]>([]);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [tickets,setTickets]=useState<Ticket[]>([]);
  const [reviews,setReviews]=useState<Review[]>([]);
  const [supervisionRules,setSupervisionRules]=useState<SupervisionRule[]>([]);
  const [evidences,setEvidences]=useState<Evidence[]>([]);
  const [maintenances,setMaintenances]=useState<Maintenance[]>([]);
  const [anomalies,setAnomalies]=useState<Anomaly[]>([]);
  const [audits,setAudits]=useState<Audit[]>([]);
  const [notifications,setNotifications]=useState<Notification[]>([]);
  const [slaPolicies,setSlaPolicies]=useState<SlaPolicy[]>([]);
  const [noveltyTypes,setNoveltyTypes]=useState<NoveltyType[]>([]);
  const [shifts,setShifts]=useState<Shift[]>([]);
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [users,setUsers]=useState<SupervisionUser[]>([]);
  const [checklists,setChecklists]=useState<Checklist[]>([]);
  const [checkItems,setCheckItems]=useState<ChecklistItem[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [gpsBusy,setGpsBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [showPostForm,setShowPostForm]=useState(false);
  const [editingPost,setEditingPost]=useState<Installation|null>(null);
  const [showTicketForm,setShowTicketForm]=useState(false);
  const externalNavigation=typeof document!=='undefined'&&document.getElementById('supervision-submodules')!==null;

  const refresh=useCallback(async(silent=false)=>{
    if(!silent){setLoading(true);setError('');}

    // El maestro de puestos es crítico para todo el módulo. Se carga de forma
    // independiente para que un fallo secundario (auditoría, evidencias, etc.)
    // jamás deje el catálogo de puestos vacío.
    const installationResult=await db.rpc('listar_supervision_instalaciones');
    if(installationResult.error){
      setError('No fue posible cargar los puestos del tenant activo: '+installationResult.error.message);
      if(!silent)setLoading(false);
      return null;
    }
    const loadedInstallations=(installationResult.data||[]) as Installation[];
    setInstallations(loadedInstallations);

    const results=await Promise.all([
      db.from('supervision_activos').select('*').eq('tenant_id',tenantId).is('eliminado_at',null).order('nombre_activo'),
      db.from('supervision_novedades').select('*').eq('tenant_id',tenantId).is('eliminado_at',null).order('created_at',{ascending:false}).limit(200),
      db.from('supervision_revistas').select('*').eq('tenant_id',tenantId).is('eliminado_at',null).order('created_at',{ascending:false}).limit(200),
      db.from('supervision_evidencias').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(200),
      db.from('supervision_mantenimientos').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(100),
      db.from('supervision_anomalias').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(100),
      db.from('supervision_audit_logs').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(200),
      db.from('supervision_notificaciones').select('*').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(100),
      db.from('supervision_sla_politicas').select('*').eq('tenant_id',tenantId).order('criticidad'),
      db.from('supervision_tipos_novedad').select('*').eq('tenant_id',tenantId).eq('activo',true).order('nombre'),
      db.from('supervision_turnos').select('*').eq('tenant_id',tenantId).order('hora_inicio'),
      db.from('supervision_instalacion_usuarios').select('*').eq('tenant_id',tenantId).eq('activo',true),
      db.from('supervision_checklists').select('*').eq('tenant_id',tenantId).order('nombre'),
      db.from('supervision_checklist_items').select('*').eq('tenant_id',tenantId).order('checklist_id').order('orden'),
      db.from('supervision_reglas_revista').select('*').eq('tenant_id',tenantId),
      db.rpc('listar_supervision_usuarios')
    ]);

    const [a,n,r,ev,m,an,au,no,sl,nt,t,as,cl,ci,sr,u]=results;
    if(!silent && results.some(x=>x.error)) {
      const firstSecondaryError=results.find(x=>x.error)?.error;
      if(firstSecondaryError)setError('Puestos cargados. Algunas funciones de Supervisión no están disponibles todavía: '+firstSecondaryError.message);
    }

    setAssets((a.data||[]) as Asset[]);
    setTickets((n.data||[]) as Ticket[]);
    setReviews((r.data||[]) as Review[]);
    setEvidences((ev.data||[]) as Evidence[]);
    setMaintenances((m.data||[]) as Maintenance[]);
    setAnomalies((an.data||[]) as Anomaly[]);
    setAudits((au.data||[]) as Audit[]);
    setNotifications((no.data||[]) as Notification[]);
    setSlaPolicies((sl.data||[]) as SlaPolicy[]);
    setNoveltyTypes((nt.data||[]) as NoveltyType[]);
    setShifts((t.data||[]) as Shift[]);
    setAssignments((as.data||[]) as Assignment[]);
    setChecklists((cl.data||[]) as Checklist[]);
    setCheckItems((ci.data||[]) as ChecklistItem[]);
    setSupervisionRules((sr.data||[]) as SupervisionRule[]);
    setUsers((u.data||[]) as SupervisionUser[]);
    if(!silent)setLoading(false);
    return loadedInstallations;
  },[db,tenantId]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    const channel=db.channel('supervision-instalaciones-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'supervision_instalaciones'},()=>{void refresh(true);})
      .subscribe();
    return()=>{void db.removeChannel(channel);};
  },[db,refresh]);
  useEffect(()=>{
    const handler=(event:Event)=>{const next=(event as CustomEvent<Tab>).detail;if(next in labels)setTab(next);};
    window.addEventListener('alarvix-supervision-submodule',handler);
    return()=>window.removeEventListener('alarvix-supervision-submodule',handler);
  },[]);
  useEffect(()=>{if(!selectedId&&installations[0])setSelectedId(installations[0].id);},[installations,selectedId]);

  const selected=useMemo(()=>installations.find(i=>i.id===selectedId)||null,[installations,selectedId]);
  const openTickets=useMemo(()=>tickets.filter(t=>t.estado_ticket!=='Cerrado'),[tickets]);
  const critical=useMemo(()=>openTickets.filter(t=>t.criticidad==='Crítica'),[openTickets]);
  const overdue=useMemo(()=>openTickets.filter(t=>t.sla_limite&&new Date(t.sla_limite).getTime()<Date.now()),[openTickets]);
  const pendingAnomalies=useMemo(()=>anomalies.filter(a=>a.estado==='Pendiente'),[anomalies]);
  const unread=useMemo(()=>notifications.filter(n=>!n.leida),[notifications]);

  const saveSupervisionRule=async(rule:Omit<SupervisionRule,'id'|'tenant_id'|'created_at'|'updated_at'>):Promise<boolean>=>{
    if(!canAdmin(role)){setError('Solo administración puede modificar las reglas de inspección.');return false;}
    const payload={...rule,tenant_id:tenantId,updated_at:new Date().toISOString()};
    const {data,error:ruleError}=await db.from('supervision_reglas_revista')
      .upsert(payload,{onConflict:'tenant_id,instalacion_id'}).select('*').single();
    if(ruleError){setError('No fue posible guardar las reglas de revista: '+ruleError.message);return false;}
    const saved=data as SupervisionRule;
    setSupervisionRules(current=>[...current.filter(item=>item.instalacion_id!==saved.instalacion_id),saved]);
    setError('');
    setNotice('Parámetros de revista guardados y sincronizados.');
    return true;
  };

  const savePost=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(!canAdmin(role)){setError('No tienes permisos para administrar puestos.');return;}
    const f=new FormData(e.currentTarget);
    const coordinatesRaw=String(f.get('coordenadas')||'').trim();
    let lat:number|null=null,lng:number|null=null;
    if(coordinatesRaw){
      const coordinates=coordinatesRaw.split(',').map(value=>value.trim());
      if(coordinates.length!==2||!coordinates[0]||!coordinates[1]){
        setError('Escribe la ubicación en un solo campo con el formato: latitud, longitud.');return;
      }
      lat=Number(coordinates[0]);lng=Number(coordinates[1]);
      if(!Number.isFinite(lat)||lat<-90||lat>90){setError('La latitud debe estar entre -90 y 90.');return;}
      if(!Number.isFinite(lng)||lng<-180||lng>180){setError('La longitud debe estar entre -180 y 180.');return;}
    }
    const payload={nombre:String(f.get('nombre')||'').trim(),direccion:String(f.get('direccion')||'').trim()||null,ciudad:String(f.get('ciudad')||'').trim()||null,
      latitud:lat,longitud:lng,geocerca_radio_m:Math.min(5000,Math.max(25,Number(f.get('geocerca_radio_m')||100))),estado:String(f.get('estado')||'Activa'),
      codigo_puesto:String(f.get('codigo_puesto')||'').trim()||null,tipo_puesto:String(f.get('tipo_puesto')||'Fijo'),
      coordinador_nombre:String(f.get('coordinador_nombre')||'').trim()||null,telefono_contacto:String(f.get('telefono_contacto')||'').trim()||null,
      sector:String(f.get('sector')||'').trim()||null,dotacion_estado:String(f.get('dotacion_estado')||'Pendiente'),
      equipamiento_estado:String(f.get('equipamiento_estado')||'Pendiente'),observaciones:String(f.get('observaciones')||'').trim()||null,
      estudio_seguridad_fecha:String(f.get('estudio_seguridad_fecha')||'').trim()||null};
    if(!payload.nombre){setError('El nombre del puesto es obligatorio.');return;}
    setBusy(true);setError('');
    let savedId:string|null=editingPost?.id||null;
    if(editingPost){
      const {error:e1}=await db.from('supervision_instalaciones').update(payload).eq('id',editingPost.id).eq('tenant_id',tenantId);
      if(e1){setError(e1.message);setBusy(false);return;}
    }else{
      const {data:created,error:e2}=await db.rpc('crear_supervision_instalacion',{
        p_nombre:payload.nombre,p_direccion:payload.direccion,p_ciudad:payload.ciudad,p_latitud:payload.latitud,p_longitud:payload.longitud,
        p_geocerca_radio_m:payload.geocerca_radio_m,p_estado:payload.estado,p_codigo_puesto:payload.codigo_puesto,p_tipo_puesto:payload.tipo_puesto,
        p_coordinador_nombre:payload.coordinador_nombre,p_telefono_contacto:payload.telefono_contacto,p_sector:payload.sector,
        p_dotacion_estado:payload.dotacion_estado,p_equipamiento_estado:payload.equipamiento_estado,p_observaciones:payload.observaciones,
        p_estudio_seguridad_fecha:payload.estudio_seguridad_fecha||null
      });
      if(e2){setError(e2.message);setBusy(false);return;}
      const createdRow=(Array.isArray(created)?created[0]:created) as Installation|undefined;
      savedId=createdRow?.id||null;
      if(createdRow?.tenant_id && String(createdRow.tenant_id)!==String(tenantId)){
        setError('El servidor creó el puesto en un tenant distinto al que muestra esta pantalla. Se bloqueó el mensaje de éxito; verifica el tenant de la sesión.');
        setBusy(false);
        return;
      }
    }
    setShowPostForm(false);setEditingPost(null);setTab('puestos');
    const refreshed=await refresh(true);
    if(!refreshed){setBusy(false);return;}
    const savedVisible=savedId ? refreshed.some(i=>i.id===savedId) : refreshed.some(i=>i.nombre===payload.nombre);
    if(!savedVisible){
      setNotice('');
      setError('La operación se guardó, pero el puesto no aparece en la consulta del tenant activo. No se mostrará un éxito falso; revisa la sesión/RLS y vuelve a actualizar.');
      setBusy(false);
      return;
    }
    setSelectedId(savedId||refreshed.find(i=>i.nombre===payload.nombre)?.id||'');
    setNotice(editingPost?'Puesto actualizado y sincronizado.':'Puesto creado y sincronizado correctamente.');
    setBusy(false);
  };

  const archivePost=async(id:string)=>{
    if(!canAdmin(role))return;
    const {error:e}=await db.from('supervision_instalaciones').update({estado:'Inactiva',eliminado_at:new Date().toISOString()}).eq('id',id).eq('tenant_id',tenantId);
    if(e)setError(e.message);else{setNotice('Puesto archivado.');await refresh(true);}
  };

  const assignUser=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(!canAdmin(role)||!selected)return;
    const f=new FormData(e.currentTarget);const usuario_id=String(f.get('usuario_id')||'');const rol=String(f.get('rol')||'supervisor');
    if(!usuario_id){setError('Selecciona un usuario.');return;}
    const {error:e1}=await db.from('supervision_instalacion_usuarios').upsert({tenant_id:tenantId,instalacion_id:selected.id,usuario_id,rol,activo:true},{onConflict:'tenant_id,instalacion_id,usuario_id'});
    if(e1)setError(e1.message);else{setNotice('Personal asignado al puesto.');await refresh(true);}
  };

  const createAsset=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(!canAdmin(role)||!selected)return;
    const f=new FormData(e.currentTarget);const nombre_activo=String(f.get('nombre_activo')||'').trim();
    if(!nombre_activo){setError('Nombre del activo obligatorio.');return;}
    const {error:e1}=await db.from('supervision_activos').insert({tenant_id:tenantId,instalacion_id:selected.id,nombre_activo,
      codigo_activo:String(f.get('codigo_activo')||'').trim()||null,tipo_activo:String(f.get('tipo_activo')||'').trim()||null,
      ubicacion_detalle:String(f.get('ubicacion_detalle')||'').trim()||null,estado:String(f.get('estado')||'Operativo'),
      qr_codigo:String(f.get('qr_codigo')||'').trim()||null,nfc_codigo:String(f.get('nfc_codigo')||'').trim()||null});
    if(e1)setError(e1.message);else{setNotice('Activo registrado.');e.currentTarget.reset();await refresh(true);}
  };

  const createShift=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(!canAdmin(role))return;const f=new FormData(e.currentTarget);
    const {error:e1}=await db.from('supervision_turnos').insert({tenant_id:tenantId,nombre:String(f.get('nombre')||'').trim(),
      hora_inicio:String(f.get('hora_inicio')),hora_fin:String(f.get('hora_fin')),frecuencia_revistas:Math.max(1,Number(f.get('frecuencia_revistas')||1)),activo:true});
    if(e1)setError(e1.message);else{setNotice('Turno creado.');e.currentTarget.reset();await refresh(true);}
  };

  const toggleShift=async(id:string,active:boolean)=>{
    if(!canAdmin(role))return;const {error:e}=await db.from('supervision_turnos').update({activo:!active}).eq('id',id).eq('tenant_id',tenantId);
    if(e)setError(e.message);else await refresh(true);
  };

  const checkin=async(method:'GPS'|'QR'|'NFC')=>{
    if(!selected){setError('Selecciona un puesto.');return;}setGpsBusy(true);setError('');
    try{
      const args:{p_instalacion:string;p_metodo:string;p_lat?:number;p_lng?:number;p_codigo?:string}={p_instalacion:selected.id,p_metodo:method};
      if(method==='GPS'){
        if(!navigator.geolocation)throw new Error('Este dispositivo no soporta GPS.');
        const p=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:5000}));
        args.p_lat=p.coords.latitude;args.p_lng=p.coords.longitude;
      }else{const code=prompt(method==='QR'?'Código QR del puesto:':'Identificador NFC del puesto:');if(!code?.trim())return;args.p_codigo=code.trim();}
      const {error:e}=await db.rpc('supervision_checkin',args);if(e)throw new Error(e.message);
      setNotice('Check-in registrado correctamente.');setTab('revistas');await refresh(true);
    }catch(e){setError(e instanceof Error?e.message:'No fue posible registrar el check-in.')}finally{setGpsBusy(false);}
  };

  const createTicket=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(!canStaff(role))return;
    const f=new FormData(e.currentTarget);const descripcion=String(f.get('descripcion')||'').trim();
    const instalacion_id=String(f.get('instalacion_id')||'');
    if(!instalacion_id){setError('Selecciona un puesto.');return;}
    if(!descripcion){setError('La descripción es obligatoria.');return;}
    const {error:e1}=await db.from('supervision_novedades').insert({tenant_id:tenantId,instalacion_id,
      activo_id:String(f.get('activo_id')||'')||null,tipo_novedad:String(f.get('tipo_novedad')||'Seguridad'),
      criticidad:String(f.get('criticidad')||'Media'),descripcion,sla_limite:f.get('sla')?new Date(String(f.get('sla'))).toISOString():null});
    if(e1)setError(e1.message);else{setNotice('Novedad registrada.');setShowTicketForm(false);e.currentTarget.reset();await refresh(true);}
  };

  const moveTicket=async(id:string,next:'En proceso'|'Cerrado')=>{
    const t=tickets.find(x=>x.id===id);if(!t)return;const patch:Record<string,unknown>={estado_ticket:next};
    if(next==='Cerrado'){const causa=prompt('Causa raíz obligatoria:');if(!causa?.trim())return;const solucion=prompt('Solución aplicada obligatoria:');if(!solucion?.trim())return;patch.causa_raiz=causa.trim();patch.solucion=solucion.trim();patch.fecha_cierre=new Date().toISOString();}
    if(next==='En proceso')patch.fecha_inicio=new Date().toISOString();
    const {error:e}=await db.from('supervision_novedades').update(patch).eq('id',id).eq('tenant_id',tenantId);
    if(e)setError(e.message);else{setNotice(next==='Cerrado'?'Novedad cerrada.':'Novedad en proceso.');await refresh(true);}
  };

  const finishReview=async(id:string)=>{
    const {error:e}=await db.from('supervision_revistas').update({estado:'Completada',fecha_cierre:new Date().toISOString()}).eq('id',id).eq('tenant_id',tenantId);
    if(e)setError(e.message);else{setNotice('Revista completada.');await refresh(true);}
  };

  const markNotification=async(id:string)=>{
    const {error:e}=await db.from('supervision_notificaciones').update({leida:true}).eq('id',id);
    if(e)setError(e.message);else await refresh(true);
  };

  return <div className="supervision-shell">
    <div className="supervision-head">
      <div><p className="eyebrow">Operación · Supervisión Física</p><h2>Control integral de supervisión</h2><p className="helper-text">Gestiona puestos, personal, turnos, activos, revistas, novedades, evidencias y trazabilidad.</p></div>
      <div className="supervision-actions"><button className="ghost-button" onClick={()=>void refresh()} disabled={loading}>↻ Actualizar</button>{canAdmin(role)&&<button className="primary-button" onClick={()=>{setEditingPost(null);setShowPostForm(true);setTab('puestos')}}>+ Nuevo puesto</button>}{canStaff(role)&&<button className="ghost-button" onClick={()=>setShowTicketForm(true)}>+ Nueva novedad</button>}</div>
    </div>
    {(error||notice)&&<div className={'feedback '+(error?'error-feedback':'success-feedback')}><span>{error||notice}</span><button className="text-button" onClick={()=>{setError('');setNotice('')}}>Cerrar</button></div>}

    <div className={"supervision-layout"+(externalNavigation?" no-subnav":"")}>
      {!externalNavigation&&<aside className="supervision-subnav">
        <div className="subnav-heading"><span className="eyebrow">Módulo</span><strong>Supervisión Física</strong><small>Control operativo de puestos</small></div>
        <nav>{(Object.keys(labels) as Tab[]).map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}><span className="subnav-icon">{icon[t]}</span><span>{labels[t]}</span>{t==='novedades'&&openTickets.length>0&&<b>{openTickets.length}</b>}{t==='anomalias'&&pendingAnomalies.length>0&&<b>{pendingAnomalies.length}</b>}</button>)}</nav>
        <div className="subnav-note"><span>Sesión</span><strong>{role}</strong><small>Tenant {tenantId.slice(0,8)}…</small></div>
      </aside>}

      <main className="supervision-content">
        <div className="content-title"><div><span className="eyebrow">Submódulo</span><h3>{labels[tab]}</h3></div>{tab!=='puestos'&&tab!=='resumen'&&<div className="installation-context"><label>Puesto operativo<select value={selectedId} onChange={e=>setSelectedId(e.target.value)}><option value="">Seleccionar…</option>{installations.map(i=><option key={i.id} value={i.id}>{i.codigo_puesto||'Puesto'} · {i.nombre}</option>)}</select></label></div>}</div>

        {loading?<div className="panel loading-state">Cargando Supervisión Física…</div>:
        tab==='resumen'?<Dashboard installations={installations} openTickets={openTickets} critical={critical} overdue={overdue} anomalies={pendingAnomalies} unread={unread} reviews={reviews} onTab={setTab} selected={selected} onSelect={setSelectedId}/>:
        tab==='puestos'?<PostsView installations={installations} selected={selected} assets={assets} tickets={tickets} reviews={reviews} assignments={assignments} users={users} shifts={shifts} supervisionRules={supervisionRules} saveSupervisionRule={saveSupervisionRule} role={role} onRefresh={()=>void refresh()} onSelect={setSelectedId} onNew={()=>{setEditingPost(null);setShowPostForm(true)}} onEdit={p=>{setEditingPost(p);setShowPostForm(true)}} onArchive={archivePost} assignUser={assignUser} createAsset={createAsset}/>:
        tab==='turnos'?<ShiftsView shifts={shifts} role={role} createShift={createShift} toggleShift={toggleShift}/>:
        tab==='activos'?<AssetsView assets={assets} installations={installations} selectedId={selectedId} role={role} createAsset={createAsset}/>:
        tab==='revistas'?<ReviewsView reviews={reviews} installations={installations} selectedId={selectedId} gpsBusy={gpsBusy} onSelect={setSelectedId} checkin={checkin} onFinish={finishReview}/>:
        tab==='novedades'?<TicketsView tickets={tickets} installations={installations} selectedId={selectedId} onMove={moveTicket}/>:
        tab==='evidencias'?<EvidenceView evidences={evidences}/>:
        tab==='mantenimientos'?<MaintenanceView maintenances={maintenances} assets={assets}/>:
        tab==='anomalias'?<AnomaliesView anomalies={anomalies} installations={installations}/>:
        tab==='auditoria'?<AuditView audits={audits} notifications={notifications} unread={unread} markNotification={markNotification}/>:
        <ConfigurationView noveltyTypes={noveltyTypes} slaPolicies={slaPolicies} checklists={checklists} checkItems={checkItems} role={role}/>
        }
      </main>
    </div>

    {showPostForm&&<PostModal editing={editingPost} role={role} onClose={()=>{setShowPostForm(false);setEditingPost(null)}} onSave={savePost}/>}
    {showTicketForm&&<TicketModal installations={installations} assets={assets} selectedId={selectedId} onSelect={setSelectedId} onClose={()=>setShowTicketForm(false)} onSave={createTicket} busy={busy}/>} 
  </div>;
}

function Dashboard({installations,openTickets,critical,overdue,anomalies,unread,reviews,onTab,selected,onSelect}:{installations:Installation[];openTickets:Ticket[];critical:Ticket[];overdue:Ticket[];anomalies:Anomaly[];unread:Notification[];reviews:Review[];onTab:(t:Tab)=>void;selected:Installation|null;onSelect:(id:string)=>void}){
  const activePosts = installations.filter(i=>i.estado.toLowerCase()==='activa');
  const scheduledPosts = activePosts.filter(i=>i.proxima_revista_at && new Date(i.proxima_revista_at).getTime() >= Date.now()).length;
  const coverage = activePosts.length ? Math.round((scheduledPosts / activePosts.length) * 100) : 0;
  const today = new Date().toDateString();
  const reviewsToday = reviews.filter(r=>[r.fecha_checkin,r.fecha_programada].some(value=>!!value && new Date(value).toDateString()===today)).length;
  const alertCount = openTickets.length + anomalies.length;
  return <div className="data-list supervision-dashboard">
    <section className="stats-grid">
      <Stat title="Puestos activos" value={activePosts.length} meta={`${installations.length} puestos registrados`} tone="green"/>
      <Stat title="Cobertura programada" value={`${coverage}%`} meta={`${scheduledPosts} de ${activePosts.length} puestos activos`} tone="blue"/>
      <Stat title="Revistas hoy" value={reviewsToday} meta="Programadas o registradas hoy" tone="violet"/>
      <Stat title="Alertas y novedades" value={alertCount} meta={`${overdue.length} SLA vencidos · ${unread.length} notificaciones`} tone={alertCount?'amber':'green'}/>
    </section>
    <section className="content-grid">
      <div className="panel supervision-wide"><div className="panel-header"><div><p className="eyebrow">Puestos</p><h3>Operación por ubicación</h3></div><button className="ghost-button" onClick={()=>onTab('puestos')}>Ver todos</button></div>
        <div className="data-list">{installations.slice(0,6).map(i=><button type="button" className={'data-item '+(selected?.id===i.id?'supervision-select selected':'')} key={i.id} onClick={()=>onSelect(i.id)}><div><span className={`posts-status ${i.estado.toLowerCase()==='activa'?'is-active':'is-inactive'}`}>{i.estado.toLowerCase()==='activa'?'Activo':'Inhabilitado'}</span><h3>{i.codigo_puesto||'SIN CÓDIGO'} · {i.nombre}</h3><p>{[i.ciudad,i.direccion].filter(Boolean).join(' · ')||'Ubicación no registrada'}</p></div><span className="dashboard-row-action" aria-hidden="true">↗</span></button>)}{!installations.length&&<div className="empty-state">No hay puestos registrados.</div>}</div>
      </div>
      <div className="panel"><div className="panel-header"><div><p className="eyebrow">Atención</p><h3>Prioridades operativas</h3></div></div><div className="data-list">{critical.slice(0,3).map(t=><button type="button" className="data-item" key={t.id} onClick={()=>onTab('novedades')}><div><span className="code">CRÍTICA · #{t.numero_ticket}</span><h3>{t.tipo_novedad}</h3><p>{t.descripcion}</p></div></button>)}{anomalies.slice(0,3).map(a=><button type="button" className="data-item" key={a.id} onClick={()=>onTab('anomalias')}><div><span className="code">{a.severidad} · {a.estado}</span><h3>{a.tipo_anomalia}</h3><p>{a.descripcion}</p></div></button>)}{!critical.length&&!anomalies.length&&<div className="empty-state">Todo al día. Sin alertas prioritarias.</div>}</div></div>
    </section>
  </div>;
}
function Stat({title,value,meta,tone='blue'}:{title:string;value:number|string;meta:string;tone?:'green'|'blue'|'violet'|'amber'}){return <article className={`stat-card tone-${tone}`}><span>{title}</span><strong>{value}</strong><em>{meta}</em></article>}

function PostsView({installations,selected,assets,tickets,reviews,assignments,users,shifts,supervisionRules,saveSupervisionRule,role,onRefresh,onSelect,onNew,onEdit,onArchive,assignUser,createAsset}:{installations:Installation[];selected:Installation|null;assets:Asset[];tickets:Ticket[];reviews:Review[];assignments:Assignment[];users:SupervisionUser[];shifts:Shift[];supervisionRules:SupervisionRule[];saveSupervisionRule:(rule:Omit<SupervisionRule,'id'|'tenant_id'|'created_at'|'updated_at'>)=>Promise<boolean>;role:UserRole;onRefresh:()=>void;onSelect:(id:string)=>void;onNew:()=>void;onEdit:(p:Installation)=>void;onArchive:(id:string)=>Promise<void>;assignUser:(e:FormEvent<HTMLFormElement>)=>Promise<void>;createAsset:(e:FormEvent<HTMLFormElement>)=>Promise<void>}){
  const selectedAssets=selected?assets.filter(a=>a.instalacion_id===selected.id):[];
  const selectedTickets=selected?tickets.filter(t=>t.instalacion_id===selected.id):[];
  const selectedReviews=selected?reviews.filter(r=>r.instalacion_id===selected.id):[];
  const selectedAssignments=selected?assignments.filter(a=>a.instalacion_id===selected.id):[];
  return <section className="content-grid"><div className="panel supervision-wide"><div className="panel-header"><div><p className="eyebrow">Maestro operativo</p><h3>Todos los puestos</h3></div>{canAdmin(role)&&<button className="primary-button" onClick={onNew}>+ Nuevo puesto</button>}</div>
    {installations.length ? <div className="posts-table-wrap"><table className="posts-table">
      <thead><tr><th>Puesto</th><th>Estado operativo</th><th>Ubicación / geocerca</th><th>Última revista</th><th>Próximo turno</th><th>Acciones</th></tr></thead>
      <tbody>{installations.map(i=>{
        const postReviews=reviews.filter(r=>r.instalacion_id===i.id).sort((a,b)=>new Date(b.fecha_checkin||b.fecha_programada||0).getTime()-new Date(a.fecha_checkin||a.fecha_programada||0).getTime());
        const lastReview=postReviews[0];
        const nextShift=shifts.find(s=>s.activo);
        const isActive=i.estado.toLowerCase()==='activa';
        return <tr key={i.id} className={selected?.id===i.id?'posts-row-selected':''}>
          <td><div className="posts-name-cell"><strong>{i.codigo_puesto||'SIN CÓDIGO'} · {i.nombre}</strong><span>{i.tipo_puesto||'Fijo'}{i.sector?' · '+i.sector:''}</span></div></td>
          <td><div className="posts-status-stack"><span className={'posts-status '+(isActive?'is-active':'is-inactive')}>{isActive?'Activo':'Inhabilitado'}</span>{!nextShift&&<span className="posts-status is-alert">Alerta de turno</span>}</div></td>
          <td><div className="posts-location-cell"><strong>{i.direccion||i.ciudad||'Ubicación pendiente'}</strong><span>{i.latitud!==null&&i.longitud!==null?i.latitud.toFixed(5)+', '+i.longitud.toFixed(5):'Sin coordenadas GPS'} · Radio {i.geocerca_radio_m} m</span></div></td>
          <td><div className="posts-location-cell"><strong>{lastReview?.fecha_checkin?new Date(lastReview.fecha_checkin).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):i.ultima_revista_at?new Date(i.ultima_revista_at).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'Sin revista registrada'}</strong><span>{lastReview?lastReview.estado:'Pendiente de registro'}</span></div></td>
          <td><div className="posts-location-cell"><strong>{i.proxima_revista_at?new Date(i.proxima_revista_at).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):nextShift?.nombre||'Sin turno activo'}</strong><span>{nextShift?nextShift.hora_inicio+' – '+nextShift.hora_fin:'Configura un turno para generar alertas'}</span></div></td>
          <td><div className="posts-actions"><button type="button" className="posts-icon-button" title="Abrir ficha" aria-label="Abrir ficha" onClick={()=>onSelect(i.id)}>↗</button>{canAdmin(role)&&<button type="button" className="posts-icon-button" title="Editar puesto" aria-label="Editar puesto" onClick={()=>onEdit(i)}>✎</button>}{canAdmin(role)&&isActive&&<button type="button" className="posts-icon-button is-danger" title="Inhabilitar puesto" aria-label="Inhabilitar puesto" onClick={()=>void onArchive(i.id)}>⊘</button>}</div></td>
        </tr>;
      })}</tbody>
    </table></div> : <div className="posts-empty-state"><span>⌖</span><h4>Aún no hay puestos</h4><p>Crea el primer puesto para empezar a organizar la operación.</p><div><button className="ghost-button" onClick={onRefresh} type="button">↻ Actualizar lista</button>{canAdmin(role)&&<button className="primary-button" onClick={onNew} type="button">+ Nuevo puesto</button>}</div></div>}
  </div>
  {selected&&<PuestoZonaDetail installation={selected} assets={selectedAssets} tickets={selectedTickets} reviews={selectedReviews} assignments={selectedAssignments} users={users} shifts={shifts} supervisionRules={supervisionRules} saveSupervisionRule={saveSupervisionRule} role={role} onEdit={()=>onEdit(selected)} assignUser={assignUser} createAsset={createAsset}/>} 

  </section>;
}
function PostModal({editing,role,onClose,onSave}:{editing:Installation|null;role:UserRole;onClose:()=>void;onSave:(e:FormEvent<HTMLFormElement>)=>Promise<void>}){
 return <div className="supervision-modal"><form className="panel form-panel installation-form" onSubmit={onSave}><div className="panel-header"><div><p className="eyebrow">Maestro de puestos</p><h3>{editing?'Editar puesto':'Nuevo puesto de supervisión'}</h3></div><button type="button" className="text-button" onClick={onClose}>✕</button></div>
   <div className="form-section-title">Identificación</div><div className="field-row"><label>Código<input name="codigo_puesto" defaultValue={editing?.codigo_puesto||''} placeholder="P-0001"/></label><label>Nombre<input name="nombre" required defaultValue={editing?.nombre||''}/></label></div><div className="field-row"><label>Tipo<select name="tipo_puesto" defaultValue={editing?.tipo_puesto||'Fijo'}><option>Fijo</option><option>Residencial</option><option>Comercial</option><option>Industrial</option><option>Educativo</option><option>Otro</option></select></label><label>Sector<input name="sector" defaultValue={editing?.sector||''}/></label></div>
   <div className="form-section-title">Responsable</div><div className="field-row"><label>Coordinador<input name="coordinador_nombre" defaultValue={editing?.coordinador_nombre||''}/></label><label>Teléfono<input name="telefono_contacto" defaultValue={editing?.telefono_contacto||''}/></label></div>
   <div className="form-section-title">Ubicación</div><div className="field-row"><label>Ciudad<input name="ciudad" defaultValue={editing?.ciudad||''}/></label><label>Dirección<input name="direccion" defaultValue={editing?.direccion||''}/></label></div><label>Ubicación (latitud, longitud)<input name="coordenadas" type="text" inputMode="decimal" autoComplete="off" placeholder="10.994866764770233, -74.78713279687763" defaultValue={editing?.latitud!=null&&editing?.longitud!=null?`${editing.latitud}, ${editing.longitud}`:''}/><small className="helper-text">Escribe ambas coordenadas en el mismo campo, separadas por una coma.</small></label><div className="field-row"><label>Radio geocerca (m)<input name="geocerca_radio_m" type="number" min="25" max="5000" defaultValue={editing?.geocerca_radio_m||100}/></label><label>Estado<select name="estado" defaultValue={editing?.estado||'Activa'}><option>Activa</option><option>Inactiva</option></select></label></div>
   <div className="form-section-title">Control operativo</div><div className="field-row"><label>Dotación<select name="dotacion_estado" defaultValue={editing?.dotacion_estado||'Pendiente'}><option>Completa</option><option>Incompleta</option><option>Pendiente</option></select></label><label>Equipamiento<select name="equipamiento_estado" defaultValue={editing?.equipamiento_estado||'Operativo'}><option>Operativo</option><option>Con novedades</option><option>Pendiente</option></select></label></div><label>Fecha estudio de seguridad<input name="estudio_seguridad_fecha" type="date" defaultValue={editing?.estudio_seguridad_fecha||''}/></label><label>Observaciones<textarea name="observaciones" defaultValue={editing?.observaciones||''}/></label>
   <div className="context-card"><span className="code">VALIDACIÓN</span><strong>La sesión define el tenant y el rol.</strong><small>Las coordenadas y geocerca se validan también en PostgreSQL.</small></div><button className="primary-button" disabled={!canAdmin(role)}>{editing?'Guardar cambios':'Crear puesto'}</button>
 </form></div>;
}

function TicketModal({installations,assets,selectedId,onSelect,onClose,onSave,busy}:{installations:Installation[];assets:Asset[];selectedId:string;onSelect:(id:string)=>void;onClose:()=>void;onSave:(e:FormEvent<HTMLFormElement>)=>Promise<void>;busy:boolean}){
 const selectedAssets=assets.filter(a=>a.instalacion_id===selectedId);
 return <div className="supervision-modal"><form className="panel form-panel" onSubmit={onSave}><div className="panel-header"><div><p className="eyebrow">Gestión operativa</p><h3>Nueva novedad</h3></div><button type="button" className="text-button" onClick={onClose}>✕</button></div>
  <label>Puesto<select name="instalacion_id" value={selectedId} onChange={e=>onSelect(e.target.value)} required><option value="">Seleccionar puesto…</option>{installations.map(i=><option key={i.id} value={i.id}>{i.codigo_puesto||'Puesto'} · {i.nombre}</option>)}</select></label>
  <label>Activo<select name="activo_id"><option value="">Sin activo específico</option>{selectedAssets.map(a=><option key={a.id} value={a.id}>{a.codigo_activo||'SIN CÓDIGO'} · {a.nombre_activo}</option>)}</select></label>
  <div className="field-row"><label>Tipo<select name="tipo_novedad" defaultValue="Seguridad"><option>Seguridad</option><option>Infraestructura</option><option>Equipo</option><option>Personal</option><option>Acceso</option><option>Procedimiento</option><option>Otro</option></select></label><label>Criticidad<select name="criticidad" defaultValue="Media"><option>Baja</option><option>Media</option><option>Alta</option><option>Crítica</option></select></label></div>
  <label>Descripción<textarea name="descripcion" required placeholder="Describe la novedad…"/></label><label>SLA límite<input name="sla" type="datetime-local"/></label><button className="primary-button" disabled={busy||!selectedId}>{busy?'Registrando…':'Registrar novedad'}</button>
 </form></div>;
}

function ShiftsView({shifts,role,createShift,toggleShift}:{shifts:Shift[];role:UserRole;createShift:(e:FormEvent<HTMLFormElement>)=>Promise<void>;toggleShift:(id:string,active:boolean)=>Promise<void>}){
 return <section className="content-grid"><div className="panel"><div className="panel-header"><div><p className="eyebrow">Programación</p><h3>Turnos</h3></div></div><div className="data-list">{shifts.map(s=><article className="data-item" key={s.id}><div><span className="code">{s.activo?'ACTIVO':'INACTIVO'}</span><h3>{s.nombre}</h3><p>{s.hora_inicio} → {s.hora_fin} · {s.frecuencia_revistas} revista(s)</p></div>{canAdmin(role)&&<button className="text-button" onClick={()=>void toggleShift(s.id,s.activo)}>{s.activo?'Desactivar':'Activar'}</button>}</article>)}{!shifts.length&&<div className="empty-state">No hay turnos configurados.</div>}</div></div>{canAdmin(role)&&<form className="panel form-panel" onSubmit={createShift}><div className="panel-header"><div><p className="eyebrow">Alta</p><h3>Nuevo turno</h3></div></div><label>Nombre<input name="nombre" required placeholder="Turno nocturno"/></label><div className="field-row"><label>Inicio<input name="hora_inicio" type="time" required/></label><label>Fin<input name="hora_fin" type="time" required/></label></div><label>Frecuencia de revistas<input name="frecuencia_revistas" type="number" min="1" defaultValue="1"/></label><button className="primary-button">Crear turno</button></form>}</section>;
}

function AssetsView({assets,installations,selectedId,role,createAsset}:{assets:Asset[];installations:Installation[];selectedId:string;role:UserRole;createAsset:(e:FormEvent<HTMLFormElement>)=>Promise<void>}){
 return <section className="content-grid"><div className="panel supervision-wide"><div className="panel-header"><div><p className="eyebrow">Inventario físico</p><h3>Activos por puesto</h3></div><span>{assets.length} activos</span></div><div className="data-list">{assets.map(a=><article className="data-item" key={a.id}><div><span className="code">{a.codigo_activo||'SIN CÓDIGO'} · {a.estado}</span><h3>{a.nombre_activo}</h3><p>{installations.find(i=>i.id===a.instalacion_id)?.nombre||'Puesto'} · {a.tipo_activo||'Sin tipo'} · {a.ubicacion_detalle||'Sin ubicación'}</p></div><small>{a.qr_codigo?'QR ':''}{a.nfc_codigo?'NFC':''}</small></article>)}{!assets.length&&<div className="empty-state">No hay activos registrados.</div>}</div></div>{canAdmin(role)&&selectedId&&<form className="panel form-panel" onSubmit={createAsset}><div className="panel-header"><div><p className="eyebrow">Alta rápida</p><h3>Activo del puesto</h3></div></div><label>Nombre<input name="nombre_activo" required/></label><div className="field-row"><label>Código<input name="codigo_activo"/></label><label>Tipo<input name="tipo_activo"/></label></div><div className="field-row"><label>QR<input name="qr_codigo"/></label><label>NFC<input name="nfc_codigo"/></label></div><label>Ubicación<input name="ubicacion_detalle"/></label><button className="primary-button">Registrar activo</button></form>}</section>;
}

function ReviewsView({reviews,installations,selectedId,gpsBusy,onSelect,checkin,onFinish}:{reviews:Review[];installations:Installation[];selectedId:string;gpsBusy:boolean;onSelect:(id:string)=>void;checkin:(m:'GPS'|'QR'|'NFC')=>Promise<void>;onFinish:(id:string)=>Promise<void>}){
 const rows=selectedId?reviews.filter(r=>r.instalacion_id===selectedId):reviews;
 return <section className="content-grid"><div className="panel"><div className="panel-header"><div><p className="eyebrow">Inspección física</p><h3>Check-in</h3></div></div><label>Puesto<select value={selectedId} onChange={e=>onSelect(e.target.value)}><option value="">Seleccionar…</option>{installations.map(i=><option key={i.id} value={i.id}>{i.codigo_puesto||'Puesto'} · {i.nombre}</option>)}</select></label><div className="checkin-actions"><button className="primary-button" onClick={()=>void checkin('GPS')} disabled={gpsBusy}>✓ GPS</button><button className="ghost-button" onClick={()=>void checkin('QR')} disabled={gpsBusy}>QR</button><button className="ghost-button" onClick={()=>void checkin('NFC')} disabled={gpsBusy}>NFC</button></div><p className="helper-text">La geocerca y el código se validan en el servidor.</p></div><div className="panel"><div className="panel-header"><div><p className="eyebrow">Histórico</p><h3>Revistas</h3></div><span>{rows.length}</span></div><div className="data-list">{rows.map(r=><article className="data-item" key={r.id}><div><span className="code">REV-{r.numero_revista} · {r.estado}</span><h3>{installations.find(i=>i.id===r.instalacion_id)?.nombre||'Puesto'}</h3><p>{r.metodo_checkin||'—'} · {r.fecha_checkin?new Date(r.fecha_checkin).toLocaleString('es-CO'):'Sin check-in'} · {r.distancia_checkin_m!=null?Math.round(r.distancia_checkin_m)+' m':''}</p></div>{r.estado==='En curso'&&<button className="text-button" onClick={()=>void onFinish(r.id)}>Completar</button>}</article>)}{!rows.length&&<div className="empty-state">No hay revistas.</div>}</div></div></section>;
}

function TicketsView({tickets,installations,selectedId,onMove}:{tickets:Ticket[];installations:Installation[];selectedId:string;onMove:(id:string,n:'En proceso'|'Cerrado')=>Promise<void>}){
 const rows=selectedId?tickets.filter(t=>t.instalacion_id===selectedId):tickets;
 return <section className="panel"><div className="panel-header"><div><p className="eyebrow">Incidentes</p><h3>Novedades</h3></div><span>{rows.length}</span></div><div className="data-list">{rows.map(t=><article className="data-item" key={t.id}><div><span className="code">#{t.numero_ticket} · {t.criticidad} · {t.estado_ticket}</span><h3>{t.tipo_novedad}</h3><p>{installations.find(i=>i.id===t.instalacion_id)?.nombre||'Puesto'} · {t.descripcion}</p><p>{t.sla_limite?'SLA '+new Date(t.sla_limite).toLocaleString('es-CO'):'Sin SLA'}</p></div><div className="data-item-side">{t.estado_ticket==='Abierto'&&<button className="text-button" onClick={()=>void onMove(t.id,'En proceso')}>En proceso</button>}{t.estado_ticket==='En proceso'&&<button className="text-button danger" onClick={()=>void onMove(t.id,'Cerrado')}>Cerrar</button>}</div></article>)}{!rows.length&&<div className="empty-state">No hay novedades.</div>}</div></section>;
}

function EvidenceView({evidences}:{evidences:Evidence[]}){return <section className="panel"><div className="panel-header"><div><p className="eyebrow">Soportes</p><h3>Evidencias</h3></div><span>{evidences.length}</span></div><div className="data-list">{evidences.map(e=><article className="data-item" key={e.id}><div><span className="code">{e.mime_type||'archivo'}</span><h3>{e.nombre_archivo||e.storage_path}</h3><p>{e.novedad_id?'Novedad':e.revista_id?'Revista':'Activo'} · {e.captured_at?new Date(e.captured_at).toLocaleString('es-CO'):'Sin captura'}</p></div><small>{e.tamano_bytes?Math.round(e.tamano_bytes/1024)+' KB':''}</small></article>)}{!evidences.length&&<div className="empty-state">No hay evidencias.</div>}</div></section>;}

function MaintenanceView({maintenances,assets}:{maintenances:Maintenance[];assets:Asset[]}){return <section className="panel"><div className="panel-header"><div><p className="eyebrow">Conservación</p><h3>Mantenimientos</h3></div><span>{maintenances.length}</span></div><div className="data-list">{maintenances.map(m=><article className="data-item" key={m.id}><div><span className="code">{m.tipo_mantenimiento}</span><h3>{assets.find(a=>a.id===m.activo_id)?.nombre_activo||'Activo'}</h3><p>{m.descripcion||'Sin descripción'} · {m.resultado||'Sin resultado'}</p></div><small>{m.fecha_inicio?new Date(m.fecha_inicio).toLocaleString('es-CO'):'Sin fecha'}</small></article>)}{!maintenances.length&&<div className="empty-state">No hay mantenimientos.</div>}</div></section>;}

function AnomaliesView({anomalies,installations}:{anomalies:Anomaly[];installations:Installation[]}){return <section className="panel"><div className="panel-header"><div><p className="eyebrow">Excepciones</p><h3>Anomalías</h3></div><span>{anomalies.length}</span></div><div className="data-list">{anomalies.map(a=><article className="data-item" key={a.id}><div><span className="code">{a.severidad} · {a.estado}</span><h3>{a.tipo_anomalia}</h3><p>{installations.find(i=>i.id===a.instalacion_id)?.nombre||'Puesto'} · {a.descripcion}</p></div></article>)}{!anomalies.length&&<div className="empty-state">No hay anomalías.</div>}</div></section>;}

function AuditView({audits,notifications,unread,markNotification}:{audits:Audit[];notifications:Notification[];unread:Notification[];markNotification:(id:string)=>Promise<void>}){return <section className="content-grid"><div className="panel supervision-wide"><div className="panel-header"><div><p className="eyebrow">Trazabilidad</p><h3>Auditoría</h3></div><span>{audits.length}</span></div><div className="data-list">{audits.map(a=><article className="data-item" key={a.id}><div><span className="code">{a.accion} · {a.entidad}</span><h3>{a.usuario_nombre||a.usuario_id||'Sistema'}</h3><p>{a.created_at?new Date(a.created_at).toLocaleString('es-CO'):''}</p></div></article>)}{!audits.length&&<div className="empty-state">No hay eventos.</div>}</div></div><div className="panel"><div className="panel-header"><div><p className="eyebrow">Alertas</p><h3>Notificaciones</h3></div><span>{unread.length} sin leer</span></div><div className="data-list">{notifications.map(n=><article className="data-item" key={n.id}><div><span className="code">{n.tipo}</span><h3>{n.titulo}</h3><p>{n.mensaje}</p></div>{!n.leida&&<button className="text-button" onClick={()=>void markNotification(n.id)}>Marcar leída</button>}</article>)}{!notifications.length&&<div className="empty-state">No hay notificaciones.</div>}</div></div></section>;}

function ConfigurationView({noveltyTypes,slaPolicies,checklists,checkItems,role}:{noveltyTypes:NoveltyType[];slaPolicies:SlaPolicy[];checklists:Checklist[];checkItems:ChecklistItem[];role:UserRole}){
 return <section className="content-grid"><div className="panel"><div className="panel-header"><div><p className="eyebrow">Catálogo</p><h3>Tipos de novedad</h3></div></div><div className="data-list">{noveltyTypes.map(t=><article className="data-item" key={t.id}><div><span className="code">ACTIVO</span><h3>{t.nombre}</h3><p>{t.descripcion||'Sin descripción'}</p></div></article>)}{!noveltyTypes.length&&<div className="empty-state">No hay tipos configurados.</div>}</div></div><div className="panel"><div className="panel-header"><div><p className="eyebrow">SLA</p><h3>Políticas por criticidad</h3></div></div><div className="data-list">{slaPolicies.map(s=><article className="data-item" key={s.id}><div><span className="code">{s.criticidad}</span><h3>{s.nombre}</h3><p>Respuesta {s.minutos_respuesta} min · Resolución {s.minutos_resolucion} min</p></div><span>{s.activo?'Activo':'Inactivo'}</span></article>)}{!slaPolicies.length&&<div className="empty-state">No hay SLA configurado.</div>}</div></div><div className="panel supervision-wide"><div className="panel-header"><div><p className="eyebrow">Plantillas</p><h3>Checklists de revista</h3><p className="helper-text">Configuración operativa. Los puestos se administran exclusivamente en su módulo.</p></div></div><div className="data-list">{checklists.map(c=><article className="data-item" key={c.id}><div><span className="code">{c.activo?'ACTIVO':'INACTIVO'}</span><h3>{c.nombre}</h3><p>{checkItems.filter(i=>i.checklist_id===c.id).length} puntos</p></div></article>)}{!checklists.length&&<div className="empty-state">No hay checklists.</div>}</div>{!canAdmin(role)&&<p className="helper-text">Solo administración puede modificar catálogos.</p>}</div></section>;
}
