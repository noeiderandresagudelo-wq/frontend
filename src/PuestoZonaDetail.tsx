import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { UserRole } from './api';
import './puesto-zona-detail.css';

type Installation = {
  id: string; tenant_id: string; codigo_puesto: string | null; nombre: string; tipo_puesto: string | null;
  coordinador_nombre: string | null; telefono_contacto: string | null; sector: string | null; direccion: string | null;
  ciudad: string | null; latitud: number | null; longitud: number | null; geocerca_radio_m: number; estado: string;
  dotacion_estado: string | null; equipamiento_estado: string | null; observaciones: string | null;
  estudio_seguridad_fecha: string | null; ultima_revista_at: string | null; proxima_revista_at: string | null;
  created_at: string; updated_at: string;
};
type Asset = { id: string; instalacion_id: string; nombre_activo: string; codigo_activo: string | null; tipo_activo: string | null; ubicacion_detalle: string | null; estado: string; qr_codigo: string | null; nfc_codigo: string | null };
type Ticket = { id: string; numero_ticket: number; instalacion_id: string; activo_id: string | null; tipo_novedad: string; criticidad: string; estado_ticket: string; descripcion: string; causa_raiz: string | null; solucion: string | null; responsable_nombre: string | null; sla_limite: string | null; created_at: string; updated_at: string };
type Review = { id: string; numero_revista: number; instalacion_id: string; supervisor_id: string; turno_id: string | null; fecha_programada: string | null; fecha_checkin: string | null; fecha_cierre: string | null; estado: string; metodo_checkin: string | null; latitud_checkin: number | null; longitud_checkin: number | null; distancia_checkin_m: number | null; observaciones: string | null };
type Assignment = { id: string; instalacion_id: string; usuario_id: string; rol: string; activo: boolean };
type SupervisionUser = { id: string; nombre: string; username: string; rol: string; activo: boolean };
type Shift = { id: string; nombre: string; hora_inicio: string; hora_fin: string; frecuencia_revistas: number; activo: boolean };
type TabKey = 'info' | 'geo' | 'points' | 'rounds' | 'log' | 'supervision' | 'contacts';

const tabs: { id: TabKey; label: string; icon: string }[] = [
  { id: 'info', label: 'Información general', icon: 'ⓘ' },
  { id: 'geo', label: 'Geocerca', icon: '⌖' },
  { id: 'points', label: 'Puntos de control', icon: '▦' },
  { id: 'rounds', label: 'Configuración de rondas', icon: '↻' },
  { id: 'log', label: 'Minuta digital', icon: '▤' },
  { id: 'supervision', label: 'Supervisión', icon: '✓' },
  { id: 'contacts', label: 'Contactos de emergencia', icon: '☎' },
];
const isAdmin = (role: UserRole) => role === 'admin' || role === 'manager';
const dateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin registro';

export default function PuestoZonaDetail({
  installation, assets, tickets, reviews, assignments, users, shifts, role, onEdit, assignUser, createAsset,
}: {
  installation: Installation; assets: Asset[]; tickets: Ticket[]; reviews: Review[]; assignments: Assignment[];
  users: SupervisionUser[]; shifts: Shift[]; role: UserRole; onEdit: () => void;
  assignUser: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  createAsset: (e: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const activeShifts = useMemo(() => shifts.filter(s => s.activo), [shifts]);
  const activeAssignments = assignments.filter(a => a.activo);
  const openTickets = tickets.filter(t => !['cerrado', 'closed', 'resuelto'].includes(t.estado_ticket.toLowerCase()));
  const pendingReviews = reviews.filter(r => ['pendiente', 'programada', 'atrasada', 'ausente'].includes(r.estado.toLowerCase()));
  const hasGps = installation.latitud !== null && installation.longitud !== null;
  const mapsUrl = hasGps ? `https://www.google.com/maps?q=${installation.latitud},${installation.longitud}` : null;
  const alerts = [
    ...(installation.estado.toLowerCase() !== 'activa' ? [{ tone: 'danger', text: 'Puesto inhabilitado' }] : []),
    ...(activeShifts.length === 0 ? [{ tone: 'warning', text: 'Sin programación de turnos activa' }] : []),
    ...(reviews.length === 0 ? [{ tone: 'warning', text: 'Sin marcaciones de revistas registradas' }] : []),
    ...(!hasGps ? [{ tone: 'muted', text: 'Geolocalización sin configurar' }] : []),
  ];

  return <section className="pz-detail">
    <header className="pz-hero">
      <div className="pz-hero-main">
        <div className="pz-eyebrow">SUPERVISIÓN FÍSICA <span>/</span> FICHA DE PUESTO</div>
        <div className="pz-title-row">
          <div><h2>{installation.nombre}</h2><p>{installation.codigo_puesto || 'SIN CÓDIGO'} · {installation.tipo_puesto || 'Puesto operativo'} · {installation.ciudad || 'Ciudad no registrada'}</p></div>
          <button className="pz-primary" onClick={onEdit}>✎ Editar puesto</button>
        </div>
        <div className="pz-alerts" aria-live="polite">
          <span className={`pz-badge ${installation.estado.toLowerCase() === 'activa' ? 'is-good' : 'is-danger'}`}><i />{installation.estado.toLowerCase() === 'activa' ? 'Puesto habilitado' : 'Puesto inhabilitado'}</span>
          {alerts.map((a, i) => <span key={i} className={`pz-badge is-${a.tone}`}><i />{a.text}</span>)}
        </div>
      </div>
      <div className="pz-quick-grid">
        <Quick label="DIRECCIÓN" value={installation.direccion || 'Dirección pendiente'} icon="⌖" />
        <Quick label="COORDENADAS GPS" value={hasGps ? `${installation.latitud!.toFixed(6)}, ${installation.longitud!.toFixed(6)}` : 'Sin coordenadas'} icon="◎" />
        <Quick label="SUCURSAL / REGIÓN" value={[installation.sector, installation.ciudad].filter(Boolean).join(' · ') || 'Sin asignar'} icon="⌂" />
        <Quick label="RESPONSABLE" value={installation.coordinador_nombre || 'Sin responsable'} icon="♙" />
      </div>
    </header>

    <nav className="pz-tabs" aria-label="Secciones del puesto">
      {tabs.map(tab => {
        const count = tab.id === 'points' ? assets.length : tab.id === 'log' ? tickets.length : tab.id === 'supervision' ? reviews.length : undefined;
        return <button key={tab.id} className={activeTab === tab.id ? 'pz-tab active' : 'pz-tab'} onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined}>
          <span className="pz-tab-icon">{tab.icon}</span><span>{tab.label}</span>{count !== undefined && <b>{count}</b>}
        </button>;
      })}
    </nav>

    <div className="pz-tab-content">
      {activeTab === 'info' && <div className="pz-columns">
        <section className="pz-card">
          <CardHeading eyebrow="DATOS DEL PUESTO" title="Información general" />
          <div className="pz-info-grid">
            <Info label="Nombre del puesto" value={installation.nombre} />
            <Info label="Código" value={installation.codigo_puesto} />
            <Info label="Tipo de puesto" value={installation.tipo_puesto} />
            <Info label="Cliente" value="No disponible en la ficha actual" />
            <Info label="Coordinador / administrador" value={installation.coordinador_nombre} />
            <Info label="Teléfono de contacto" value={installation.telefono_contacto} />
            <Info label="Sector / región" value={installation.sector} />
            <Info label="Ciudad" value={installation.ciudad} />
            <Info label="Dirección física" value={installation.direccion} />
            <Info label="Dotación" value={installation.dotacion_estado} />
            <Info label="Equipamiento" value={installation.equipamiento_estado} />
            <Info label="Estudio de seguridad" value={installation.estudio_seguridad_fecha} />
            <Info label="Usuario creador" value="No disponible en el modelo de puesto actual" />
            <Info label="Creado" value={dateTime(installation.created_at)} />
            <Info label="Última actualización" value={dateTime(installation.updated_at)} />
          </div>
          <div className="pz-notes"><span>OBSERVACIONES</span><p>{installation.observaciones || 'No se han registrado observaciones para este puesto.'}</p></div>
        </section>
        <section className="pz-card">
          <CardHeading eyebrow="OPERACIÓN" title="Resumen del puesto" />
          <div className="pz-metrics">
            <Metric label="Puntos de control" value={assets.length} icon="▦" />
            <Metric label="Novedades abiertas" value={openTickets.length} icon="⚑" tone={openTickets.length ? 'warning' : 'good'} />
            <Metric label="Revistas registradas" value={reviews.length} icon="✓" />
            <Metric label="Personal asignado" value={activeAssignments.length} icon="♙" />
          </div>
          <div className="pz-divider" />
          <h4 className="pz-subtitle">Personal asignado</h4>
          <div className="pz-record-list">{activeAssignments.map(a => { const u = users.find(x => x.id === a.usuario_id); return <div className="pz-record" key={a.id}><span className="pz-avatar">{(u?.nombre || 'U').slice(0, 1).toUpperCase()}</span><div><strong>{u?.nombre || a.usuario_id}</strong><small>{u?.username || 'Usuario'} · {a.rol}</small></div><span className="pz-mini-status">Activo</span></div>; })}{!activeAssignments.length && <Empty text="No hay personal asignado a este puesto." />}</div>
          {isAdmin(role) && <form className="pz-form" onSubmit={assignUser}>
            <label>Usuario<select name="usuario_id" required defaultValue=""><option value="" disabled>Seleccionar usuario…</option>{users.filter(u => u.activo).map(u => <option key={u.id} value={u.id}>{u.nombre} · {u.rol}</option>)}</select></label>
            <label>Rol<select name="rol" defaultValue="supervisor"><option value="supervisor">Supervisor</option><option value="auditor">Auditor</option><option value="administrador">Administrador</option></select></label>
            <button className="pz-secondary" type="submit">+ Asignar personal</button>
          </form>}
        </section>
      </div>}

      {activeTab === 'geo' && <div className="pz-columns">
        <section className="pz-card pz-map-card">
          <CardHeading eyebrow="VALIDACIÓN DE PRESENCIA" title="Geocerca del puesto" />
          <div className="pz-geofence-visual"><div className="pz-ring pz-ring-outer"><div className="pz-ring pz-ring-inner"><span className="pz-map-pin">⌖</span></div></div><span className="pz-map-caption">RADIO CONFIGURADO · {installation.geocerca_radio_m} M</span></div>
          <div className="pz-map-meta"><div><span>Latitud</span><strong>{installation.latitud?.toFixed(6) ?? 'No configurada'}</strong></div><div><span>Longitud</span><strong>{installation.longitud?.toFixed(6) ?? 'No configurada'}</strong></div><div><span>Radio permitido</span><strong>{installation.geocerca_radio_m} m</strong></div></div>
          {mapsUrl ? <a className="pz-primary pz-link-button" href={mapsUrl} target="_blank" rel="noreferrer">↗ Abrir ubicación en Google Maps</a> : <div className="pz-inline-alert">Agrega las coordenadas GPS al editar el puesto para habilitar la ubicación en el mapa.</div>}
          <p className="pz-footnote">La vista circular representa el radio configurado; no es un polígono cartográfico. La validación efectiva depende de la ubicación capturada por el dispositivo durante el check-in.</p>
        </section>
        <section className="pz-card">
          <CardHeading eyebrow="REGLAS DE UBICACIÓN" title="Validación GPS" />
          <Info label="Estado de geocerca" value={hasGps ? 'Coordenadas configuradas' : 'Pendiente de configuración'} />
          <Info label="Método" value="Radio circular" />
          <Info label="Tolerancia" value={`Hasta ${installation.geocerca_radio_m} metros desde el punto central`} />
          <div className="pz-divider" />
          <h4 className="pz-subtitle">Últimas revistas con ubicación</h4>
          {reviews.filter(r => r.latitud_checkin !== null && r.longitud_checkin !== null).slice(0, 5).map(r => <div className="pz-record" key={r.id}><span className="pz-avatar">⌖</span><div><strong>Revista #{r.numero_revista}</strong><small>{dateTime(r.fecha_checkin)}</small></div><a className="pz-text-link" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${r.latitud_checkin},${r.longitud_checkin}`}>Ver mapa</a></div>)}
          {!reviews.some(r => r.latitud_checkin !== null && r.longitud_checkin !== null) && <Empty text="Todavía no hay check-ins con coordenadas." />}
        </section>
      </div>}

      {activeTab === 'points' && <section className="pz-card">
        <CardHeading eyebrow="IDENTIFICACIÓN EN SITIO" title="Puntos de control QR / NFC" />
        <p className="pz-muted">Los activos registrados para este puesto se muestran como puntos de control cuando cuentan con código QR o NFC.</p>
        {isAdmin(role) && <form className="pz-form pz-form-wide" onSubmit={createAsset}>
          <label>Nombre del punto<input name="nombre_activo" required placeholder="Ej. Acceso principal" /></label>
          <label>Código interno<input name="codigo_activo" placeholder="PC-001" /></label>
          <label>Código QR<input name="qr_codigo" placeholder="Código o identificador QR" /></label>
          <label>Código NFC<input name="nfc_codigo" placeholder="UID NFC" /></label>
          <label>Tipo<input name="tipo_activo" placeholder="Acceso, perímetro…" /></label>
          <label>Ubicación física<input name="ubicacion_detalle" placeholder="Ej. Portería norte" /></label>
          <button className="pz-primary" type="submit">+ Registrar punto</button>
        </form>}
        <div className="pz-point-grid">{assets.map(asset => <article className="pz-point-card" key={asset.id}>
          <div className="pz-point-top"><span className="pz-point-symbol">▦</span><span className={`pz-state-pill ${asset.estado.toLowerCase().includes('operativo') ? 'good' : 'warning'}`}>{asset.estado}</span></div>
          <h4>{asset.nombre_activo}</h4><p>{asset.codigo_activo || 'Sin código interno'} · {asset.tipo_activo || 'Punto sin tipo'}</p>
          <div className="pz-code-row"><span>QR</span><code>{asset.qr_codigo || 'No configurado'}</code></div>
          <div className="pz-code-row"><span>NFC</span><code>{asset.nfc_codigo || 'No configurado'}</code></div>
          <small>⌖ {asset.ubicacion_detalle || 'Ubicación no especificada'}</small>
        </article>)}</div>
        {!assets.length && <Empty text="No hay puntos de control registrados. Registra uno con QR o NFC para comenzar." />}
      </section>}

      {activeTab === 'rounds' && <div className="pz-columns">
        <section className="pz-card">
          <CardHeading eyebrow="RUTAS Y FRECUENCIAS" title="Configuración de rondas" />
          {activeShifts.map(s => <article className="pz-shift-card" key={s.id}><div><span className="pz-state-pill good">Activo</span><h4>{s.nombre}</h4><p>{s.hora_inicio} – {s.hora_fin}</p></div><div className="pz-shift-frequency"><strong>{s.frecuencia_revistas}</strong><small>revista(s)</small></div></article>)}
          {!activeShifts.length && <Empty text="No hay turnos activos configurados en el módulo. Configura turnos desde la sección Turnos." />}
          <div className="pz-inline-alert">La configuración actual de turnos es global. La asignación de rutas, días y tolerancias por puesto requiere una programación específica que aún no está representada en el modelo de datos conectado.</div>
        </section>
        <section className="pz-card">
          <CardHeading eyebrow="CONTROL DE CUMPLIMIENTO" title="Actividad de rondas" />
          <Metric label="Revistas registradas" value={reviews.length} icon="✓" />
          <Metric label="Pendientes / ausentes (según estado)" value={pendingReviews.length} icon="!" tone={pendingReviews.length ? 'warning' : 'good'} />
          <Metric label="Sin check-in GPS" value={reviews.filter(r => r.latitud_checkin === null || r.longitud_checkin === null).length} icon="⌖" tone="warning" />
          <p className="pz-footnote">Los estados se muestran según los registros disponibles; la ausencia solo puede confirmarse cuando existe una programación esperada para ese horario.</p>
        </section>
      </div>}

      {activeTab === 'log' && <section className="pz-card">
        <CardHeading eyebrow="TRAZABILIDAD CRONOLÓGICA" title="Minuta digital del puesto" />
        <div className="pz-timeline">{[...tickets].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(t => <article className="pz-timeline-item" key={t.id}><span className={`pz-timeline-dot ${t.criticidad.toLowerCase().includes('crítica') || t.criticidad.toLowerCase().includes('alta') ? 'danger' : ''}`} /><div className="pz-timeline-head"><div><span className="pz-eyebrow">NOVEDAD #{t.numero_ticket} · {t.tipo_novedad}</span><h4>{t.descripcion}</h4></div><span className={`pz-state-pill ${t.estado_ticket.toLowerCase().includes('cerr') ? 'good' : 'warning'}`}>{t.estado_ticket}</span></div><p>{t.solucion || t.causa_raiz || 'Sin ampliación registrada.'}</p><small>{dateTime(t.created_at)} · {t.responsable_nombre || 'Sin responsable'} · Criticidad: {t.criticidad}</small></article>)}</div>
        {!tickets.length && <Empty text="La minuta aparecerá aquí cuando se registren novedades para este puesto." />}
      </section>}

      {activeTab === 'supervision' && <section className="pz-card">
        <CardHeading eyebrow="REVISTAS DE CONTROL" title="Registros de supervisión" />
        <div className="pz-metrics pz-metrics-three"><Metric label="Total revistas" value={reviews.length} icon="✓" /><Metric label="Con check-in" value={reviews.filter(r => !!r.fecha_checkin).length} icon="⌖" /><Metric label="Pendientes según estado" value={pendingReviews.length} icon="!" tone={pendingReviews.length ? 'warning' : 'good'} /></div>
        <div className="pz-table-wrap"><table className="pz-table"><thead><tr><th>Revista</th><th>Programada</th><th>Check-in</th><th>Método</th><th>Distancia</th><th>Estado</th><th>Observaciones</th></tr></thead><tbody>
          {[...reviews].sort((a, b) => new Date(b.fecha_programada || b.fecha_checkin || 0).getTime() - new Date(a.fecha_programada || a.fecha_checkin || 0).getTime()).map(r => <tr key={r.id}><td>#{r.numero_revista}</td><td>{dateTime(r.fecha_programada)}</td><td>{dateTime(r.fecha_checkin)}</td><td>{r.metodo_checkin || '—'}</td><td>{r.distancia_checkin_m !== null ? `${Math.round(r.distancia_checkin_m)} m` : '—'}</td><td><span className={`pz-state-pill ${r.fecha_checkin ? 'good' : 'warning'}`}>{r.estado}</span></td><td>{r.observaciones || '—'}</td></tr>)}
        </tbody></table></div>
        {!reviews.length && <Empty text="Aún no hay revistas registradas para este puesto." />}
        <div className="pz-inline-alert">Las lecturas QR/NFC obligatorias, los días de la semana y las tolerancias por supervisor no se pueden editar desde esta ficha todavía: no hay una configuración por puesto conectada a esta vista.</div>
      </section>}

      {activeTab === 'contacts' && <div className="pz-columns">
        <section className="pz-card">
          <CardHeading eyebrow="CONTACTO PRINCIPAL" title="Responsables del puesto" />
          <Contact title="Coordinador / administrador" name={installation.coordinador_nombre} phone={installation.telefono_contacto} />
          <Contact title="Central de monitoreo" name={null} phone={null} />
          <Contact title="Cliente" name={null} phone={null} />
          <p className="pz-footnote">Los contactos de central y cliente se muestran como pendientes porque la ficha actual solo almacena el teléfono del contacto principal.</p>
        </section>
        <section className="pz-card">
          <CardHeading eyebrow="ATENCIÓN PRIORITARIA" title="Acciones rápidas" />
          <a className="pz-secondary pz-link-button" href={installation.telefono_contacto ? `tel:${installation.telefono_contacto.replace(/[^+\d]/g, '')}` : undefined} aria-disabled={!installation.telefono_contacto}>☎ Llamar al contacto principal</a>
          {mapsUrl && <a className="pz-secondary pz-link-button" href={mapsUrl} target="_blank" rel="noreferrer">⌖ Abrir ubicación del puesto</a>}
          {!installation.telefono_contacto && <div className="pz-inline-alert">Registra un teléfono de contacto para habilitar la llamada directa.</div>}
        </section>
      </div>}
    </div>

    <section className="pz-schedule">
      <div className="pz-schedule-header"><div><p className="pz-eyebrow">COBERTURA OPERATIVA</p><h3>Programación de turnos</h3><p>Resumen de turnos activos y estado de las revistas asociadas al puesto.</p></div><button className="pz-primary" onClick={() => setActiveTab('rounds')}>⚙ Configurar programación</button></div>
      <div className="pz-schedule-stats"><div><span>Turnos activos disponibles</span><strong>{activeShifts.length}</strong></div><div><span>Revistas registradas</span><strong>{reviews.length}</strong></div><div><span>Check-ins registrados</span><strong>{reviews.filter(r => !!r.fecha_checkin).length}</strong></div><div><span>Alertas de estado</span><strong className={pendingReviews.length || activeShifts.length === 0 ? 'pz-number-warning' : 'pz-number-good'}>{pendingReviews.length + (activeShifts.length === 0 ? 1 : 0)}</strong></div></div>
      <div className="pz-table-wrap"><table className="pz-table"><thead><tr><th>Día</th><th>Cuadrante asignado</th><th>Horario</th><th>Frecuencia de revistas</th><th>Estado</th></tr></thead><tbody>
        {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day => <tr key={day}><td>{day}</td><td>{activeShifts.length ? 'Turno disponible, asignación por día pendiente' : 'Sin turno activo'}</td><td>{activeShifts.length ? activeShifts.map(s => `${s.hora_inicio}–${s.hora_fin}`).join(', ') : '—'}</td><td>{activeShifts.length ? activeShifts.map(s => s.frecuencia_revistas).join(', ') : '—'}</td><td><span className={`pz-state-pill ${activeShifts.length ? 'warning' : 'danger'}`}>{activeShifts.length ? 'Sin asignación diaria' : 'Sin programación'}</span></td></tr>)}
      </tbody></table></div>
      <p className="pz-footnote">Importante: los turnos que aparecen son los configurados globalmente. Esta interfaz no inventa asignaciones diarias ni ausencias; para persistir cuadrantes por día se necesita añadir el modelo de programación específica por puesto.</p>
    </section>
  </section>;
}

function Quick({ label, value, icon }: { label: string; value: string; icon: string }) {
  return <div className="pz-quick"><span className="pz-quick-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}
function CardHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="pz-card-heading"><div><span>{eyebrow}</span><h3>{title}</h3></div></div>;
}
function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="pz-info"><span>{label}</span><strong>{value || '—'}</strong></div>;
}
function Metric({ label, value, icon, tone = 'neutral' }: { label: string; value: number; icon: string; tone?: 'neutral' | 'good' | 'warning' }) {
  return <div className={`pz-metric ${tone}`}><span className="pz-metric-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}
function Empty({ text }: { text: string }) {
  return <div className="pz-empty"><span>◇</span><p>{text}</p></div>;
}
function Contact({ title, name, phone }: { title: string; name: string | null; phone: string | null }) {
  return <div className="pz-contact"><span className="pz-contact-icon">☎</span><div><small>{title}</small><strong>{name || 'Pendiente de configurar'}</strong><span>{phone || 'Sin teléfono registrado'}</span></div>{phone && <a href={`tel:${phone.replace(/[^+\d]/g, '')}`}>Llamar</a>}</div>;
}
