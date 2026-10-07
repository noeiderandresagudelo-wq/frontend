import { useEffect, useMemo, useState } from 'react';
import { createAuthedSupabaseClient } from './lib/supabase';
import type { UserRole } from './api';
import './supervisor-mobile.css';

type Props={token:string;tenantId:string;role:UserRole};
type Installation={id:string;nombre:string;direccion:string|null;geocerca_radio_m:number};
type Ticket={id:string;numero_ticket:string;tipo_novedad:string;criticidad:string;estado_ticket:string;descripcion:string;instalacion_id:string;sla_limite:string|null};
type CheckItem={id:string;texto:string;obligatorio:boolean;orden:number};
type Answer={resultado:'Cumple'|'No cumple'|'No aplica';observacion:string};
type Review={id:string;numero_revista:number;instalacion_id:string;estado:string;metodo_checkin:string|null;fecha_checkin:string|null;fecha_cierre:string|null;observaciones:string|null;distancia_checkin_m:number|null};

const DEFAULT_CHECKLIST:CheckItem[]=[
 {id:'default-1',texto:'Minuta de servicio al día',obligatorio:true,orden:1},
 {id:'default-2',texto:'Dotación y elementos de seguridad completos',obligatorio:true,orden:2},
 {id:'default-3',texto:'Radio / celular operativo',obligatorio:true,orden:3},
 {id:'default-4',texto:'CCTV y alarmas funcionando',obligatorio:true,orden:4},
 {id:'default-5',texto:'Personal identificado y en condiciones de servicio',obligatorio:true,orden:5},
 {id:'default-6',texto:'Accesos, perímetro y novedades controlados',obligatorio:true,orden:6},
];

export default function SupervisorMobile({token,tenantId}:Props){
 const db=useMemo(()=>createAuthedSupabaseClient(token),[token]);
 const [installations,setInstallations]=useState<Installation[]>([]);
 const [tickets,setTickets]=useState<Ticket[]>([]);
 const [tab,setTab]=useState<'inicio'|'revista'|'novedad'|'alertas'|'historial'>('inicio');
 const [selected,setSelected]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [review,setReview]=useState<Review|null>(null);
 const [checkItems,setCheckItems]=useState<CheckItem[]>(DEFAULT_CHECKLIST);
 const [answers,setAnswers]=useState<Record<string,Answer>>({});
 const [reviewObservation,setReviewObservation]=useState('');
 const [reviewHistory,setReviewHistory]=useState<Review[]>([]);
 const [evidencePreview,setEvidencePreview]=useState('');
 const [form,setForm]=useState({tipo:'Seguridad',criticidad:'Media',descripcion:''});

 const loadChecklist=async()=>{
   const {data:lists,error:listError}=await db.from('supervision_checklists').select('id,nombre').eq('activo',true).order('created_at').limit(1);
   if(listError||!lists?.[0]){setCheckItems(DEFAULT_CHECKLIST);return;}
   const {data:items,error}=await db.from('supervision_checklist_items').select('id,texto,obligatorio,orden').eq('checklist_id',lists[0].id).order('orden');
   if(!error&&items?.length)setCheckItems(items as CheckItem[]);else setCheckItems(DEFAULT_CHECKLIST);
 };

 const load=async()=>{
   setBusy(true);
   const [i,n,r,h]=await Promise.all([
     db.from('supervision_instalaciones').select('id,nombre,direccion,geocerca_radio_m').order('nombre').limit(100),
     db.from('supervision_novedades').select('id,numero_ticket,tipo_novedad,criticidad,estado_ticket,descripcion,instalacion_id,sla_limite').neq('estado_ticket','Cerrado').order('created_at',{ascending:false}).limit(20),
     db.from('supervision_revistas').select('id,numero_revista,instalacion_id,estado,metodo_checkin,fecha_checkin,fecha_cierre,observaciones,distancia_checkin_m').eq('estado','En curso').order('fecha_checkin',{ascending:false}).limit(1),
     db.from('supervision_revistas').select('id,numero_revista,instalacion_id,estado,metodo_checkin,fecha_checkin,fecha_cierre,observaciones,distancia_checkin_m').in('estado',['Completada','Incidencia']).order('fecha_cierre',{ascending:false}).limit(10),
   ]);
   if(i.error)setMessage(i.error.message);else setInstallations(i.data||[]);
   if(n.error)setMessage(n.error.message);else setTickets(n.data||[]);
   if(!r.error&&r.data?.[0]){setReview(r.data[0]);setTab('revista');}
   if(!h.error)setReviewHistory(h.data||[]);
   setBusy(false);
 };
 useEffect(()=>{void load();void loadChecklist()},[]);

 const selectedInstallation=installations.find(i=>i.id===selected)||installations[0];
 const activeReviewInstallation=installations.find(i=>i.id===review?.instalacion_id);
 const critical=tickets.filter(t=>t.criticidad==='Crítica').length;
 const answered=checkItems.filter(i=>!!answers[i.id]?.resultado).length;
 const allRequired=checkItems.filter(i=>i.obligatorio).every(i=>!!answers[i.id]?.resultado);

 const startReview=async(method:'GPS'|'QR'|'NFC'='GPS')=>{
   if(!selectedInstallation)return setMessage('Selecciona un puesto antes de iniciar la revista.');
   setBusy(true);
   try{
     const args:{p_instalacion:string;p_metodo:string;p_lat?:number;p_lng?:number;p_codigo?:string}={p_instalacion:selectedInstallation.id,p_metodo:method};
     if(method==='GPS'){
       const pos=await new Promise<GeolocationPosition>((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:15000}));
       args.p_lat=pos.coords.latitude;args.p_lng=pos.coords.longitude;
     }else{
       const code=prompt(method==='QR'?'Código QR del puesto:':'Identificador NFC del puesto:');
       if(!code)return;
       args.p_codigo=code.trim();
     }
     const {data,error}=await db.rpc('supervision_checkin',args);
     if(error)throw new Error(error.message);
     const row=(Array.isArray(data)?data[0]:data) as Review;
     setReview(row);setSelected(selectedInstallation.id);setAnswers({});setReviewObservation('');await loadChecklist();setMessage('Llegada registrada. Revista iniciada.');setTab('revista');
   }catch(e){setMessage(e instanceof Error?e.message:'No fue posible registrar la llegada.')}
   finally{setBusy(false)}
 };

 const finishReview=async()=>{
   if(!review)return;
   if(!allRequired)return setMessage('Completa todos los puntos obligatorios antes de finalizar.');
   setBusy(true);
   try{
     const realItems=checkItems.filter(i=>!i.id.startsWith('default-'));
     if(realItems.length){
       const rows=realItems.map(i=>({tenant_id:tenantId,revista_id:review.id,item_id:i.id,resultado:answers[i.id].resultado,observacion:answers[i.id].observacion||null}));
       const {error}=await db.from('supervision_revista_respuestas').upsert(rows,{onConflict:'revista_id,item_id'});
       if(error)throw new Error(error.message);
     }
     const metadata={checklist:checkItems.map(i=>({item:i.texto,resultado:answers[i.id]?.resultado||'Pendiente',observacion:answers[i.id]?.observacion||''})),evidencia_local:!!evidencePreview};
     const {error}=await db.from('supervision_revistas').update({estado:'Completada',fecha_cierre:new Date().toISOString(),observaciones:reviewObservation.trim()||null,metadata}).eq('id',review.id);
     if(error)throw new Error(error.message);
     setMessage('Revista finalizada y guardada correctamente.');setReview(null);setAnswers({});setEvidencePreview('');setReviewObservation('');await load();setTab('inicio');
   }catch(e){setMessage(e instanceof Error?e.message:'No fue posible guardar la revista.')}
   finally{setBusy(false)}
 };

 const createNovelty=async()=>{
   if(!selectedInstallation||!form.descripcion.trim())return setMessage('Selecciona puesto y describe la novedad.');
   setBusy(true);
   const {error}=await db.from('supervision_novedades').insert({tenant_id:tenantId,instalacion_id:selectedInstallation.id,tipo_novedad:form.tipo,criticidad:form.criticidad,descripcion:form.descripcion.trim()});
   setMessage(error?error.message:'Novedad registrada correctamente.');
   if(!error){setForm({tipo:'Seguridad',criticidad:'Media',descripcion:''});await load();setTab('inicio')}
   setBusy(false);
 };

 const updateAnswer=(id:string,resultado:Answer['resultado'])=>setAnswers(v=>({...v,[id]:{resultado,observacion:v[id]?.observacion||''}}));

 return <div className="supervisor-mobile">
  <header className="sm-header">
   <div><div className="sm-brand"><span className="sm-shield">◆</span><b>Alarvix Field</b></div><small>SUPERVISIÓN OPERATIVA · EN CAMPO</small></div>
   <button aria-label="Actualizar" onClick={()=>void load()}>{busy?'…':'↻'}</button>
  </header>
  {message&&<div className="sm-message">{message}<button onClick={()=>setMessage('')}>×</button></div>}

  {tab==='inicio'&&<main>
   <section className="sm-hero"><div><span>SUPERVISOR DE OPERACIONES</span><strong>Control de puestos</strong><small>{busy?'Sincronizando operación…':'Servicio operativo activo'}</small></div><div className="sm-live"><i/> EN LÍNEA</div></section>
   <section className="sm-post-card">
    <div className="sm-post-head"><div><span>INICIAR NUEVA REVISTA</span><strong>{selectedInstallation?.nombre||'Selecciona un puesto'}</strong></div><button onClick={()=>setTab('revista')}>⌁</button></div>
    <label className="sm-label">SELECCIONAR PUESTO</label>
    <select className="sm-select" value={selected||selectedInstallation?.id||''} onChange={e=>setSelected(e.target.value)}>{installations.map(i=><option key={i.id} value={i.id}>{i.nombre}</option>)}</select>
    {selectedInstallation&&<div className="sm-location"><div className="sm-map-placeholder"><span>●</span><b>{selectedInstallation.nombre}</b><small>{selectedInstallation.direccion||'Ubicación configurada'}</small></div><div className="sm-valid">✓ Puesto disponible</div></div>}
    <button className="sm-launch" disabled={busy||!selectedInstallation} onClick={()=>void startReview()}><span>🚀</span><div><b>INICIAR REVISTA OPERATIVA</b><small>Registrar llegada GPS y completar checklist</small></div><strong>▣</strong></button>
   </section>
   <div className="sm-kpis"><article><b>{tickets.length}</b><span>Novedades abiertas</span></article><article className={critical?'critical':''}><b>{critical}</b><span>Alertas críticas</span></article><article><b>{reviewHistory.length}</b><span>Revistas cerradas</span></article></div>
   <section className="sm-section"><div className="sm-section-title"><h2>HISTORIAL RECIENTE</h2><button onClick={()=>setTab('historial')}>Ver todo</button></div>{reviewHistory.slice(0,3).map(r=><article className="sm-history-item" key={r.id}><span className="sm-status-dot">✓</span><div><b>Revista #{r.numero_revista}</b><small>{installations.find(i=>i.id===r.instalacion_id)?.nombre||'Puesto'} · {r.fecha_cierre?new Date(r.fecha_cierre).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}):'—'}</small></div><em>{r.estado}</em></article>)}{!reviewHistory.length&&<p className="sm-empty">Aún no hay revistas cerradas.</p>}</section>
   <section className="sm-section"><div className="sm-section-title"><h2>REPORTE RÁPIDO</h2><button onClick={()=>setTab('alertas')}>Ver alertas</button></div>{tickets.slice(0,3).map(t=><article className="sm-alert-row" key={t.id}><span className={t.criticidad==='Crítica'?'red':t.criticidad==='Alta'?'amber':'blue'}>⚑</span><div><b>{t.tipo_novedad}</b><small>{t.descripcion}</small></div></article>)}{!tickets.length&&<p className="sm-empty">Sin alertas activas.</p>}</section>
  </main>}

  {tab==='revista'&&<main>
   <section className="sm-review-header"><div><span>REVISTA DE CONTROL A PUESTO</span><strong>{activeReviewInstallation?.nombre||selectedInstallation?.nombre||'Puesto'}</strong></div>{review?<em>#{review.numero_revista}</em>:<em>NUEVA</em>}</section>
   {!review&&<section className="sm-section"><label className="sm-label">PUESTO A SUPERVISAR</label><select className="sm-select" value={selected||selectedInstallation?.id||''} onChange={e=>setSelected(e.target.value)}>{installations.map(i=><option key={i.id} value={i.id}>{i.nombre}</option>)}</select><div className="sm-checkin-row"><button onClick={()=>void startReview('GPS')} disabled={busy}>📍 GPS</button><button onClick={()=>void startReview('QR')} disabled={busy}>▣ QR</button><button onClick={()=>void startReview('NFC')} disabled={busy}>⌁ NFC</button></div></section>}
   {review&&<section className="sm-section sm-arrival"><div><span>1. UBICACIÓN Y PUESTO</span><strong>✓ Llegada registrada · {review.metodo_checkin||'GPS'}</strong><small>{review.distancia_checkin_m!=null?'GPS validado a '+Math.round(review.distancia_checkin_m)+' m':'Presencia validada por el servidor'}</small></div><b>✓</b></section>}
   {review&&<section className="sm-section"><div className="sm-section-title"><h2>2. PERSONAL EN SERVICIO</h2><span className="sm-chip green">● ÓPTIMO</span></div><div className="sm-person"><span className="sm-avatar">S</span><div><b>Supervisor operativo</b><small>Presencia confirmada mediante check-in</small></div></div></section>}
   {review&&<section className="sm-section"><div className="sm-section-title"><h2>3. INSPECCIÓN DEL PUESTO</h2><span>{answered}/{checkItems.length}</span></div><div className="sm-checklist">{checkItems.map(item=><div className="sm-check-item" key={item.id}><div><b>{item.texto}</b>{item.obligatorio&&<small>Obligatorio</small>}</div><div className="sm-check-actions"><button className={answers[item.id]?.resultado==='Cumple'?'selected ok':''} onClick={()=>updateAnswer(item.id,'Cumple')}>✓</button><button className={answers[item.id]?.resultado==='No cumple'?'selected bad':''} onClick={()=>updateAnswer(item.id,'No cumple')}>!</button><button className={answers[item.id]?.resultado==='No aplica'?'selected na':''} onClick={()=>updateAnswer(item.id,'No aplica')}>—</button></div></div>)}</div></section>}
   {review&&<section className="sm-section"><div className="sm-section-title"><h2>4. NOVEDADES Y EVIDENCIA</h2><span>{evidencePreview?'1 foto':'Sin foto'}</span></div><textarea className="sm-textarea" value={reviewObservation} onChange={e=>setReviewObservation(e.target.value)} placeholder="Escribe observaciones del puesto..." /><div className="sm-evidence-actions"><label>📷 Tomar foto<input type="file" accept="image/*" capture="environment" onChange={e=>{const file=e.target.files?.[0];if(file)setEvidencePreview(URL.createObjectURL(file))}} /></label><button onClick={()=>setTab('novedad')}>⚠ Reportar novedad</button></div>{evidencePreview&&<img className="sm-evidence-preview" src={evidencePreview} alt="Evidencia capturada" />}</section>}
   {review&&<button className="sm-finish" disabled={busy||!allRequired} onClick={()=>void finishReview()}>{busy?'GUARDANDO…':'🚀 FINALIZAR Y GUARDAR REVISTA'}</button>}
  </main>}

  {tab==='novedad'&&<main><section className="sm-section"><div className="sm-section-title"><h2>NUEVA NOVEDAD</h2><span>REPORTE RÁPIDO</span></div><label className="sm-label">PUESTO</label><select className="sm-select" value={selected||selectedInstallation?.id||''} onChange={e=>setSelected(e.target.value)}>{installations.map(i=><option key={i.id} value={i.id}>{i.nombre}</option>)}</select><label className="sm-label">TIPO</label><select className="sm-select" value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})}><option>Seguridad</option><option>Infraestructura</option><option>Acceso</option><option>Equipo</option><option>Personal</option><option>Procedimiento</option><option>Otro</option></select><label className="sm-label">CRITICIDAD</label><select className="sm-select" value={form.criticidad} onChange={e=>setForm({...form,criticidad:e.target.value})}><option>Baja</option><option>Media</option><option>Alta</option><option>Crítica</option></select><textarea className="sm-textarea" value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})} placeholder="Describe la novedad, hallazgo o condición encontrada..." /><button className="sm-finish" disabled={busy} onClick={()=>void createNovelty()}>⚠ REGISTRAR NOVEDAD</button></section></main>}

  {tab==='alertas'&&<main><section className="sm-section"><div className="sm-section-title"><h2>ALERTAS ACTIVAS</h2><span>{tickets.length}</span></div>{tickets.map(t=><article className="sm-alert-card" key={t.id}><span className={t.criticidad==='Crítica'?'red':t.criticidad==='Alta'?'amber':'blue'}>⚑</span><div><b>{t.tipo_novedad} · #{t.numero_ticket}</b><small>{t.descripcion}</small><em>{t.criticidad} · {t.estado_ticket}</em></div></article>)}{!tickets.length&&<p className="sm-empty">No hay alertas activas.</p>}</section></main>}

  {tab==='historial'&&<main><section className="sm-section"><div className="sm-section-title"><h2>HISTORIAL DE REVISTAS</h2><span>{reviewHistory.length}</span></div>{reviewHistory.map(r=><article className="sm-history-item" key={r.id}><span className="sm-status-dot">✓</span><div><b>Revista #{r.numero_revista}</b><small>{installations.find(i=>i.id===r.instalacion_id)?.nombre||'Puesto'} · {r.fecha_cierre?new Date(r.fecha_cierre).toLocaleString('es-CO'):'—'}</small></div><em>{r.estado}</em></article>)}{!reviewHistory.length&&<p className="sm-empty">No hay historial todavía.</p>}</section></main>}

  <nav className="sm-bottom"><button className={tab==='inicio'?'active':''} onClick={()=>setTab('inicio')}>⌂<span>Inicio</span></button><button className={tab==='revista'?'active':''} onClick={()=>setTab('revista')}>✓<span>Revista</span></button><button className={tab==='novedad'?'active':''} onClick={()=>setTab('novedad')}>⚑<span>Novedad</span></button><button className={tab==='alertas'?'active':''} onClick={()=>setTab('alertas')}>◉<span>Alertas</span></button><button className={tab==='historial'?'active':''} onClick={()=>setTab('historial')}>▤<span>Historial</span></button></nav>
 </div>;
}
