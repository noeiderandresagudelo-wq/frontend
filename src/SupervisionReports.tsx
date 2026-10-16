import { useCallback, useEffect, useMemo, useState } from 'react';
import { createAuthedSupabaseClient } from './lib/supabase';

type Site = { id:string; codigo_puesto?:string|null; nombre:string; estado?:string };
type TimeWindow = { inicio:string; fin:string };
type Rule = { instalacion_id:string; revistas_requeridas:number; periodo_objetivo:'dia'|'turno'; ventanas_horarias:TimeWindow[]; tolerancia_omision_min:number; activo:boolean };
type Staff = { id:string; nombre:string; username?:string; rol:string; activo:boolean };
type Shift = { id:string; nombre:string; hora_inicio:string; hora_fin:string; activo:boolean };
type Review = { id:string; numero_revista:number; instalacion_id:string; supervisor_id:string; fecha_programada:string|null; fecha_checkin:string|null; fecha_cierre:string|null; estado:string; metodo_checkin:string|null; codigo_checkin?:string|null; latitud_checkin:number|null; longitud_checkin:number|null; distancia_checkin_m:number|null; observaciones:string|null; metadata?:Record<string,unknown>; created_at:string };
type Evidence = { id:string; revista_id:string|null; nombre_archivo:string|null; storage_path:string; mime_type:string|null; created_at:string };
type Route = { id:string; instalacion_id:string; nombre:string; descripcion:string|null; tiempo_estimado_minutos:number; activo:boolean };
type RoutePoint = { id:string; ruta_id:string; activo_id:string; orden:number; obligatorio:boolean };
type Round = { id:string; ruta_id:string; instalacion_id:string; guarda_id:string|null; guarda_nombre:string|null; programada_at:string; iniciada_at:string|null; finalizada_at:string|null; estado:string; observaciones:string|null; created_at:string };
type RoundMark = { id:string; ronda_id:string; punto_ruta_id:string; activo_id:string; metodo:string; marcado_at:string; latitud:number|null; longitud:number|null; distancia_m:number|null };
type Props = { token:string; tenantId:string; installations:Site[]; rules:Rule[]; users:Staff[]; shifts:Shift[] };
type DailyRow = { key:string; sortAt:string; fecha:string; puesto:string; codigoPuesto:string; supervisor:string; codigo:string; metodo:string; gps:string; estado:string; novedad:string; evidencias:string; esOmisio:boolean; esDuplicada:boolean };
type MonthlyRow = { id:string; codigo:string; puesto:string; programadas:number; ejecutadas:number; repetidas:number; omisas:number; efectividad:number; status:string };
type RoundRow = { id:string; fecha:string; puesto:string; ruta:string; guarda:string; inicio:string; fin:string; tiempo:number|null; estimado:number; puntos:string; porcentaje:number; salteados:string; estado:string; alerta:string };

const TZ='America/Bogota';
const fmtDateTime=(value:string|null|undefined)=>value?new Date(value).toLocaleString('es-CO',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
const dateKey=(value:string)=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).map(x=>[x.type,x.value]));return String(p.year)+'-'+String(p.month)+'-'+String(p.day);};
const clockAt=(value:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
const mins=(value:string)=>{const a=value.split(':').map(Number);return (a[0]||0)*60+(a[1]||0);};
const escXml=(v:unknown)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const escHtml=(v:unknown)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const safeName=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const toLocalInput=(d:Date)=>{const shifted=new Date(d.getTime()-d.getTimezoneOffset()*60000);return shifted.toISOString().slice(0,16);};
function initialRange(){const n=new Date();return {start:toLocalInput(new Date(n.getFullYear(),n.getMonth(),1,0,0)),end:toLocalInput(new Date(n.getFullYear(),n.getMonth(),n.getDate(),23,59))};}
function dateAtClock(day:string,clock:string){return new Date(day+'T'+clock+':00-05:00');}
function matchWindow(timestamp:string,windows:TimeWindow[],tolerance:number){
 const d=new Date(timestamp), day=dateKey(timestamp), c=mins(clockAt(timestamp));
 for(let i=0;i<windows.length;i++){
  const w=windows[i], start=mins(w.inicio), end=mins(w.fin);
  let a=dateAtClock(day,w.inicio), b=dateAtClock(day,w.fin);
  if(end<=start)b=new Date(b.getTime()+86400000);
  if(d.getTime()>=a.getTime()&&d.getTime()<=b.getTime())return {index:i,onTime:true};
  if(d.getTime()>b.getTime()&&d.getTime()<=b.getTime()+Math.max(0,tolerance)*60000)return {index:i,onTime:false};
  if(end<=start&&c<=end&&d.getTime()>=a.getTime()-86400000&&d.getTime()<=b.getTime()+Math.max(0,tolerance)*60000)return {index:i,onTime:d.getTime()<=b.getTime()};
 }
 return {index:-1,onTime:false};
}
function classifyReviews(reviews:Review[],sites:Site[],rules:Rule[],staff:Staff[],evidence:Evidence[]):DailyRow[]{
 const siteMap=new Map(sites.map(s=>[s.id,s])), ruleMap=new Map(rules.map(r=>[r.instalacion_id,r])), staffMap=new Map(staff.map(s=>[s.id,s]));
 const evMap=new Map<string,Evidence[]>();evidence.forEach(e=>{if(e.revista_id)evMap.set(e.revista_id,[...(evMap.get(e.revista_id)||[]),e]);});
 const seen=new Set<string>();
 return [...reviews].sort((a,b)=>new Date(a.fecha_checkin||a.created_at).getTime()-new Date(b.fecha_checkin||b.created_at).getTime()).map(r=>{
  const at=r.fecha_checkin||r.created_at, rule=ruleMap.get(r.instalacion_id);
  const m=rule&&rule.activo?matchWindow(at,rule.ventanas_horarias||[],rule.tolerancia_omision_min||0):{index:-1,onTime:false};
  const bucket=m.index>=0?'ventana-'+m.index:'fuera';
  const key=r.instalacion_id+'|'+dateKey(at)+'|'+bucket, duplicate=seen.has(key);seen.add(key);
  const status=duplicate?'Revista repetida / fuera de ciclo':!rule||!rule.activo?'Fuera de ciclo':m.index<0?'Con desfase / fuera de ventana':m.onTime?'A tiempo':'Con desfase / fuera de ventana';
  const s=siteMap.get(r.instalacion_id), ev=evMap.get(r.id)||[], lat=r.latitud_checkin,lng=r.longitud_checkin;
  const gps=lat!=null&&lng!=null?Number(lat).toFixed(6)+', '+Number(lng).toFixed(6)+(r.distancia_checkin_m!=null?' · '+Math.round(r.distancia_checkin_m)+' m geocerca':''):r.distancia_checkin_m!=null?Math.round(r.distancia_checkin_m)+' m geocerca':'—';
  return {key:r.id,sortAt:at,fecha:fmtDateTime(at),puesto:s?.nombre||'Puesto no disponible',codigoPuesto:s?.codigo_puesto||'—',
   supervisor:staffMap.get(r.supervisor_id)?.nombre||staffMap.get(r.supervisor_id)?.username||r.supervisor_id,
   codigo:r.codigo_checkin||String(r.metadata?.codigo_checkin||'—'),metodo:r.metodo_checkin||'—',gps,estado:status,novedad:r.observaciones||'—',
   evidencias:ev.length?ev.map(x=>x.nombre_archivo||x.storage_path.split('/').pop()||'Evidencia').join(', '):'—',esOmisio:false,esDuplicada:duplicate};
 });
}
function omittedSlots(startAt:string,endAt:string,sites:Site[],rules:Rule[],reviews:Review[],selectedSites:string[]){
 const start=new Date(startAt).getTime(),end=new Date(endAt).getTime(),now=Date.now(), out:{site:Site;day:string;window:TimeWindow;index:number;sortAt:string}[]=[];
 const from=dateKey(new Date(startAt).toISOString()),to=dateKey(new Date(endAt).toISOString()), ruleMap=new Map(rules.map(r=>[r.instalacion_id,r]));
 const cur=new Date(from+'T12:00:00-05:00'),last=new Date(to+'T12:00:00-05:00');
 for(;cur<=last;cur.setUTCDate(cur.getUTCDate()+1)){
  const day=dateKey(cur.toISOString());
  for(const site of sites){
   if(selectedSites.length&&!selectedSites.includes(site.id))continue;
   const rule=ruleMap.get(site.id);if(!rule||!rule.activo||!rule.ventanas_horarias?.length)continue;
   rule.ventanas_horarias.forEach((w,index)=>{
    const a=dateAtClock(day,w.inicio);let b=dateAtClock(day,w.fin);if(mins(w.fin)<=mins(w.inicio))b=new Date(b.getTime()+86400000);
    const due=b.getTime()+Math.max(0,rule.tolerancia_omision_min||0)*60000;
    if(a.getTime()<start||a.getTime()>end||due>now)return;
    const has=reviews.some(r=>{if(r.instalacion_id!==site.id)return false;const t=new Date(r.fecha_checkin||r.created_at).getTime();return t>=a.getTime()&&t<=due;});
    if(!has)out.push({site,day,window:w,index,sortAt:a.toISOString()});
   });
  }
 }
 return out;
}
function download(name:string,blob:Blob){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(u),1500);}
function toCsv(rows:(string|number|null)[][]){return '\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');}
type Cell=string|number|null|{formula:string;value:number;style?:number};
function crc32(bytes:Uint8Array){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c&1)?(c>>>1)^0xedb88320:c>>>1;}return (c^0xffffffff)>>>0;}
function createZip(files:{name:string;data:Uint8Array}[]){
 const enc=new TextEncoder(),local:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0,centralLength=0;
 const u16=(v:DataView,o:number,n:number)=>v.setUint16(o,n,true),u32=(v:DataView,o:number,n:number)=>v.setUint32(o,n>>>0,true);
 files.forEach(f=>{
  const name=enc.encode(f.name),data=f.data,crc=crc32(data),l=new Uint8Array(30+name.length+data.length),lv=new DataView(l.buffer);
  u32(lv,0,0x04034b50);u16(lv,4,20);u16(lv,6,0);u16(lv,8,0);u16(lv,10,0);u16(lv,12,0);u32(lv,14,crc);u32(lv,18,data.length);u32(lv,22,data.length);u16(lv,26,name.length);u16(lv,28,0);l.set(name,30);l.set(data,30+name.length);local.push(l);
  const c=new Uint8Array(46+name.length),cv=new DataView(c.buffer);u32(cv,0,0x02014b50);u16(cv,4,20);u16(cv,6,20);u16(cv,8,0);u16(cv,10,0);u16(cv,12,0);u16(cv,14,0);u32(cv,16,crc);u32(cv,20,data.length);u32(cv,24,data.length);u16(cv,28,name.length);u16(cv,30,0);u16(cv,32,0);u16(cv,34,0);u16(cv,36,0);u32(cv,38,0);u32(cv,42,offset);c.set(name,46);central.push(c);offset+=l.length;centralLength+=c.length;
 });
 const end=new Uint8Array(22),v=new DataView(end.buffer);u32(v,0,0x06054b50);u16(v,4,0);u16(v,6,0);u16(v,8,files.length);u16(v,10,files.length);u32(v,12,centralLength);u32(v,16,offset);u16(v,20,0);
 return new Blob([...local,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function toXlsx(sheets:{name:string;rows:Cell[][]}[]){
 const enc=new TextEncoder(),items:{name:string;data:Uint8Array}[]=[];
 const add=(n:string,s:string)=>items.push({name:n,data:enc.encode(s)});
 const letter=(n:number)=>{let a=n+1,s='';while(a){s=String.fromCharCode(65+(a-1)%26)+s;a=Math.floor((a-1)/26);}return s;};
 const safe=sheets.length?sheets:[{name:'Reporte',rows:[['Sin datos']]}];
 const cell=(c:Cell,ref:string)=>{
  if(c&&typeof c==='object'&&'formula'in c)return '<c r="'+ref+'"'+(c.style?' s="'+c.style+'"':'')+'><f>'+escXml(c.formula)+'</f><v>'+c.value+'</v></c>';
  if(typeof c==='number'&&Number.isFinite(c))return '<c r="'+ref+'"><v>'+c+'</v></c>';
  return '<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+escXml(c)+'</t></is></c>';
 };
 add('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+safe.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>');
 add('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
 add('xl/workbook.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+safe.map((s,i)=>'<sheet name="'+escXml(s.name.slice(0,31))+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
 add('xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+safe.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(safe.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
 add('xl/styles.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts><fonts count="1"><font><sz val="10"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
 safe.forEach((s,i)=>{
  const body=s.rows.map((row,ri)=>'<row r="'+(ri+1)+'">'+row.map((c,ci)=>cell(c,letter(ci)+(ri+1))).join('')+'</row>').join('');
  const lastCol=letter(Math.max(0,...s.rows.map(r=>r.length))-1);
  add('xl/worksheets/sheet'+(i+1)+'.xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+body+'</sheetData><autoFilter ref="A1:'+lastCol+Math.max(1,s.rows.length)+'"/></worksheet>');
 });
 return createZip(items);
}

export default function SupervisionReports({token,tenantId,installations,rules,users,shifts}:Props){
 const db=useMemo(()=>createAuthedSupabaseClient(token),[token]),initial=useMemo(()=>initialRange(),[]);
 const [startAt,setStartAt]=useState(initial.start),[endAt,setEndAt]=useState(initial.end),[appliedRange,setAppliedRange]=useState(initial);
 const [mode,setMode]=useState<'diario'|'mensual'|'rondas'>('diario'),[siteSearch,setSiteSearch]=useState(''),[selectedSites,setSelectedSites]=useState<string[]>([]);
 const [supervisorId,setSupervisorId]=useState(''),[method,setMethod]=useState('todos'),[codeSearch,setCodeSearch]=useState('');
 const [reviews,setReviews]=useState<Review[]>([]),[evidence,setEvidence]=useState<Evidence[]>([]),[routes,setRoutes]=useState<Route[]>([]),[points,setPoints]=useState<RoutePoint[]>([]),[rounds,setRounds]=useState<Round[]>([]),[marks,setMarks]=useState<RoundMark[]>([]);
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),[emailOpen,setEmailOpen]=useState(false),[email,setEmail]=useState('');
 const loadData=useCallback(async(range:{start:string;end:string})=>{
  if(!range.start||!range.end||new Date(range.start).getTime()>new Date(range.end).getTime()){setError('El rango de fecha/hora no es válido.');return;}
  setLoading(true);setError('');const a=new Date(range.start).toISOString(),b=new Date(range.end).toISOString();
  const [r,e,rt,pt,ro,rm]=await Promise.all([
   db.from('supervision_revistas').select('*').eq('tenant_id',tenantId).is('eliminado_at',null).gte('created_at',a).lte('created_at',b).order('created_at',{ascending:false}).limit(5000),
   db.from('supervision_evidencias').select('*').eq('tenant_id',tenantId).gte('created_at',a).lte('created_at',b).order('created_at',{ascending:false}).limit(5000),
   db.from('supervision_rutas_operativas').select('*').eq('tenant_id',tenantId).order('nombre').limit(2000),
   db.from('supervision_ruta_puntos').select('*').eq('tenant_id',tenantId).order('orden').limit(5000),
   db.from('supervision_rondas_operativas').select('*').eq('tenant_id',tenantId).gte('programada_at',a).lte('programada_at',b).order('programada_at',{ascending:false}).limit(5000),
   db.from('supervision_ronda_marcajes').select('*').eq('tenant_id',tenantId).order('marcado_at',{ascending:false}).limit(10000)
  ]);
  const errs=[r,e,rt,pt,ro,rm].filter(x=>x.error);if(errs.length)setError('Algunos datos no se pudieron cargar: '+errs.map(x=>x.error?.message).join(' · '));
  setReviews((r.data||[]) as Review[]);setEvidence((e.data||[]) as Evidence[]);setRoutes((rt.data||[]) as Route[]);setPoints((pt.data||[]) as RoutePoint[]);setRounds((ro.data||[]) as Round[]);setMarks((rm.data||[]) as RoundMark[]);setLoaded(true);setLoading(false);
 },[db,tenantId]);
 useEffect(()=>{void loadData(appliedRange);},[loadData,appliedRange]);

 const allRows=useMemo(()=>classifyReviews(reviews,installations,rules,users,evidence),[reviews,installations,rules,users,evidence]);
 const filteredRows=useMemo(()=>allRows.filter(row=>{
  const raw=reviews.find(r=>r.id===row.key);
  if(selectedSites.length&&!selectedSites.includes(raw?.instalacion_id||''))return false;
  if(supervisorId&&raw?.supervisor_id!==supervisorId)return false;
  if(method!=='todos'&&row.metodo.toUpperCase()!==method)return false;
  if(codeSearch&&!(row.codigo+' '+row.metodo).toLowerCase().includes(codeSearch.toLowerCase()))return false;
  return true;
 }),[allRows,reviews,selectedSites,supervisorId,method,codeSearch]);
 const missing=useMemo(()=>{
  if(mode==='rondas'||supervisorId||method!=='todos'||codeSearch)return [];
  return omittedSlots(appliedRange.start,appliedRange.end,installations,rules,reviews,selectedSites).map(x=>({
   key:'missing-'+x.site.id+'-'+x.day+'-'+x.index,sortAt:x.sortAt,fecha:x.day+' '+x.window.inicio+' · ventana '+x.window.inicio+'–'+x.window.fin,
   puesto:x.site.nombre,codigoPuesto:x.site.codigo_puesto||'—',supervisor:'Sin asignación',codigo:'—',metodo:'—',gps:'—',
   estado:'Omisión / no realizada',novedad:'Sin check-in dentro de la ventana programada.',evidencias:'—',esOmisio:true,esDuplicada:false
  } as DailyRow));
 },[mode,appliedRange,installations,rules,reviews,selectedSites,supervisorId,method,codeSearch]);
 const dailyRows=useMemo(()=>[...filteredRows,...missing].sort((a,b)=>new Date(b.sortAt).getTime()-new Date(a.sortAt).getTime()),[filteredRows,missing]);
 const dayCount=useMemo(()=>{const a=new Date(dateKey(new Date(appliedRange.start).toISOString())+'T12:00:00-05:00'),b=new Date(dateKey(new Date(appliedRange.end).toISOString())+'T12:00:00-05:00');return Math.max(1,Math.floor((b.getTime()-a.getTime())/86400000)+1);},[appliedRange]);
 const monthlyRows=useMemo<MonthlyRow[]>(()=>installations.filter(s=>!selectedSites.length||selectedSites.includes(s.id)).map(site=>{
  const rule=rules.find(r=>r.instalacion_id===site.id&&r.activo),programmed=rule?Math.max(0,rule.revistas_requeridas||0)*dayCount*(rule.periodo_objetivo==='turno'?Math.max(1,shifts.filter(x=>x.activo).length):1):0;
  const rows=allRows.filter(row=>reviews.find(r=>r.id===row.key)?.instalacion_id===site.id),executed=rows.filter(row=>!row.esDuplicada).length,repeated=rows.filter(row=>row.esDuplicada).length,onTime=rows.filter(row=>row.estado==='A tiempo').length;
  const effectiveness=programmed?Math.min(100,Math.round(onTime/programmed*100)):0,omitted=Math.max(0,programmed-executed);
  return {id:site.id,codigo:site.codigo_puesto||'—',puesto:site.nombre,programadas:programmed,ejecutadas:executed,repetidas:repeated,omisas:omitted,efectividad:effectiveness,status:!rule?'Sin parametrización':effectiveness>=90?'Cumplimiento alto':effectiveness>=75?'Atención':'Crítico'};
 }),[installations,selectedSites,rules,dayCount,shifts,allRows,reviews]);
 const overall=useMemo(()=>{
  const programmed=monthlyRows.reduce((n,r)=>n+r.programadas,0),executed=monthlyRows.reduce((n,r)=>n+r.ejecutadas,0),repeated=monthlyRows.reduce((n,r)=>n+r.repetidas,0),omitted=monthlyRows.reduce((n,r)=>n+r.omisas,0);
  const onTime=allRows.filter(r=>r.estado==='A tiempo'&&(!selectedSites.length||selectedSites.includes(reviews.find(x=>x.id===r.key)?.instalacion_id||''))).length;
  return {programmed,executed,repeated,omitted,rate:programmed?Math.min(100,Math.round(onTime/programmed*100)):0};
 },[monthlyRows,allRows,selectedSites,reviews]);
 const siteMap=useMemo(()=>new Map(installations.map(s=>[s.id,s])),[installations]),routeMap=useMemo(()=>new Map(routes.map(r=>[r.id,r])),[routes]),staffMap=useMemo(()=>new Map(users.map(s=>[s.id,s])),[users]);
 const roundRows=useMemo<RoundRow[]>(()=>rounds.filter(r=>!selectedSites.length||selectedSites.includes(r.instalacion_id)).map(round=>{
  const route=routeMap.get(round.ruta_id),site=siteMap.get(round.instalacion_id),required=points.filter(p=>p.ruta_id===round.ruta_id&&p.obligatorio),visitedMarks=marks.filter(m=>m.ronda_id===round.id),visited=new Set(visitedMarks.map(m=>m.punto_ruta_id));
  const count=required.filter(p=>visited.has(p.id)).length,skipped=required.filter(p=>!visited.has(p.id)).map(p=>'Punto '+p.orden).join(', ')||'—';
  const elapsed=round.iniciada_at&&round.finalizada_at?Math.max(0,Math.round((new Date(round.finalizada_at).getTime()-new Date(round.iniciada_at).getTime())/60000)):null;
  const late=!!round.iniciada_at&&new Date(round.iniciada_at).getTime()>new Date(round.programada_at).getTime()+15*60000;
  const alert=round.estado==='Omitida'?'Omisión de ronda':late?'Inicio tardío':round.estado==='Programada'&&new Date(round.programada_at).getTime()<Date.now()?'Ronda no iniciada':skipped!=='—'&&round.estado==='Completada'?'Puntos salteados':'—';
  return {id:round.id,fecha:fmtDateTime(round.programada_at),puesto:site?.nombre||'Puesto',ruta:route?.nombre||'Ruta',guarda:round.guarda_nombre||staffMap.get(round.guarda_id||'')?.nombre||round.guarda_id||'—',inicio:fmtDateTime(round.iniciada_at),fin:fmtDateTime(round.finalizada_at),tiempo:elapsed,estimado:route?.tiempo_estimado_minutos||0,puntos:count+' de '+required.length,porcentaje:required.length?Math.round(count/required.length*100):0,salteados:skipped,estado:round.estado,alerta:alert};
 }),[rounds,selectedSites,routeMap,siteMap,points,marks,staffMap]);
 const avgRound=roundRows.length?Math.round(roundRows.reduce((n,r)=>n+r.porcentaje,0)/roundRows.length):0,lateTone=(v:number)=>v>=90?'green':v>=75?'amber':'red';
 const supervisorOptions=users.filter(u=>u.activo&&(/supervisor|supervision/i.test(u.rol)||allRows.some(r=>reviews.find(x=>x.id===r.key)?.supervisor_id===u.id)));
 const shownSites=installations.filter(s=>(s.codigo_puesto+' '+s.nombre).toLowerCase().includes(siteSearch.toLowerCase()));
 const rangeCaption=fmtDateTime(new Date(appliedRange.start).toISOString())+' — '+fmtDateTime(new Date(appliedRange.end).toISOString());
 const title=mode==='diario'?'Reporte operativo diario · Revistas de supervisión':mode==='mensual'?'Cumplimiento ejecutivo · Revistas de supervisión':'Reporte de rondas operativas';
 let headers:string[]=[],exportRows:(string|number|null)[][]=[];
 if(mode==='diario'){
  headers=['Fecha/hora registro','Código puesto','Puesto','Supervisor','Ficha / QR / NFC leído','Método','Coordenadas GPS / geocerca','Estado cumplimiento','Novedades','Evidencias / fotos'];
  exportRows=dailyRows.map(r=>[r.fecha,r.codigoPuesto,r.puesto,r.supervisor,r.codigo,r.metodo,r.gps,r.estado,r.novedad,r.evidencias]);
 }else if(mode==='mensual'){
  headers=['Código puesto','Nombre del puesto','Revistas programadas','Revistas ejecutadas','Revistas repetidas','Revistas omisas','Efectividad %','Semáforo'];
  exportRows=monthlyRows.map(r=>[r.codigo,r.puesto,r.programadas,r.ejecutadas,r.repetidas,r.omisas,r.efectividad+'%',r.status]);
 }else{
  headers=['Fecha programada','Puesto','Ruta','Guarda / rondero','Inicio','Fin','Tiempo real (min)','Tiempo estimado (min)','Puntos visitados','Porcentaje recorrido','Puntos salteados','Estado','Alerta'];
  exportRows=roundRows.map(r=>[r.fecha,r.puesto,r.ruta,r.guarda,r.inicio,r.fin,r.tiempo,r.estimado,r.puntos,r.porcentaje+'%',r.salteados,r.estado,r.alerta]);
 }
 const apply=()=>setAppliedRange({start:startAt,end:endAt}),toggleSite=(id:string)=>setSelectedSites(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);
 const exportCsv=()=>download(safeName(title)+'.csv',new Blob([toCsv([headers,...exportRows])],{type:'text/csv;charset=utf-8;'}));
 const exportExcel=()=>{
  let rows:Cell[][]=[headers,...exportRows];
  if(mode==='mensual'){
   rows=[['Código puesto','Nombre del puesto','Programadas','Ejecutadas','Repetidas','Omisas','Efectividad %','Semáforo'],
    ...monthlyRows.map((r,i)=>[r.codigo,r.puesto,r.programadas,r.ejecutadas,r.repetidas,r.omisas,{formula:'IF(C'+(i+2)+'=0,0,D'+(i+2)+'/C'+(i+2)+')',value:r.programadas?r.ejecutadas/r.programadas:0,style:1},r.status] as Cell[]),
    ['TOTAL','',overall.programmed,overall.executed,overall.repeated,overall.omitted,{formula:'IF(C'+(monthlyRows.length+2)+'=0,0,D'+(monthlyRows.length+2)+'/C'+(monthlyRows.length+2)+')',value:overall.programmed?overall.executed/overall.programmed:0,style:1},'']];
  }
  download(safeName(title)+'.xlsx',toXlsx([{name:mode==='diario'?'Revistas':mode==='mensual'?'Cumplimiento':'Rondas',rows}]));
 };
 const exportPdf=()=>{
  const w=window.open('','_blank');if(!w){setError('El navegador bloqueó la ventana del PDF. Permite ventanas emergentes y vuelve a intentarlo.');return;}
  const summary=mode==='diario'?'Registros y omisiones: '+dailyRows.length:mode==='mensual'?'Cumplimiento global: '+overall.rate+'% · '+overall.executed+' ejecutadas / '+overall.programmed+' programadas':'Rondas: '+roundRows.length+' · recorrido medio '+avgRound+'%';
  const th=headers.map(h=>'<th>'+escHtml(h)+'</th>').join(''),body=exportRows.map(row=>'<tr>'+row.map(c=>'<td>'+escHtml(c)+'</td>').join('')+'</tr>').join('');
  w.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>'+escHtml(title)+'</title><style>@page{size:landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#18212f;font-size:9px}header{border-bottom:2px solid #0f766e;padding-bottom:10px;margin-bottom:12px}h1{font-size:20px;margin:0 0 5px}p{color:#475569;margin:4px 0}.kpi{font-size:12px;font-weight:bold;margin:12px 0}table{width:100%;border-collapse:collapse}th{background:#111827;color:#fff;text-align:left}th,td{border:1px solid #d5dbe5;padding:5px;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#f8fafc}.sign{display:flex;gap:70px;margin-top:35px}.sign div{width:240px;border-top:1px solid #7b8794;padding-top:5px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><header><h1>ALARVIX · '+escHtml(title)+'</h1><p>Tenant: '+escHtml(tenantId)+' · Periodo: '+escHtml(rangeCaption)+'</p><p>Generado: '+escHtml(fmtDateTime(new Date().toISOString()))+'</p></header><div class="kpi">'+escHtml(summary)+'</div><table><thead><tr>'+th+'</tr></thead><tbody>'+(body||'<tr><td colspan="'+headers.length+'">Sin datos para los filtros seleccionados.</td></tr>')+'</tbody></table><div class="sign"><div>Preparó el reporte</div><div>Revisó / aprobó</div></div></body></html>');
  w.document.close();w.focus();window.setTimeout(()=>w.print(),350);
 };
 const [email,setEmail]=useState(''),[mailOpen,setMailOpen]=useState(false),[mailMsg,setMailMsg]=useState('');
 const prepareMail=()=>{
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setMailMsg('Escribe un correo válido.');return;}
  const summary=mode==='mensual'?'Cumplimiento: '+overall.rate+'%\nProgramadas: '+overall.programmed+'\nEjecutadas: '+overall.executed+'\nOmisiones: '+overall.omitted:mode==='rondas'?'Rondas: '+roundRows.length+'\nRecorrido promedio: '+avgRound+'%':'Filas visibles: '+dailyRows.length;
  const subject=encodeURIComponent('Alarvix | '+title),body=encodeURIComponent('Buen día,\n\nComparto el reporte '+title+'.\nPeriodo: '+rangeCaption+'\n'+summary+'\n\nAdjunta el archivo exportado desde Alarvix antes de enviar.\n\nSaludos.');
  window.location.href='mailto:'+encodeURIComponent(email.trim())+'?subject='+subject+'&body='+body;
  setMailMsg('Se abrió un borrador. No se envía ni programa automáticamente; esa capacidad requiere integrar un proveedor de correo en el servidor.');
 };

 return <section className="ar-report-shell">
  <header className="ar-report-head"><div><span className="ar-report-eyebrow">ANALÍTICA OPERATIVA / ENTERPRISE</span><h2>Reportes y cumplimiento</h2><p>Revistas de supervisión y rondas de guardas se consultan como operaciones separadas.</p></div><button className="ar-report-refresh" onClick={()=>void loadData(appliedRange)} disabled={loading}>{loading?'Consultando…':'↻ Actualizar datos'}</button></header>
  <div className="ar-report-tabs" role="tablist" aria-label="Tipo de reporte"><button className={mode==='diario'?'active':''} onClick={()=>setMode('diario')} role="tab" aria-selected={mode==='diario'}>01 · Revistas diarias</button><button className={mode==='mensual'?'active':''} onClick={()=>setMode('mensual')} role="tab" aria-selected={mode==='mensual'}>02 · Cumplimiento mensual</button><button className={mode==='rondas'?'active':''} onClick={()=>setMode('rondas')} role="tab" aria-selected={mode==='rondas'}>03 · Rondas operativas</button></div>
  <section className="ar-report-filter"><div className="ar-report-filter-head"><div><span className="ar-report-eyebrow">CONSULTA</span><h3>Filtros avanzados</h3></div><span className="ar-report-range">{rangeCaption}</span></div>
   <div className="ar-report-filter-grid">
    <label>Fecha y hora de inicio<input type="datetime-local" value={startAt} onChange={e=>setStartAt(e.target.value)}/></label><label>Fecha y hora de fin<input type="datetime-local" value={endAt} onChange={e=>setEndAt(e.target.value)}/></label>
    <label>Supervisor activo<select value={supervisorId} onChange={e=>setSupervisorId(e.target.value)}><option value="">Todos los supervisores</option>{supervisorOptions.map(u=><option key={u.id} value={u.id}>{u.nombre||u.username||u.id}</option>)}</select></label>
    <label>Método de marcación<select value={method} onChange={e=>setMethod(e.target.value)}><option value="todos">Todos los métodos</option><option value="GPS">Validación GPS</option><option value="QR">Código QR</option><option value="NFC">NFC / ficha</option></select></label>
    <label>Ficha / código QR / NFC<input value={codeSearch} onChange={e=>setCodeSearch(e.target.value)} placeholder="Buscar código leído…"/></label>
    <div className="ar-report-sites"><span className="ar-report-label">Puestos · selección múltiple</span><div className="ar-report-sites-box"><input aria-label="Buscar puesto" placeholder="⌕ Buscar puesto…" value={siteSearch} onChange={e=>setSiteSearch(e.target.value)}/><div className="ar-report-site-list">{shownSites.map(s=><label key={s.id}><input type="checkbox" checked={selectedSites.includes(s.id)} onChange={()=>toggleSite(s.id)}/><span>{s.codigo_puesto||'SIN CÓDIGO'} · {s.nombre}</span></label>)}</div><div className="ar-report-site-foot"><span>{selectedSites.length?selectedSites.length+' seleccionado(s)':'Todos los puestos'}</span><button type="button" onClick={()=>setSelectedSites([])}>Limpiar</button></div></div></div>
   </div><div className="ar-report-filter-actions"><button className="ar-report-apply" onClick={apply}>Aplicar filtros</button><button className="ar-report-reset" onClick={()=>{const r=initialRange();setStartAt(r.start);setEndAt(r.end);setAppliedRange(r);setSelectedSites([]);setSiteSearch('');setSupervisorId('');setMethod('todos');setCodeSearch('');}}>Restablecer</button><span>{loading?'Actualizando fuentes…':loaded?'Datos consultados desde Supabase':'Esperando primera consulta'}</span></div>
  </section>
  {error&&<div className="ar-report-error" role="status">{error}<button onClick={()=>setError('')}>Cerrar</button></div>}

  {mode==='diario'&&<><div className="ar-report-kpis"><article><span>Revistas registradas</span><strong>{filteredRows.length}</strong><small>Marcajes reales del periodo</small></article><article><span>A tiempo</span><strong className="tone-green">{filteredRows.filter(r=>r.estado==='A tiempo').length}</strong><small>Dentro de la ventana configurada</small></article><article><span>Omisiones detectadas</span><strong className="tone-red">{missing.length}</strong><small>Ventana vencida sin check-in</small></article><article><span>Repetidas / fuera de ciclo</span><strong className="tone-blue">{filteredRows.filter(r=>r.esDuplicada||r.estado==='Fuera de ciclo').length}</strong><small>Marcajes fuera del ciclo esperado</small></article></div>
   <section className="ar-report-panel"><div className="ar-report-panel-head"><div><span className="ar-report-eyebrow">REVISTAS DE SUPERVISIÓN</span><h3>Detalle de trazabilidad</h3></div><span>{dailyRows.length} filas</span></div><div className="ar-report-table-wrap"><table className="ar-report-table"><thead><tr>{['Fecha / hora','Puesto','Supervisor','Ficha / QR leído','Método','GPS / distancia','Cumplimiento','Novedades / evidencias'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
    {dailyRows.map(r=><tr key={r.key}><td className="is-mono">{r.fecha}</td><td><strong>{r.puesto}</strong><small>{r.codigoPuesto}</small></td><td>{r.supervisor}</td><td className="is-mono">{r.codigo}</td><td><span className="ar-report-method">{r.metodo}</span></td><td className="is-mono">{r.gps}</td><td><span className={'ar-report-badge '+(r.estado.startsWith('A tiempo')?'green':r.estado.startsWith('Con desfase')?'amber':r.estado.startsWith('Omisión')?'red':'blue')}>{r.estado}</span></td><td>{r.novedad}{r.evidencias!=='—'&&<small className="ar-report-evidence">▧ {r.evidencias}</small>}</td></tr>)}
    {!dailyRows.length&&<tr><td className="ar-report-empty" colSpan={8}>{loading?'Cargando registros…':'No hay revistas u omisiones para los filtros seleccionados.'}</td></tr>}
   </tbody></table></div><p className="ar-report-footnote">Las omisiones se calculan cuando hay ventanas horarias configuradas y la ventana más su tolerancia ya vencieron. La ficha leída aparece si fue almacenada en el check-in.</p></section></>}

  {mode==='mensual'&&<><div className="ar-report-kpis"><article><span>Cumplimiento global</span><strong className={'tone-'+lateTone(overall.rate)}>{overall.rate}%</strong><div className="ar-report-progress"><i className={lateTone(overall.rate)} style={{width:overall.rate+'%'}}/></div><small>Meta de referencia: 90%</small></article><article><span>Programadas</span><strong>{overall.programmed.toLocaleString('es-CO')}</strong><small>Según reglas y días del periodo</small></article><article><span>Ejecutadas</span><strong className="tone-green">{overall.executed.toLocaleString('es-CO')}</strong><small>Marcajes reales sin repetición</small></article><article><span>Omisiones / duplicadas</span><strong className="tone-red">{overall.omitted.toLocaleString('es-CO')} <em>/ {overall.repeated}</em></strong><small>Omisiones estimadas / repetidas</small></article></div>
   <section className="ar-report-panel"><div className="ar-report-panel-head"><div><span className="ar-report-eyebrow">SLA / CUMPLIMIENTO</span><h3>Consolidado por puesto</h3></div><span>{monthlyRows.length} puestos</span></div><div className="ar-report-table-wrap"><table className="ar-report-table"><thead><tr><th>Código / puesto</th><th>Requeridas</th><th>Ejecutadas</th><th>Repetidas</th><th>Omisas</th><th>Efectividad</th><th>Semáforo</th></tr></thead><tbody>
    {monthlyRows.map(r=><tr key={r.id}><td><strong>{r.puesto}</strong><small>{r.codigo}</small></td><td>{r.programadas||'—'}</td><td>{r.ejecutadas}</td><td>{r.repetidas}</td><td>{r.programadas?r.omisas:'—'}</td><td><div className="ar-report-rate"><strong className={'tone-'+lateTone(r.efectividad)}>{r.programadas?r.efectividad+'%':'—'}</strong>{!!r.programadas&&<div className="ar-report-progress"><i className={lateTone(r.efectividad)} style={{width:r.efectividad+'%'}}/></div>}</div></td><td><span className={'ar-report-badge '+(!r.programadas?'blue':lateTone(r.efectividad))}>{r.status}</span></td></tr>)}
    {!monthlyRows.length&&<tr><td className="ar-report-empty" colSpan={7}>No hay puestos para mostrar.</td></tr>}
   </tbody><tfoot><tr><td>TOTAL</td><td>{overall.programmed}</td><td>{overall.executed}</td><td>{overall.repeated}</td><td>{overall.omitted}</td><td>{overall.rate}%</td><td><span className={'ar-report-badge '+lateTone(overall.rate)}>{overall.rate>=90?'En meta':overall.rate>=75?'Atención':'Crítico'}</span></td></tr></tfoot></table></div><p className="ar-report-footnote">Cumplimiento = revistas a tiempo ÷ revistas programadas. Los puestos sin regla se identifican como “Sin parametrización” y no cuentan como programados.</p></section></>}

  {mode==='rondas'&&<><div className="ar-report-kpis"><article><span>Rondas programadas</span><strong>{roundRows.length}</strong><small>Recorridos de guardas / ronderos</small></article><article><span>Recorrido promedio</span><strong className={'tone-'+lateTone(avgRound)}>{avgRound}%</strong><div className="ar-report-progress"><i className={lateTone(avgRound)} style={{width:avgRound+'%'}}/></div><small>Puntos distintos marcados ÷ puntos requeridos</small></article><article><span>Alertas de ronda</span><strong className="tone-red">{roundRows.filter(r=>r.alerta!=='—').length}</strong><small>Omisión, inicio tardío o puntos faltantes</small></article><article><span>Puntos salteados</span><strong className="tone-amber">{roundRows.reduce((n,r)=>n+(r.salteados==='—'?0:r.salteados.split(',').length),0)}</strong><small>En las rutas consultadas</small></article></div>
   <section className="ar-report-panel"><div className="ar-report-panel-head"><div><span className="ar-report-eyebrow">RONDEROS / VIGILANTES DE PUESTO</span><h3>Recorridos y puntos de control QR / NFC</h3></div><span>{roundRows.length} rondas</span></div><div className="ar-report-table-wrap"><table className="ar-report-table"><thead><tr>{['Programada','Puesto / ruta','Guarda','Tiempo real / estimado','Puntos visitados','Recorrido','Puntos salteados','Estado / alerta'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
    {roundRows.map(r=><tr key={r.id}><td className="is-mono">{r.fecha}</td><td><strong>{r.puesto}</strong><small>{r.ruta}</small></td><td>{r.guarda}</td><td>{r.tiempo===null?'En curso':r.tiempo+' / '+r.estimado+' min'}</td><td>{r.puntos}</td><td><div className="ar-report-rate"><strong className={'tone-'+lateTone(r.porcentaje)}>{r.porcentaje}%</strong><div className="ar-report-progress"><i className={lateTone(r.porcentaje)} style={{width:r.porcentaje+'%'}}/></div></div></td><td>{r.salteados}</td><td><span className={'ar-report-badge '+(r.alerta==='—'?'green':'red')}>{r.estado}</span><small className="ar-report-evidence">{r.alerta}</small></td></tr>)}
    {!roundRows.length&&<tr><td className="ar-report-empty" colSpan={8}>{loading?'Cargando rondas…':'No hay rondas operativas registradas en el rango. El modelo de rondas es independiente del de revistas.'}</td></tr>}
   </tbody></table></div><p className="ar-report-footnote">Porcentaje calculado por puntos obligatorios distintos escaneados. Los activos no se convierten automáticamente en rondas: deben formar parte de una ruta operativa.</p></section></>}

  <section className="ar-report-export"><div><span className="ar-report-eyebrow">SALIDAS / AUDITORÍA</span><h3>Exportación del reporte</h3><p>Exporta la consulta filtrada para auditoría o distribución al cliente.</p></div><div className="ar-report-export-actions"><button onClick={exportPdf}>▤ Exportar PDF</button><button onClick={exportExcel}>▦ Exportar Excel (.xlsx)</button><button onClick={exportCsv}>⇩ Exportar CSV</button><button className="send" onClick={()=>{setMailOpen(true);setMailMsg('');}}>✉ Preparar correo</button></div></section>
  {mailOpen&&<div className="ar-report-modal-backdrop" onClick={()=>setMailOpen(false)}><section className="ar-report-modal" role="dialog" aria-modal="true" aria-labelledby="ar-report-mail-title" onClick={e=>e.stopPropagation()}><button className="ar-report-modal-close" onClick={()=>setMailOpen(false)} aria-label="Cerrar">×</button><span className="ar-report-eyebrow">DISTRIBUCIÓN</span><h3 id="ar-report-mail-title">Preparar envío del reporte</h3><p>Se abrirá un borrador en tu aplicación de correo. Exporta antes el PDF o Excel para adjuntarlo manualmente.</p><label>Correo del destinatario<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="cliente@empresa.com"/></label><div className="ar-report-modal-actions"><button className="ar-report-reset" onClick={()=>setMailOpen(false)}>Cancelar</button><button className="ar-report-apply" onClick={()=>{if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setMailMsg('Escribe un correo válido.');return;}const sub=encodeURIComponent('Alarvix | '+title),body=encodeURIComponent('Buen día,\n\nComparto '+title+'.\nPeriodo: '+rangeCaption+'\n\nAdjunta el reporte exportado antes de enviar.\n\nSaludos.');window.location.href='mailto:'+encodeURIComponent(email.trim())+'?subject='+sub+'&body='+body;setMailMsg('Se abrió un borrador. El sistema no envía ni programa correos automáticamente todavía.');}}>Abrir correo</button></div>{mailMsg&&<p className="ar-report-footnote" role="status">{mailMsg}</p>}<p className="ar-report-footnote">El envío automático o programado requiere un proveedor de correo y un proceso servidor que todavía no están configurados.</p></section></div>}
 </section>;
}
