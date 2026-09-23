import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, createApiClient, type Customer, type Service, type UserRole } from './api';
import { supabase } from './lib/supabase';

type Page = 'dashboard' | 'clientes' | 'servicios';
type Auth = { role: UserRole; tenantId: string; branchId?: string };

const TOKEN_KEY = 'alarvix.dev-access-token';
const api = createApiClient();

function decodeToken(token: string): Auth {
  const part = token.split('.')[1];
  if (!part) throw new Error('Access token inválido.');
  const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
    app_metadata?: { role?: UserRole; tenant_id?: string; branch_id?: string };
  };
  const m = payload.app_metadata;
  if (!m?.role || !m.tenant_id) throw new Error('El token necesita role y tenant_id en app_metadata.');
  return { role: m.role, tenantId: m.tenant_id, branchId: m.branch_id };
}

function canWrite(role?: UserRole) {
  return role === 'admin' || role === 'manager';
}

function message(error: unknown) {
  return error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Error inesperado.';
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [auth, setAuth] = useState<Auth | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenDraft, setTokenDraft] = useState(token);
  const [tokenOpen, setTokenOpen] = useState(!token);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);

  useEffect(() => {
    if (!token) return;
    try { setAuth(decodeToken(token)); } catch { sessionStorage.removeItem(TOKEN_KEY); setToken(''); }
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      const [c, s] = await Promise.all([api.listCustomers(token), api.listServices(token)]);
      setCustomers(c); setServices(s);
    } catch (e) { setError(message(e)); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!token || !auth) return;
    supabase.realtime.setAuth(token);
    const channel = supabase
      .channel('alarvix-live-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes', filter: `tenant_id=eq.${auth.tenantId}` }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servicios', filter: `tenant_id=eq.${auth.tenantId}` }, () => { void refresh(); })
      .subscribe();
    const timer = window.setInterval(() => { void refresh(); }, 15000);
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [token, auth, refresh]);

  const activeServices = useMemo(() => services.filter(s => ['activo','active','en_proceso','pendiente'].includes(s.estado)).length, [services]);

  function connect(e: FormEvent) {
    e.preventDefault();
    try {
      const next = tokenDraft.trim();
      const nextAuth = decodeToken(next);
      setToken(next); setAuth(nextAuth); sessionStorage.setItem(TOKEN_KEY, next); setTokenOpen(false); setError(''); setNotice('Conectado directamente a Supabase.');
    } catch (e) { setError(message(e)); }
  }

  function disconnect() {
    sessionStorage.removeItem(TOKEN_KEY); setToken(''); setTokenDraft(''); setAuth(null); setCustomers([]); setServices([]); setTokenOpen(true);
  }

  async function saveCustomer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!auth || !token) return;
    const fd = new FormData(e.currentTarget);
    const input = {
      tenant_id: auth.tenantId, id: String(fd.get('id') || '').trim(),
      nombre: String(fd.get('nombre') || '').trim(),
      cliente_nombre: String(fd.get('cliente_nombre') || '').trim() || null,
      puesto: String(fd.get('puesto') || '').trim() || null,
      ciudad: String(fd.get('ciudad') || '').trim() || null,
      direccion: String(fd.get('direccion') || '').trim() || null,
      departamento: String(fd.get('departamento') || '').trim() || null,
      sector: String(fd.get('sector') || '').trim() || null,
      incomunicada: fd.get('incomunicada') === 'on',
    };
    try {
      if (editingCustomer) {
        const updated = await api.updateCustomer(token, editingCustomer.id, input);
        setCustomers(v => v.map(x => x.id === updated.id ? updated : x));
      } else {
        if (!input.id || !input.nombre) throw new Error('ID y nombre son obligatorios.');
        const created = await api.createCustomer(token, input);
        setCustomers(v => [created, ...v]);
      }
      setEditingCustomer(null); setNotice('Cliente guardado.'); e.currentTarget.reset();
    } catch (e) { setError(message(e)); }
  }

  async function saveService(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!auth || !token) return;
    const fd = new FormData(e.currentTarget);
    const input = {
      tenant_id: auth.tenantId,
      consecutivo: String(fd.get('consecutivo') || '').trim(),
      tipo: String(fd.get('tipo') || '').trim(),
      prioridad: String(fd.get('prioridad') || 'media'),
      estado: String(fd.get('estado') || 'pendiente'),
      tecnico_id: String(fd.get('tecnico_id') || '').trim() || null,
      fecha_creacion: String(fd.get('fecha_creacion') || new Date().toISOString()),
      descripcion: String(fd.get('descripcion') || '').trim() || null,
      timeline: [],
      insumos_usados: [],
      es_instalacion: fd.get('es_instalacion') === 'on',
      origen_solicitud: String(fd.get('origen_solicitud') || '').trim() || null,
    };
    try {
      if (editingService) {
        const updated = await api.updateService(token, editingService.consecutivo, input);
        setServices(v => v.map(x => x.consecutivo === updated.consecutivo ? updated : x));
      } else {
        if (!input.consecutivo || !input.tipo) throw new Error('Consecutivo y tipo son obligatorios.');
        const created = await api.createService(token, input);
        setServices(v => [created, ...v]);
      }
      setEditingService(null); setNotice('Servicio guardado.'); e.currentTarget.reset();
    } catch (e) { setError(message(e)); }
  }

  async function removeCustomer(id: string) {
    if (!token) return; if (!confirm('¿Eliminar este cliente?')) return;
    try { await api.deleteCustomer(token, id); setCustomers(v => v.filter(x => x.id !== id)); } catch (e) { setError(message(e)); }
  }

  async function removeService(id: string) {
    if (!token) return; if (!confirm('¿Eliminar este servicio?')) return;
    try { await api.deleteService(token, id); setServices(v => v.filter(x => x.consecutivo !== id)); } catch (e) { setError(message(e)); }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-block"><div className="brand-mark">A</div><div><p className="eyebrow">ERP enterprise</p><h1>ALARVIX</h1></div></div>
      <nav className="nav">
        <button className={page === 'dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('dashboard')}>Dashboard</button>
        <button className={page === 'clientes' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('clientes')}>Clientes</button>
        <button className={page === 'servicios' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('servicios')}>Servicios</button>
      </nav>
      <div className={auth ? 'mini-card' : 'mini-card warning'}><span className={auth ? 'dot green' : 'dot yellow'} /><div><strong>{auth ? `Rol: ${auth.role}` : 'Sin conexión'}</strong><small>{auth ? 'Supabase directo' : 'Configura el token'}</small></div></div>
    </aside>
    <main className="main-panel">
      <header className="topbar">
        <div><p className="eyebrow">{auth ? `Tenant ${auth.tenantId.slice(0,8)}` : 'Conexión requerida'}</p><h2>{page === 'dashboard' ? 'Gestión operativa' : page[0].toUpperCase() + page.slice(1)}</h2></div>
        <div className="topbar-actions"><button className="ghost-button" onClick={() => setTokenOpen(v => !v)}>Sesión</button><button className="ghost-button" disabled={!token || loading} onClick={() => void refresh()}>{loading ? 'Actualizando…' : 'Actualizar'}</button></div>
      </header>
      {tokenOpen && <section className="panel token-panel"><div className="panel-header"><div><p className="eyebrow">Supabase</p><h3>Conexión directa</h3></div></div><p className="helper-text">El frontend consulta PostgreSQL directamente con RLS. Usa un access token válido de Supabase. La service_role nunca se expone aquí.</p><form className="token-form" onSubmit={connect}><label>Access token<textarea required value={tokenDraft} onChange={e => setTokenDraft(e.target.value)} /></label><div className="topbar-actions"><button className="primary-button">Conectar</button>{token && <button type="button" className="ghost-button" onClick={disconnect}>Desconectar</button>}</div></form></section>}
      {error && <div className="feedback error-feedback">{error}</div>}
      {notice && <div className="feedback success-feedback">{notice}</div>}
      {!token ? <section className="panel disconnected-state"><h3>Conecta tu sesión</h3><p>Configura un access token de Supabase para consultar el tenant autorizado.</p></section> : loading ? <section className="panel loading-state">Cargando datos…</section> : page === 'dashboard' ? <Dashboard customers={customers} services={services} activeServices={activeServices} /> : page === 'clientes' ? <Customers customers={customers} canWrite={canWrite(auth?.role)} editing={editingCustomer} setEditing={setEditingCustomer} onSave={saveCustomer} onDelete={removeCustomer} /> : <Services services={services} canWrite={canWrite(auth?.role)} editing={editingService} setEditing={setEditingService} onSave={saveService} onDelete={removeService} />}
    </main>
  </div>;
}

function Dashboard({ customers, services, activeServices }: { customers: Customer[]; services: Service[]; activeServices: number }) {
  return <><section className="stats-grid"><article className="stat-card"><span>Clientes</span><strong>{customers.length}</strong><em>tenant actual</em></article><article className="stat-card"><span>Servicios</span><strong>{services.length}</strong><em>registros</em></article><article className="stat-card"><span>Servicios activos</span><strong>{activeServices}</strong><em>según estado</em></article><article className="stat-card"><span>Incomunicados</span><strong>{customers.filter(c => c.incomunicada).length}</strong><em>clientes</em></article></section><section className="content-grid"><div className="panel large-panel"><div className="panel-header"><div><p className="eyebrow">Clientes</p><h3>Últimos registros</h3></div></div>{customers.slice(0,6).map(c => <article className="data-item" key={c.id}><div><span className="code">{c.id}</span><h3>{c.nombre}</h3><p>{c.ciudad || 'Sin ciudad'} · {c.sector || 'Sin sector'}</p></div></article>)}</div><div className="panel company-panel"><div className="panel-header"><div><p className="eyebrow">Operación</p><h3>Servicios recientes</h3></div></div>{services.slice(0,6).map(s => <article className="data-item" key={s.consecutivo}><div><span className="code">{s.consecutivo}</span><h3>{s.tipo}</h3><p>{s.estado} · prioridad {s.prioridad}</p></div></article>)}</div></section></>;
}

function Customers({ customers, canWrite, editing, setEditing, onSave, onDelete }: any) {
  return <section className="panel"><div className="panel-header"><div><p className="eyebrow">Postulados al esquema real</p><h3>Clientes</h3></div><span>{customers.length} registrados</span></div>{canWrite && <form className="form-panel" onSubmit={onSave}><div className="field-row"><label>ID<input name="id" defaultValue={editing?.id || ''} disabled={!!editing} /></label><label>Nombre<input required name="nombre" defaultValue={editing?.nombre || ''} /></label></div><div className="field-row"><label>Cliente<input name="cliente_nombre" defaultValue={editing?.cliente_nombre || ''} /></label><label>Puesto<input name="puesto" defaultValue={editing?.puesto || ''} /></label></div><div className="field-row"><label>Ciudad<input name="ciudad" defaultValue={editing?.ciudad || ''} /></label><label>Sector<input name="sector" defaultValue={editing?.sector || ''} /></label></div><label>Dirección<input name="direccion" defaultValue={editing?.direccion || ''} /></label><label className="checkbox-label"><input type="checkbox" name="incomunicada" defaultChecked={editing?.incomunicada || false} /> Incomunicada</label><div className="topbar-actions"><button className="primary-button">{editing ? 'Actualizar' : 'Crear cliente'}</button>{editing && <button type="button" className="ghost-button" onClick={() => setEditing(null)}>Cancelar</button>}</div></form>}<div className="data-list">{customers.map(c => <article className="data-item" key={c.id}><div><span className="code">{c.id}</span><h3>{c.nombre}</h3><p>{c.ciudad || 'Sin ciudad'} · {c.direccion || 'Sin dirección'}</p></div>{canWrite && <div className="item-actions"><button className="text-button" onClick={() => setEditing(c)}>Editar</button><button className="text-button danger" onClick={() => void onDelete(c.id)}>Eliminar</button></div>}</article>)}</div></section>;
}

function Services({ services, canWrite, editing, setEditing, onSave, onDelete }: any) {
  return <section className="panel"><div className="panel-header"><div><p className="eyebrow">Esquema real</p><h3>Servicios</h3></div><span>{services.length} registrados</span></div>{canWrite && <form className="form-panel" onSubmit={onSave}><div className="field-row"><label>Consecutivo<input required name="consecutivo" defaultValue={editing?.consecutivo || ''} disabled={!!editing} /></label><label>Tipo<input required name="tipo" defaultValue={editing?.tipo || ''} /></label></div><div className="field-row"><label>Prioridad<input name="prioridad" defaultValue={editing?.prioridad || 'media'} /></label><label>Estado<input name="estado" defaultValue={editing?.estado || 'pendiente'} /></label></div><label>Técnico ID<input name="tecnico_id" defaultValue={editing?.tecnico_id || ''} /></label><label>Descripción<textarea name="descripcion" defaultValue={editing?.descripcion || ''} /></label><label>Origen<input name="origen_solicitud" defaultValue={editing?.origen_solicitud || ''} /></label><label className="checkbox-label"><input type="checkbox" name="es_instalacion" defaultChecked={editing?.es_instalacion || false} /> Es instalación</label><div className="topbar-actions"><button className="primary-button">{editing ? 'Actualizar' : 'Crear servicio'}</button>{editing && <button type="button" className="ghost-button" onClick={() => setEditing(null)}>Cancelar</button>}</div></form>}<div className="data-list">{services.map(s => <article className="data-item" key={s.consecutivo}><div><span className="code">{s.consecutivo}</span><h3>{s.tipo}</h3><p>{s.estado} · prioridad {s.prioridad} · técnico {s.tecnico_id || 'sin asignar'}</p></div>{canWrite && <div className="item-actions"><button className="text-button" onClick={() => setEditing(s)}>Editar</button><button className="text-button danger" onClick={() => void onDelete(s.consecutivo)}>Eliminar</button></div>}</article>)}</div></section>;
}
