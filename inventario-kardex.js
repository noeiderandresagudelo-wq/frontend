/* Alarvix · Kardex Operativo Transaccional */
(function(){
'use strict';

let insumos=[], movimientos=[], stockTecnicos=[], reabastecimientos=[], auditoria=[], tab='bodega';
let inventarioRealtimeChannel=null;

function appUser(){
  try { if (typeof currentUser !== 'undefined' && currentUser) return currentUser; } catch(e) {}
  return window.currentUser || null;
}
function appSupabase(){
  try { if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient; } catch(e) {}
  return window.supabaseClient || null;
}
function appPersonalTecnicos(){
  try { if (typeof personalTecnicos !== 'undefined' && Array.isArray(personalTecnicos)) return personalTecnicos; } catch(e) {}
  return Array.isArray(window.personalTecnicos) ? window.personalTecnicos : [];
}
function legacyCatalogo(){
  try { if (typeof catalogoInventario !== 'undefined' && Array.isArray(catalogoInventario)) return catalogoInventario; } catch(e) {}
  return Array.isArray(window.catalogoInventario) ? window.catalogoInventario : [];
}
function tenant(){ const u=appUser(); return u?.tenant_id || u?.tenantId || null; }
function esc(v){ const d=document.createElement('div'); d.textContent=String(v??''); return d.innerHTML; }
function money(v){ return '$'+Number(v||0).toLocaleString('es-CO'); }
function toast(t,m,e){ if(typeof window.showToast==='function') window.showToast(t,m,!!e); }

function buildUI(){
  const view=document.getElementById('view-inventario');
  if(!view || view.dataset.kardexReady==='1') return;
  view.dataset.kardexReady='1';
  view.innerHTML=`
  <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
    <div class="p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap">
      <div><h2 class="text-sm font-extrabold text-white uppercase tracking-wider">Inventario / Bodega</h2><p class="text-[10px] text-slate-400 mt-1">Kardex operativo transaccional · existencia protegida · multi-tenant</p></div>
      <div class="flex gap-2"><button onclick="openMovimientoInventarioModal()" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase">+ Registrar Movimiento</button><button onclick="openAddMaterialModal()" class="bg-slate-800 border border-slate-700 text-slate-200 px-3 py-2 rounded-lg text-[10px] font-black uppercase">+ Crear Insumo</button></div>
    </div>
    <div class="px-3 border-t border-slate-800 overflow-x-auto"><div class="flex min-w-max">
      ${[['bodega','Bodega Central'],['tecnicos','Stock en Técnicos'],['kardex','Kardex y Auditoría'],['reab','Reabastecimiento'],['log','Log de Auditoría']].map(x=>`<button id="tab-inv-${x[0]}" onclick="switchInventarioTab('${x[0]}')" class="px-4 py-3 text-[9px] font-black uppercase tracking-wider">${x[1]}</button>`).join('')}
    </div></div>
  </div>
  <div id="inv-panel-bodega" class="mt-5"><div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"><div class="p-4 border-b border-slate-800 flex justify-between gap-2"><div><h3 class="text-xs font-extrabold text-white uppercase">Bodega Central</h3><p class="text-[9px] text-slate-500">La existencia no se edita directamente.</p></div><input id="inv-search" oninput="renderInventarioOperativo()" placeholder="Buscar..." class="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[10px] text-white"></div><div class="overflow-x-auto"><table class="w-full min-w-[1100px] text-left"><thead><tr class="bg-slate-950 text-[9px] text-slate-500 uppercase font-black"><th class="p-3">Insumo</th><th class="p-3">Categoría</th><th class="p-3 text-center">Existencia</th><th class="p-3 text-center">Mín / Máx</th><th class="p-3 text-right">Costo</th><th class="p-3">Proveedor</th><th class="p-3">Ubicación</th><th class="p-3 text-center">Estado</th><th class="p-3 text-center">Acción</th></tr></thead><tbody id="inv-body"></tbody></table></div></div></div>
  <div id="inv-panel-tecnicos" class="hidden mt-5"><div class="bg-slate-900 border border-slate-800 rounded-xl p-4"><h3 class="text-xs font-extrabold text-white uppercase">Stock en Técnicos</h3><div id="inv-tech-body" class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4"></div></div></div>
  <div id="inv-panel-kardex" class="hidden mt-5"><div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"><div class="p-4 border-b border-slate-800 flex justify-between gap-2"><h3 class="text-xs font-extrabold text-white uppercase">Kardex y Auditoría</h3><input id="inv-k-search" oninput="renderInventarioKardex()" placeholder="Filtrar..." class="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[10px] text-white"></div><div class="overflow-x-auto"><table class="w-full min-w-[1200px] text-left"><thead><tr class="bg-slate-950 text-[9px] text-slate-500 uppercase font-black"><th class="p-3">Fecha / Hora</th><th class="p-3">Usuario</th><th class="p-3">Tipo</th><th class="p-3">Insumo</th><th class="p-3">Cantidad</th><th class="p-3">Anterior</th><th class="p-3">Posterior</th><th class="p-3">OPR / OT</th><th class="p-3">Observación</th></tr></thead><tbody id="inv-k-body"></tbody></table></div></div></div>
  <div id="inv-panel-reab" class="hidden mt-5"><div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"><div class="p-4 border-b border-slate-800 flex justify-between"><h3 class="text-xs font-extrabold text-white uppercase">Reabastecimiento</h3><button onclick="openReabastecimientoModal()" class="bg-orange-600 text-white px-3 py-2 rounded-lg text-[9px] font-black uppercase">+ Solicitud</button></div><div class="overflow-x-auto"><table class="w-full min-w-[850px] text-left"><thead><tr class="bg-slate-950 text-[9px] text-slate-500 uppercase font-black"><th class="p-3">Fecha</th><th class="p-3">Insumo</th><th class="p-3">Cantidad</th><th class="p-3">Proveedor</th><th class="p-3">Estado</th><th class="p-3">Acción</th></tr></thead><tbody id="inv-reab-body"></tbody></table></div></div></div>
  <div id="inv-panel-log" class="hidden mt-5"><div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"><div class="p-4 border-b border-slate-800 flex justify-between"><h3 class="text-xs font-extrabold text-white uppercase">Log de Auditoría</h3><input id="inv-log-search" oninput="renderInventarioLog()" placeholder="Buscar..." class="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[10px] text-white"></div><div id="inv-log-body"></div></div></div>`;
  document.body.insertAdjacentHTML('beforeend',`
  <div id="modal-kardex-insumo" class="fixed inset-0 z-[99990] hidden bg-slate-950/85 backdrop-blur-sm items-center justify-center p-4"><div class="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-lg"><div class="flex justify-between border-b border-slate-800 pb-3 mb-4"><h3 id="kdx-insumo-title" class="text-xs font-black text-white uppercase">Crear Insumo</h3><button onclick="closeAddMaterialModal()" class="text-slate-400">✕</button></div><form id="kdx-insumo-form" onsubmit="guardarInsumoKardex(event)" class="space-y-3"><input type="hidden" id="kdx-insumo-id"><div class="grid grid-cols-2 gap-3"><input id="kdx-codigo" required placeholder="Código" class="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"><input id="kdx-nombre" required placeholder="Nombre" class="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"><input id="kdx-categoria" placeholder="Categoría" class="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"><input id="kdx-costo" type="number" min="0" placeholder="Costo unitario" class="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"><input id="kdx-min" type="number" min="0" placeholder="Stock mínimo" class="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"><input id="kdx-max" type="number" min="0" placeholder="Stock máximo" class="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"><input id="kdx-proveedor" placeholder="Proveedor" class="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"><input id="kdx-ubicacion" placeholder="Ubicación" class="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"></div><div class="flex justify-end gap-2"><button type="button" onclick="closeAddMaterialModal()" class="bg-slate-800 text-slate-300 px-4 py-2 rounded-lg text-xs">Cancelar</button><button class="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-black">Guardar ficha</button></div></form></div></div>
  <div id="modal-kardex-mov" class="fixed inset-0 z-[99990] hidden bg-slate-950/85 backdrop-blur-sm items-center justify-center p-4"><div class="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-lg"><div class="flex justify-between border-b border-slate-800 pb-3 mb-4"><h3 class="text-xs font-black text-white uppercase">Registrar Movimiento</h3><button onclick="closeMovimientoInventarioModal()" class="text-slate-400">✕</button></div><form onsubmit="guardarMovimientoInventario(event)" class="space-y-3"><select id="kdx-tipo" onchange="actualizarFormularioMovimientoInventario()" class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"><option value="ENTRADA">Entrada</option><option value="SALIDA_TECNICO">Salida a Técnico</option><option value="CONSUMO_OPR">Consumo OPR</option><option value="DEVOLUCION">Devolución</option><option value="AJUSTE">Ajuste</option></select><select id="kdx-insumo" required class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"></select><input id="kdx-cantidad" type="number" min="0.01" step="0.01" required placeholder="Cantidad" class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"><select id="kdx-tecnico" class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"></select><input id="kdx-serial" placeholder="Serial / identificador (opcional)" class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"><input id="kdx-opr" placeholder="OPR / OT relacionado" class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"><textarea id="kdx-obs" placeholder="Observación" class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"></textarea><div class="flex justify-end gap-2"><button type="button" onclick="closeMovimientoInventarioModal()" class="bg-slate-800 text-slate-300 px-4 py-2 rounded-lg text-xs">Cancelar</button><button class="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-black uppercase">Aplicar</button></div></form></div></div>
  <div id="modal-kardex-reab" class="fixed inset-0 z-[99990] hidden bg-slate-950/85 backdrop-blur-sm items-center justify-center p-4"><div class="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-md"><div class="flex justify-between border-b border-slate-800 pb-3 mb-4"><h3 class="text-xs font-black text-white uppercase">Solicitud de Reabastecimiento</h3><button onclick="closeReabastecimientoModal()" class="text-slate-400">✕</button></div><form onsubmit="guardarReabastecimiento(event)" class="space-y-3"><select id="kdx-reab-insumo" required class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"></select><input id="kdx-reab-cantidad" type="number" min="1" required placeholder="Cantidad" class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"><input id="kdx-reab-proveedor" placeholder="Proveedor" class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"><textarea id="kdx-reab-obs" placeholder="Observación" class="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white"></textarea><div class="flex justify-end gap-2"><button type="button" onclick="closeReabastecimientoModal()" class="bg-slate-800 text-slate-300 px-4 py-2 rounded-lg text-xs">Cancelar</button><button class="bg-orange-600 text-white px-4 py-2 rounded-lg text-xs font-black">Crear solicitud</button></div></form></div></div>`);
}

function setTab(t){tab=t;['bodega','tecnicos','kardex','reab','log'].forEach(x=>{document.getElementById('inv-panel-'+x)?.classList.toggle('hidden',x!==t);const b=document.getElementById('tab-inv-'+x);if(b)b.className='px-4 py-3 text-[9px] font-black uppercase tracking-wider border-b-2 '+(x===t?'border-blue-500 text-blue-400':'border-transparent text-slate-500');});if(t==='bodega')renderInventarioOperativo();if(t==='tecnicos')renderStockTecnicos();if(t==='kardex')renderInventarioKardex();if(t==='reab')renderReab();if(t==='log')renderInventarioLog();}
window.switchInventarioTab=setTab;

async function load(){
 const t=tenant(); if(!appSupabase()||!t)return false;
 const consultas=[
   ['insumos',supabaseClient.from('inventario_insumos').select('id,codigo,tenant_id,nombre,categoria,existencia,costo_unitario,proveedor,ubicacion').eq('tenant_id',t).order('nombre')],
   ['movimientos',supabaseClient.from('inventario_movimientos').select('*').eq('tenant_id',t).order('created_at',{ascending:false}).limit(500)],
   ['stock_tecnicos',supabaseClient.from('inventario_stock_tecnicos').select('*').eq('tenant_id',t).order('updated_at',{ascending:false})],
   ['reabastecimientos',supabaseClient.from('inventario_reabastecimientos').select('*').eq('tenant_id',t).order('fecha_solicitud',{ascending:false})],
   ['auditoria',supabaseClient.from('inventario_auditoria').select('*').eq('tenant_id',t).order('fecha_hora',{ascending:false}).limit(500)]
 ];
 const resultados=await Promise.allSettled(consultas.map(x=>x[1]));
 // Compatibilidad con esquemas antiguos: ubicacion es opcional en insumos.
 if(resultados[0]?.status==='fulfilled' && resultados[0].value?.error){
   const msg=String(resultados[0].value.error.message||'').toLowerCase();
   if(msg.includes('ubicacion') && msg.includes('schema cache')){
     resultados[0]=await supabaseClient.from('inventario_insumos')
       .select('id,codigo,tenant_id,nombre,categoria,existencia,costo_unitario,proveedor')
       .eq('tenant_id',t).order('nombre');
   }
 }
 const datos=resultados.map((r,i)=>{
   if(r.status==='fulfilled') return {nombre:consultas[i][0],data:r.value?.data||[],error:r.value?.error||null};
   return {nombre:consultas[i][0],data:[],error:r.reason||new Error('Consulta rechazada')};
 });
 const errores=datos.filter(x=>x.error);
 errores.forEach(x=>console.warn('[Alarvix/Kardex] Consulta secundaria no disponible:',x.nombre,x.error?.message||x.error));
 const dedupeBy=(rows,keyFn)=>{
   const seen=new Set(), out=[];
   for(const row of (Array.isArray(rows)?rows:[])){
     const key=String(keyFn(row)||'').trim();
     if(!key || seen.has(key)) continue;
     seen.add(key); out.push(row);
   }
   return out;
 };
 const [a,b,c,d,e]=datos;
 insumos=dedupeBy(a.data,x=>x.codigo);
 movimientos=dedupeBy(b.data,x=>x.id);
 stockTecnicos=dedupeBy(c.data,x=>[x.tenant_id,x.tecnico_id,x.insumo_id].join('|'));
 reabastecimientos=dedupeBy(d.data,x=>x.id);
 auditoria=dedupeBy(e.data,x=>x.id);
 window.catalogoInventario=insumos.map(x=>({id:x.id,codigo:x.codigo,nombre:x.nombre,categoria:x.categoria,existencia:Number(x.existencia||0),costo:Number(x.costo_unitario||0)}));
 window.inventarioKardex=movimientos.map(x=>({fecha:new Date(x.created_at || x.fecha_hora).toLocaleString('es-CO'),tipo:x.tipo,material:insumos.find(i=>i.id===x.insumo_id)?.codigo||insumos.find(i=>i.codigo===x.insumo_id)?.codigo,cantidad:x.cantidad,detalle:x.observacion||x.opr_ot_relacionado||''}));
 renderInventario();
 return true;
}
function renderInventarioOperativo(){const b=document.getElementById('inv-body');if(!b)return;const q=(document.getElementById('inv-search')?.value||'').trim().toLowerCase();b.innerHTML=insumos.filter(m=>{const haystack=[m.codigo,m.nombre,m.categoria,m.proveedor,m.ubicacion].map(v=>String(v??'')).join(' ').toLowerCase();return !q||haystack.includes(q);}).map(m=>{const e=Number(m.existencia||0),min=Number(0||0),st=e<=0?['SIN EXISTENCIA','rose']:e<=min?['CRÍTICO','amber']:['ÓPTIMO','emerald'];return `<tr class="border-b border-slate-800/50 hover:bg-slate-800/30"><td class="p-3"><b class="text-white">${esc(m.nombre)}</b><span class="block text-[9px] text-slate-500 font-mono">${esc(m.codigo)}</span></td><td class="p-3 text-slate-400">${esc(m.categoria||'—')}</td><td class="p-3 text-center text-white font-black">${e}</td><td class="p-3 text-center text-slate-400">${0} / ${0}</td><td class="p-3 text-right text-slate-300">${money(m.costo_unitario)}</td><td class="p-3 text-slate-400">${esc(m.proveedor||'—')}</td><td class="p-3 text-slate-400">${esc(m.ubicacion||'—')}</td><td class="p-3 text-center"><span class="px-2 py-1 rounded-full bg-${st[1]}-500/10 text-${st[1]}-400 border border-${st[1]}-500/20 text-[8px] font-black">${st[0]}</span></td><td class="p-3 text-center whitespace-nowrap"><button onclick="openAddMaterialModal('${m.id}')" class="text-amber-400 hover:text-white mr-2" title="Editar ficha"><i class="fa-solid fa-pen"></i></button><button onclick="openMovimientoInventarioModal('${m.id}')" class="text-blue-400 hover:text-white font-black text-[9px] uppercase">Mover</button></td></tr>`}).join('')||'<tr><td colspan="9" class="p-10 text-center text-slate-600">No hay insumos.</td></tr>';}
function renderStockTecnicos(){const b=document.getElementById('inv-tech-body');if(!b)return;const g={};stockTecnicos.forEach(x=>{const t=(appPersonalTecnicos()||[]).find(t=>String(t.id)===String(x.tecnico_id));const k=x.tecnico_id;if(!g[k])g[k]={n:t?.nombre||k,v:t?.vehiculo||'Por asignar',a:[]};g[k].a.push(x);});b.innerHTML=Object.values(g).map(x=>`<div class="bg-slate-950 border border-slate-800 rounded-xl p-4"><div class="flex justify-between"><div><b class="text-xs text-white">${esc(x.n)}</b><p class="text-[9px] text-slate-500">Vehículo: ${esc(x.v)}</p></div><span class="text-[9px] text-blue-400 font-black">${x.a.reduce((s,i)=>s+Number(i.existencia||0),0)} unidades</span></div>${x.a.map(i=>`<div class="flex justify-between border-t border-slate-800 mt-3 pt-2 text-[9px]"><span class="text-slate-300">${esc(i.inventario_insumos?.nombre||'Insumo')}</span><b class="text-white">${i.existencia}</b></div>`).join('')}</div>`).join('')||'<div class="col-span-full text-center text-slate-600 p-10">Sin stock asignado.</div>';}
function renderInventarioKardex(){const b=document.getElementById('inv-k-body');if(!b)return;const q=(document.getElementById('inv-k-search')?.value||'').toLowerCase();b.innerHTML=movimientos.filter(x=>JSON.stringify(x).toLowerCase().includes(q)).map(x=>{const m=insumos.find(i=>i.id===x.insumo_id);return `<tr class="border-b border-slate-800/50"><td class="p-3 text-slate-400">${new Date(x.fecha_hora).toLocaleString('es-CO')}</td><td class="p-3 text-slate-300">${esc(x.usuario_nombre||'—')}</td><td class="p-3"><span class="text-[8px] font-black text-blue-300">${esc(x.tipo)}</span></td><td class="p-3 text-white">${esc(m?.nombre||x.insumo_id)}</td><td class="p-3 text-center">${x.cantidad}</td><td class="p-3 text-center">${x.existencia_anterior}</td><td class="p-3 text-center font-black">${x.existencia_posterior}</td><td class="p-3 font-mono text-blue-300">${esc(x.opr_ot_relacionado||'—')}</td><td class="p-3 text-slate-400">${esc(x.observacion||'—')}</td></tr>`}).join('')||'<tr><td colspan="9" class="p-10 text-center text-slate-600">Sin movimientos.</td></tr>';}
function renderReab(){const b=document.getElementById('inv-reab-body');if(!b)return;b.innerHTML=reabastecimientos.map(x=>{const m=insumos.find(i=>i.id===x.insumo_id);let action='—';if(x.estado==='SOLICITADA')action='<button onclick="cambiarEstadoReabastecimiento(\''+x.id+'\',\'APROBADA\')" class="text-blue-400 text-[9px] font-black">APROBAR</button>';else if(x.estado==='APROBADA')action='<button onclick="cambiarEstadoReabastecimiento(\''+x.id+'\',\'EN_COMPRA\')" class="text-orange-400 text-[9px] font-black">EN COMPRA</button>';else if(x.estado==='EN_COMPRA')action='<button onclick="recibirReabastecimiento(\''+x.id+'\')" class="text-emerald-400 text-[9px] font-black">RECIBIR</button>';return '<tr class="border-b border-slate-800/50"><td class="p-3 text-slate-400">'+new Date(x.fecha_solicitud).toLocaleDateString('es-CO')+'</td><td class="p-3 text-white">'+esc(m?.nombre||'—')+'</td><td class="p-3">'+x.cantidad+'</td><td class="p-3 text-slate-400">'+esc(x.proveedor||'—')+'</td><td class="p-3 text-orange-300 font-black text-[8px]">'+esc(x.estado)+'</td><td class="p-3">'+action+'</td></tr>'}).join('')||'<tr><td colspan="6" class="p-10 text-center text-slate-600">Sin solicitudes.</td></tr>';}
window.cambiarEstadoReabastecimiento=async function(id,estado){const r=await supabaseClient.from('inventario_reabastecimientos').update({estado}).eq('id',id).eq('tenant_id',tenant());if(r.error){toast('No se pudo actualizar',r.error.message,true);return;}await load();toast('Reabastecimiento actualizado','Estado: '+estado);};
function renderInventarioLog(){const b=document.getElementById('inv-log-body');if(!b)return;const q=(document.getElementById('inv-log-search')?.value||'').toLowerCase();b.innerHTML=auditoria.filter(x=>JSON.stringify(x).toLowerCase().includes(q)).map(x=>`<div class="p-3 border-b border-slate-800"><p class="text-[9px] text-slate-500">${new Date(x.fecha_hora).toLocaleString('es-CO')} · ${esc(x.usuario_nombre||'Usuario')}</p><b class="text-xs text-white">${esc(x.accion)}</b><p class="text-[9px] text-slate-400 mt-1">${esc(JSON.stringify(x.detalle||{}))}</p></div>`).join('')||'<div class="p-10 text-center text-slate-600">Sin eventos.</div>';}
function renderInventario(){renderInventarioOperativo();renderStockTecnicos();renderInventarioKardex();renderReab();renderInventarioLog();}

window.renderInventario=renderInventario;
window.cargarInventarioKardex=load;

function openAddMaterialModal(id){document.getElementById('kdx-insumo-form').reset();document.getElementById('kdx-insumo-id').value='';document.getElementById('kdx-insumo-title').textContent='Crear Insumo';if(id){const m=insumos.find(x=>x.id===id);if(m){document.getElementById('kdx-insumo-id').value=m.id;document.getElementById('kdx-codigo').value=m.codigo;document.getElementById('kdx-nombre').value=m.nombre;document.getElementById('kdx-categoria').value=m.categoria||'';document.getElementById('kdx-costo').value=m.costo_unitario||m.costo||0;document.getElementById('kdx-min').value=0||0;document.getElementById('kdx-max').value=0||0;document.getElementById('kdx-proveedor').value='';document.getElementById('kdx-ubicacion').value='Bodega Central';document.getElementById('kdx-insumo-title').textContent='Editar ficha · '+m.codigo;}}document.getElementById('modal-kardex-insumo').classList.remove('hidden');document.getElementById('modal-kardex-insumo').classList.add('flex');}
window.openAddMaterialModal=openAddMaterialModal;
// Compatibilidad con botones heredados del módulo de Inventario en index.html.
// El flujo oficial vive en openMovimientoInventarioModal().
window.openInventarioMovimientoModal=openMovimientoInventarioModal;
window.openEditMaterialModal=openAddMaterialModal;
window.closeAddMaterialModal=()=>{document.getElementById('modal-kardex-insumo')?.classList.add('hidden');document.getElementById('modal-kardex-insumo')?.classList.remove('flex');};

window.guardarInsumoKardex=async function(ev){ev.preventDefault();const t=tenant();const id=document.getElementById('kdx-insumo-id').value;const payload={tenant_id:t,codigo:document.getElementById('kdx-codigo').value.trim() || ('INV-MAT-'+String(Math.floor(100000+Math.random()*900000))),nombre:document.getElementById('kdx-nombre').value.trim(),categoria:document.getElementById('kdx-categoria').value.trim()||null,costo_unitario:Number(document.getElementById('kdx-costo').value)||0};const q=id?supabaseClient.from('inventario_insumos').update(payload).eq('id',id).eq('tenant_id',t):supabaseClient.from('inventario_insumos').insert(payload);const r=await q;if(r.error){toast('No se pudo guardar',r.error.message,true);return;}window.closeAddMaterialModal();await load();toast('Ficha guardada','La existencia no fue modificada. Usa Registrar Movimiento para cambiar stock.');};

function poblarMovimiento(pre){document.getElementById('kdx-insumo').innerHTML='<option value="">Seleccionar insumo...</option>'+insumos.map(x=>`<option value="${x.id}" ${x.id===pre?'selected':''}>${esc(x.codigo)} · ${esc(x.nombre)} · stock ${x.existencia}</option>`).join('');document.getElementById('kdx-tecnico').innerHTML='<option value="">Seleccionar técnico...</option>'+(appPersonalTecnicos()||[]).map(x=>`<option value="${x.id}">${esc(x.nombre)}</option>`).join('');}
function openMovimientoInventarioModal(id){poblarMovimiento(id);document.getElementById('kdx-tipo').value='ENTRADA';document.getElementById('kdx-cantidad').value='';document.getElementById('kdx-serial').value='';document.getElementById('kdx-opr').value='';document.getElementById('kdx-obs').value='';actualizarFormularioMovimientoInventario();document.getElementById('modal-kardex-mov').classList.remove('hidden');document.getElementById('modal-kardex-mov').classList.add('flex');}
window.openMovimientoInventarioModal=openMovimientoInventarioModal;
window.closeMovimientoInventarioModal=()=>{document.getElementById('modal-kardex-mov')?.classList.add('hidden');document.getElementById('modal-kardex-mov')?.classList.remove('flex');};
window.actualizarFormularioMovimientoInventario=()=>{const t=document.getElementById('kdx-tipo')?.value;document.getElementById('kdx-tecnico')?.classList.toggle('hidden',!['SALIDA_TECNICO','DEVOLUCION','CONSUMO_OPR'].includes(t));};

window.guardarMovimientoInventario=async function(ev){ev.preventDefault();const tipo=document.getElementById('kdx-tipo').value,id=document.getElementById('kdx-insumo').value,cantidad=Number(document.getElementById('kdx-cantidad').value),serial=document.getElementById('kdx-serial').value.trim()||null,tech=document.getElementById('kdx-tecnico').value||null,opr=document.getElementById('kdx-opr').value.trim()||null,obs=document.getElementById('kdx-obs').value.trim()||null;if(['SALIDA_TECNICO','DEVOLUCION','CONSUMO_OPR'].includes(tipo)&&!tech){toast('Falta técnico','Selecciona el técnico relacionado.',true);return;}const u=appUser();const r=await supabaseClient.rpc('registrar_movimiento_inventario',{p_tenant_id:tenant(),p_insumo_id:id,p_tipo:tipo,p_cantidad:cantidad,p_tecnico_id:tech,p_opr_ot_relacionado:opr,p_observacion:obs,p_usuario_id:u?.id||null,p_usuario_nombre:u?.nombre||u?.name||null});if(r.error){toast('Movimiento rechazado',r.error.message,true);return;}window.closeMovimientoInventarioModal();await load();toast('Movimiento aplicado','Existencia posterior: '+(r.data?.existencia_posterior??'—'));};

window.openReabastecimientoModal=()=>{document.getElementById('kdx-reab-insumo').innerHTML=insumos.map(x=>`<option value="${x.id}">${esc(x.nombre)} · stock ${x.existencia}</option>`).join('');document.getElementById('modal-kardex-reab').classList.remove('hidden');document.getElementById('modal-kardex-reab').classList.add('flex');};
window.closeReabastecimientoModal=()=>{document.getElementById('modal-kardex-reab')?.classList.add('hidden');document.getElementById('modal-kardex-reab')?.classList.remove('flex');};
window.guardarReabastecimiento=async function(ev){ev.preventDefault();const r=await supabaseClient.from('inventario_reabastecimientos').insert({tenant_id:tenant(),insumo_id:document.getElementById('kdx-reab-insumo').value,cantidad_solicitada:Number(document.getElementById('kdx-reab-cantidad').value),proveedor:document.getElementById('kdx-reab-proveedor').value.trim()||null,observacion:document.getElementById('kdx-reab-obs').value.trim()||null,solicitud:'Reposición de stock',solicitado_por:appUser()?.id});if(r.error){toast('No se pudo crear',r.error.message,true);return;}window.closeReabastecimientoModal();await load();toast('Solicitud creada','Quedó en estado SOLICITADA.');};
window.recibirReabastecimiento=async function(id){const r=reabastecimientos.find(x=>x.id===id);if(!r)return;const u=appUser();const m=await supabaseClient.rpc('recibir_reabastecimiento_inventario',{p_reabastecimiento_id:id,p_usuario_id:u?.id||null,p_usuario_nombre:u?.nombre||u?.name||null});if(m.error){toast('Recepción rechazada',m.error.message,true);return;}await load();toast('Reabastecimiento recibido','Ingreso registrado en Bodega Central.');};

async function initInventarioRealtime(){
  const sb=appSupabase(), t=tenant();
  if(!sb || !t || inventarioRealtimeChannel) return;
  inventarioRealtimeChannel=sb.channel('alarvix-inventario-live-'+String(t))
    .on('postgres_changes',{event:'*',schema:'public',table:'inventario_insumos',filter:'tenant_id=eq.'+t},async()=>{await load();})
    .on('postgres_changes',{event:'*',schema:'public',table:'inventario_movimientos',filter:'tenant_id=eq.'+t},async()=>{await load();})
    .on('postgres_changes',{event:'*',schema:'public',table:'inventario_stock_tecnicos',filter:'tenant_id=eq.'+t},async()=>{await load();})
    .on('postgres_changes',{event:'*',schema:'public',table:'inventario_reabastecimientos',filter:'tenant_id=eq.'+t},async()=>{await load();})
    .subscribe((status,error)=>{
      if(status==='SUBSCRIBED') console.log('[Alarvix Inventario] Realtime activo ✔');
      if(status==='CHANNEL_ERROR') console.warn('[Alarvix Inventario] Realtime no disponible:',error);
    });
}

window.syncInventarioActual=()=>load();


window.descontarStockInstalacion=async function(s,consecutivo){if(!s||s.inventarioConsumoOprRegistrado)return true;if(!Array.isArray(s.insumosUsados)||!s.insumosUsados.length)s.insumosUsados=(s.instalacionInfo?.materiales||[]).map(x=>({codigo:x.codigo,cantidad:x.qty}));if(!s.tecnicoId){toast('Consumo no realizado','El OPR no tiene técnico asignado.',true);return false;}for(const x of s.insumosUsados){const m=insumos.find(i=>String(i.codigo)===String(x.codigo));if(!m)continue;const u=appUser();const r=await supabaseClient.rpc('registrar_movimiento_inventario',{p_tenant_id:tenant(),p_insumo_id:m.id,p_tipo:'CONSUMO_OPR',p_cantidad:Number(x.cantidad||0),p_tecnico_id:s.tecnicoId,p_opr_ot_relacionado:consecutivo,p_observacion:'Consumo automático al cierre del OPR',p_usuario_id:u?.id||null,p_usuario_nombre:u?.nombre||u?.name||null});if(r.error){toast('Consumo OPR rechazado',m.nombre+': '+r.error.message,true);return false;}}s.inventarioConsumoOprRegistrado=true;if(typeof window.syncServicioActual==='function')await window.syncServicioActual(consecutivo);await load();return true;};

window.simUseMaterial=async function(consecutivo){const s=(window.incidentesServicios||[]).find(x=>x.consecutivo===consecutivo);const code=document.getElementById('sim-mat-select')?.value,qty=Number(document.getElementById('sim-mat-qty')?.value||1);const m=insumos.find(x=>x.codigo===code);if(!s||!m||!s.tecnicoId){toast('No disponible','Asigna un técnico y selecciona un insumo.',true);return;}const u=appUser();const r=await supabaseClient.rpc('registrar_movimiento_inventario',{p_tenant_id:tenant(),p_insumo_id:m.id,p_tipo:'SALIDA_TECNICO',p_cantidad:qty,p_tecnico_id:s.tecnicoId,p_opr_ot_relacionado:consecutivo,p_observacion:'Salida de material al técnico',p_usuario_id:u?.id||null,p_usuario_nombre:u?.nombre||u?.name||null});if(r.error){toast('No se pudo mover stock',r.error.message,true);return;}s.insumosUsados=s.insumosUsados||[];const x=s.insumosUsados.find(x=>x.codigo===code);if(x)x.cantidad+=qty;else s.insumosUsados.push({codigo:code,cantidad:qty});if(typeof window.syncServicioActual==='function')await window.syncServicioActual(consecutivo);await load();toast('Material entregado','Pasó de Bodega Central al stock del técnico.');};

async function boot(){buildUI();await load();await initInventarioRealtime();}
const originalLoad=window.cargarDatosNubeAlarvix;
if(originalLoad){window.cargarDatosNubeAlaravix=async function(){const r=await originalLoad.apply(this,arguments);await load();await initInventarioRealtime();return r;};}
document.addEventListener('DOMContentLoaded',boot);
setTimeout(()=>{buildUI();if(appUser())load();},1200);
setInterval(()=>{if(appUser()&&document.getElementById('view-inventario')&&!document.getElementById('view-inventario').classList.contains('hidden'))load();},30000);
})();