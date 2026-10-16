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
type Review = { id: string; numero_revista: number; instalacion_id: string; supervisor_id: string; turno_id: string | null; fecha_programada: string | null; fecha_checkin: string | null; fecha_cierre: string | null; estado: string; metodo_checkin: string | null; latitud_checkin: number | null; longitud_checkin: number | null; distancia_checkin_m: number | null; observaciones: string | null; created_at?: string };
type Anomaly = { id: string; instalacion_id: string | null; revista_id: string | null; tipo_anomalia: string; severidad: string; descripcion: string; estado: string; created_at: string };
type Assignment = { id: string; instalacion_id: string; usuario_id: string; rol: string; activo: boolean };
type SupervisionUser = { id: string; nombre: string; username: string; rol: string; activo: boolean };
type Shift = { id: string; nombre: string; hora_inicio: string; hora_fin: string; frecuencia_revistas: number; activo: boolean };
type RoundConfig = { id: string; nombre: string; puntos: string[]; frecuenciaMinutos: number; toleranciaMetros: number; horaInicio: string; horaFin: string; activo: boolean };
type SupervisionWindow = { inicio: string; fin: string };
type SupervisionRule = { id: string; tenant_id: string; instalacion_id: string; revistas_requeridas: number; periodo_objetivo: 'dia' | 'turno'; ventanas_horarias: SupervisionWindow[]; requerir_qr: boolean; requerir_gps: boolean; requerir_firma: boolean; tolerancia_omision_min: number; activo: boolean; created_at: string; updated_at: string };
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
  installation, assets, tickets, reviews, assignments, users, shifts, anomalies, supervisionRules, saveSupervisionRule, role, onEdit, assignUser, createAsset,
}: {
  installation: Installation; assets: Asset[]; tickets: Ticket[]; reviews: Review[]; assignments: Assignment[];
  users: SupervisionUser[]; shifts: Shift[]; anomalies: Anomaly[]; supervisionRules: SupervisionRule[]; role: UserRole; onEdit: () => void;
  saveSupervisionRule: (rule: Omit<SupervisionRule, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => Promise<boolean>;
  assignUser: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  createAsset: (e: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const [roundConfigs, setRoundConfigs] = useState<RoundConfig[]>([]);
  const [roundModalOpen, setRoundModalOpen] = useState(false);
  const [editingRound, setEditingRound] = useState<RoundConfig | null>(null);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const activeShifts = useMemo(() => shifts.filter(s => s.activo), [shifts]);
  const activeAssignments = assignments.filter(a => a.activo);
  const openTickets = tickets.filter(t => !['cerrado', 'closed', 'resuelto'].includes(t.estado_ticket.toLowerCase()));
  const pendingReviews = reviews.filter(r => ['pendiente', 'programada', 'atrasada', 'ausente'].includes(r.estado.toLowerCase()));
  const hasGps = installation.latitud !== null && installation.longitud !== null;
  const mapsUrl = hasGps ? `https://www.google.com/maps?q=${installation.latitud},${installation.longitud}` : null;
  const supervisionRule = supervisionRules.find(rule => rule.instalacion_id === installation.id) || null;
  const todayKey = bogotaDateKey(new Date().toISOString());
  const reviewsToday = reviews.filter(review => review.fecha_checkin && review.estado.toLowerCase() === 'completada' && bogotaDateKey(review.fecha_checkin) === todayKey);
  const currentTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const currentShift = activeShifts.find(shift => timeIsInWindow(currentTime, shift.hora_inicio, shift.hora_fin)) || null;
  const complianceReviews = supervisionRule?.periodo_objetivo === 'turno' && currentShift ? reviewsToday.filter(review => review.turno_id === currentShift.id) : reviewsToday;
  const visitsDone = complianceReviews.length;
  const visitsRequired = supervisionRule?.revistas_requeridas || 0;
  const compliancePercent = visitsRequired ? Math.min(100, Math.round(visitsDone / visitsRequired * 100)) : 0;
  const omissionDue = !!(supervisionRule?.activo && visitsRequired > visitsDone && supervisionRule.ventanas_horarias.some(window => windowExceededTolerance(currentTime, window.inicio, window.fin, supervisionRule.tolerancia_omision_min)));

  return <section className="pz-detail">
    <header className="pz-hero">
      <div className="pz-hero-main">
        <div className="pz-eyebrow">SUPERVISIÓN FÍSICA <span>/</span> FICHA DE PUESTO</div>
        <div className="pz-title-row">
          <div><h2>{installation.nombre}</h2><p>{installation.codigo_puesto || 'SIN CÓDIGO'} · {installation.tipo_puesto || 'Puesto operativo'} · {installation.ciudad || 'Ciudad no registrada'}</p></div>
          <button className="pz-primary" onClick={onEdit}>✎ Editar puesto</button>
        </div>
        <div className="pz-alerts" aria-live="polite">
          <span className={`pz-badge ${installation.estado.toLowerCase() === 'activa' ? 'is-good' : 'is-danger'}`}><i />{installation.estado.toLowerCase() === 'activa' ? 'Activo' : 'Inhabilitado'}</span>
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
          {mapsUrl && <a className="pz-primary pz-link-button" href={mapsUrl} target="_blank" rel="noreferrer">↗ Abrir ubicación en Google Maps</a>}
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

      {activeTab === 'rounds' && <div className="pz-rounds-view">
        <section className="pz-card">
          <div className="pz-rounds-heading"><CardHeading eyebrow="RUTAS Y FRECUENCIAS" title="Configuración de rondas" /><button type="button" className="pz-primary" onClick={() => { setEditingRound(null); setRoundModalOpen(true); }}>+ Configurar ruta</button></div>
          <p className="pz-muted">Define los puntos que debe recorrer el supervisor, la frecuencia de validación y el horario de cada ruta.</p>
          {roundConfigs.length > 0 ? <div className="pz-table-wrap"><table className="pz-table"><thead><tr><th>Ruta</th><th>Puntos de control</th><th>Frecuencia</th><th>Tolerancia</th><th>Horario</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
            {roundConfigs.map(route => <tr key={route.id}><td><strong>{route.nombre}</strong></td><td>{route.puntos.map(id => assets.find(a => a.id === id)?.nombre_activo || id).join(', ') || 'Sin puntos'}</td><td>Cada {route.frecuenciaMinutos} min</td><td>{route.toleranciaMetros} m</td><td>{route.horaInicio} – {route.horaFin}</td><td><span className={`pz-state-pill ${route.activo ? 'good' : 'neutral'}`}>{route.activo ? 'Activa' : 'Inactiva'}</span></td><td><div className="pz-round-actions"><button type="button" className="pz-text-button" onClick={() => { setEditingRound(route); setRoundModalOpen(true); }}>Editar</button><button type="button" className="pz-text-button" onClick={() => setRoundConfigs(current => current.map(item => item.id === route.id ? { ...item, activo: !item.activo } : item))}>{route.activo ? 'Desactivar' : 'Activar'}</button></div></td></tr>)}
          </tbody></table></div> : <Empty text="Aún no hay rutas definidas. Usa “Configurar ruta” para establecer puntos, frecuencia, tolerancia y horario." />}
          <div className="pz-divider" /><h4 className="pz-subtitle">Turnos disponibles</h4>
          <div className="pz-shift-grid">{activeShifts.map(s => <article className="pz-shift-card" key={s.id}><div><span className="pz-state-pill good">Turno activo</span><h4>{s.nombre}</h4><p>{s.hora_inicio} – {s.hora_fin}</p></div><div className="pz-shift-frequency"><strong>{s.frecuencia_revistas}</strong><small>revista(s)</small></div></article>)}{!activeShifts.length && <Empty text="No hay turnos activos registrados." />}</div>
        </section>
        <section className="pz-card">
          <CardHeading eyebrow="CONTROL DE CUMPLIMIENTO" title="Actividad de rondas" />
          <div className="pz-metrics"><Metric label="Rutas definidas" value={roundConfigs.filter(route => route.activo).length} icon="↻" /><Metric label="Revistas registradas" value={reviews.length} icon="✓" /><Metric label="Pendientes / ausentes" value={pendingReviews.length} icon="!" tone={pendingReviews.length ? 'warning' : 'good'} /><Metric label="Sin check-in GPS" value={reviews.filter(r => r.latitud_checkin === null || r.longitud_checkin === null).length} icon="⌖" tone="warning" /></div>
        </section>
      </div>}

      {activeTab === 'log' && <section className="pz-card">
        <CardHeading eyebrow="TRAZABILIDAD CRONOLÓGICA" title="Minuta digital del puesto" />
        <div className="pz-timeline">{[...tickets].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(t => <article className="pz-timeline-item" key={t.id}><span className={`pz-timeline-dot ${t.criticidad.toLowerCase().includes('crítica') || t.criticidad.toLowerCase().includes('alta') ? 'danger' : ''}`} /><div className="pz-timeline-head"><div><span className="pz-eyebrow">NOVEDAD #{t.numero_ticket} · {t.tipo_novedad}</span><h4>{t.descripcion}</h4></div><span className={`pz-state-pill ${t.estado_ticket.toLowerCase().includes('cerr') ? 'good' : 'warning'}`}>{t.estado_ticket}</span></div><p>{t.solucion || t.causa_raiz || 'Sin ampliación registrada.'}</p><small>{dateTime(t.created_at)} · {t.responsable_nombre || 'Sin responsable'} · Criticidad: {t.criticidad}</small></article>)}</div>
        {!tickets.length && <Empty text="La minuta aparecerá aquí cuando se registren novedades para este puesto." />}
      </section>}

      {activeTab === 'supervision' && <div className="pz-supervision-view">
        <section className="pz-card pz-supervision-config">
          <div className="pz-supervision-config-head"><div><CardHeading eyebrow="REGLAS DEL PUESTO" title="Configuración de reglas de inspección" /><p className="pz-muted">Define la obligación operativa y los criterios que debe cumplir cada revista.</p></div>{isAdmin(role) && <button type="button" className="pz-primary" onClick={() => setRuleModalOpen(true)}>⚙ Configurar parámetros de revista</button>}</div>
          {supervisionRule ? <div className="pz-rule-summary">
            <div className="pz-rule-summary-item"><small>Frecuencia requerida</small><strong>{supervisionRule.revistas_requeridas} revistas / {supervisionRule.periodo_objetivo === 'dia' ? 'día' : 'turno'}</strong></div>
            <div className="pz-rule-summary-item"><small>Ventanas permitidas</small><strong>{supervisionRule.ventanas_horarias.length ? supervisionRule.ventanas_horarias.map(window => `${window.inicio}–${window.fin}`).join(' · ') : 'Sin franjas'}</strong></div>
            <div className="pz-rule-summary-item"><small>Validaciones obligatorias</small><strong>{[supervisionRule.requerir_qr && 'QR', supervisionRule.requerir_gps && 'GPS', supervisionRule.requerir_firma && 'Firma digital'].filter(Boolean).join(' + ') || 'Sin método obligatorio'}</strong></div>
            <div className="pz-rule-summary-item"><small>Tolerancia de omisión</small><strong>{supervisionRule.tolerancia_omision_min} minutos</strong></div>
            <span className={`pz-state-pill ${supervisionRule.activo ? 'good' : 'neutral'}`}>{supervisionRule.activo ? 'Regla activa' : 'Regla inactiva'}</span>
          </div> : <Empty text="Aún no se han definido reglas de revista para este puesto. Configura la frecuencia, las franjas horarias y los métodos obligatorios para medir el cumplimiento." />}
        </section>

        <section className="pz-card pz-compliance-card">
          <div className="pz-compliance-head"><div><p className="pz-eyebrow">ESTATUS DE CUMPLIMIENTO DE HOY</p><h3>{supervisionRule?.periodo_objetivo === 'turno' ? 'Cumplimiento del turno actual' : 'Cumplimiento diario'}</h3><p>{new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'full' })}{supervisionRule?.periodo_objetivo === 'turno' && currentShift ? ` · ${currentShift.nombre}` : ''}</p></div><span className={`pz-compliance-percent ${compliancePercent >= 100 ? 'is-complete' : ''}`}>{supervisionRule ? `${compliancePercent}%` : '—'}</span></div>
          {supervisionRule ? <>
            <div className="pz-progress-track" role="progressbar" aria-label="Cumplimiento de revistas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={compliancePercent}><span style={{ width: `${compliancePercent}%` }} /></div>
            <div className="pz-compliance-footer"><strong>{visitsDone} de {visitsRequired} revistas realizadas {supervisionRule.periodo_objetivo === 'dia' ? 'hoy' : 'en este turno'}</strong><span>{compliancePercent}% cumplido</span></div>
            <div className="pz-compliance-alerts">{omissionDue ? <span className="pz-omission-pill">Omisión potencial: superó la tolerancia configurada</span> : visitsDone >= visitsRequired ? <span className="pz-complete-pill">Meta alcanzada</span> : <span className="pz-pending-pill">Pendiente de completar la meta</span>}{supervisionRule.periodo_objetivo === 'turno' && !currentShift && <span className="pz-pending-pill">No se detectó un turno activo; se cuentan las revistas de hoy</span>}</div>
            <div className="pz-window-status"><small>Franjas de inspección</small>{supervisionRule.ventanas_horarias.map((window, index) => <span key={index} className={windowExceededTolerance(currentTime, window.inicio, window.fin, supervisionRule.tolerancia_omision_min) ? 'is-past' : ''}>{`Rango ${index + 1}: ${window.inicio}–${window.fin}`}</span>)}</div>
          </> : <Empty text="El indicador de cumplimiento aparecerá cuando guardes las reglas de inspección." />}
        </section>

        <section className="pz-card">
          <div className="pz-history-header"><div><CardHeading eyebrow="TRAZABILIDAD OPERATIVA" title="Historial de revistas ejecutadas" /><p className="pz-muted">Registros reales de check-in y cierre asociados al puesto.</p></div><span className="pz-history-count">{reviews.length} registros</span></div>
          <div className="pz-table-wrap"><table className="pz-table"><thead><tr><th>Fecha / hora</th><th>Supervisor asignado</th><th>Método</th><th>Distancia GPS</th><th>Estado</th><th>Novedades / observaciones</th></tr></thead><tbody>
            {[...reviews].sort((a, b) => new Date(b.fecha_checkin || b.fecha_programada || 0).getTime() - new Date(a.fecha_checkin || a.fecha_programada || 0).getTime()).map(review => <tr key={review.id}><td>{dateTime(review.fecha_checkin || review.fecha_programada || review.created_at)}</td><td>{users.find(user => user.id === review.supervisor_id)?.nombre || 'Supervisor sin nombre disponible'}</td><td>{review.metodo_checkin || '—'}</td><td>{review.distancia_checkin_m != null ? `${Math.round(review.distancia_checkin_m)} m` : '—'}</td><td><span className={`pz-state-pill ${review.estado === 'Completada' ? 'good' : review.estado === 'Incidencia' ? 'warning' : 'neutral'}`}>{review.estado}</span></td><td>{[review.observaciones, ...anomalies.filter(item => item.revista_id === review.id).map(item => `${item.tipo_anomalia}: ${item.descripcion}`)].filter(Boolean).join(' · ') || '—'}</td></tr>)}
          </tbody></table></div>
          {!reviews.length && <Empty text="Todavía no hay revistas registradas para este puesto. Las nuevas revistas aparecerán aquí con su fecha, método, distancia y observaciones." />}
        </section>
      </div>}

      {activeTab === 'contacts' && <div className="pz-columns">
        <section className="pz-card">
          <CardHeading eyebrow="CONTACTO PRINCIPAL" title="Responsables del puesto" />
          <Contact title="Coordinador / administrador" name={installation.coordinador_nombre} phone={installation.telefono_contacto} />
          <Contact title="Central de monitoreo" name={null} phone={null} />
          <Contact title="Cliente" name={null} phone={null} />
        </section>
        <section className="pz-card">
          <CardHeading eyebrow="ATENCIÓN PRIORITARIA" title="Acciones rápidas" />
          <a className="pz-secondary pz-link-button" href={installation.telefono_contacto ? `tel:${installation.telefono_contacto.replace(/[^+\d]/g, '')}` : undefined} aria-disabled={!installation.telefono_contacto}>☎ Llamar al contacto principal</a>
          {mapsUrl && <a className="pz-secondary pz-link-button" href={mapsUrl} target="_blank" rel="noreferrer">⌖ Abrir ubicación del puesto</a>}
        </section>
      </div>}
    </div>

    {ruleModalOpen && <SupervisionRuleModal installationId={installation.id} installationName={installation.nombre} currentRule={supervisionRule} onClose={() => setRuleModalOpen(false)} onSave={saveSupervisionRule} />}
    {roundModalOpen && <RoundConfigModal assets={assets} installation={installation} editing={editingRound} onClose={() => setRoundModalOpen(false)} onSave={route => { setRoundConfigs(current => editingRound ? current.map(item => item.id === editingRound.id ? { ...route, id: editingRound.id } : item) : [...current, { ...route, id: `route-${Date.now()}` }]); setRoundModalOpen(false); setEditingRound(null); }} />}

  </section>;
}

function SupervisionRuleModal({ installationId, installationName, currentRule, onClose, onSave }: { installationId: string; installationName: string; currentRule: SupervisionRule | null; onClose: () => void; onSave: (rule: Omit<SupervisionRule, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>) => Promise<boolean> }) {
  const [revistasRequeridas, setRevistasRequeridas] = useState(String(currentRule?.revistas_requeridas ?? 2));
  const [periodoObjetivo, setPeriodoObjetivo] = useState<'dia' | 'turno'>(currentRule?.periodo_objetivo || 'dia');
  const [ventanas, setVentanas] = useState<SupervisionWindow[]>(currentRule?.ventanas_horarias?.length ? currentRule.ventanas_horarias : [{ inicio: '22:00', fin: '02:00' }, { inicio: '10:00', fin: '14:00' }]);
  const [requerirQr, setRequerirQr] = useState(currentRule?.requerir_qr ?? true);
  const [requerirGps, setRequerirGps] = useState(currentRule?.requerir_gps ?? true);
  const [requerirFirma, setRequerirFirma] = useState(currentRule?.requerir_firma ?? false);
  const [tolerancia, setTolerancia] = useState(String(currentRule?.tolerancia_omision_min ?? 30));
  const [activo, setActivo] = useState(currentRule?.activo ?? true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const updateWindow = (index: number, field: keyof SupervisionWindow, value: string) => setVentanas(current => current.map((window, position) => position === index ? { ...window, [field]: value } : window));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaveError('');
    const validWindows = ventanas.filter(window => window.inicio && window.fin);
    if (!validWindows.length) { setSaveError('Agrega al menos una franja horaria completa.'); return; }
    if (!requerirQr && !requerirGps && !requerirFirma) { setSaveError('Selecciona al menos un método de verificación obligatorio.'); return; }
    setSaving(true);
    const saved = await onSave({
      instalacion_id: installationId,
      revistas_requeridas: Math.max(1, Math.min(100, Number(revistasRequeridas) || 1)),
      periodo_objetivo: periodoObjetivo,
      ventanas_horarias: validWindows,
      requerir_qr: requerirQr, requerir_gps: requerirGps, requerir_firma: requerirFirma,
      tolerancia_omision_min: Math.max(0, Math.min(1440, Number(tolerancia) || 0)),
      activo,
    });
    setSaving(false);
    if (saved) onClose(); else setSaveError('No se pudieron guardar los parámetros. Revisa los permisos o vuelve a intentarlo.');
  };
  return <div className="pz-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form className="pz-round-modal pz-supervision-rule-modal" role="dialog" aria-modal="true" aria-labelledby="pz-supervision-modal-title" onSubmit={event => void submit(event)}>
      <div className="pz-round-modal-head"><div><p className="pz-eyebrow">OBLIGACIÓN OPERATIVA</p><h3 id="pz-supervision-modal-title">Configurar parámetros de revista</h3><p>{installationName}</p></div><button type="button" className="pz-close-button" onClick={onClose} disabled={saving} aria-label="Cerrar">×</button></div>
      <div className="pz-round-form-grid"><label>Frecuencia requerida<input type="number" min="1" max="100" value={revistasRequeridas} onChange={event => setRevistasRequeridas(event.target.value)} required /></label><label>Periodo de cumplimiento<select value={periodoObjetivo} onChange={event => setPeriodoObjetivo(event.target.value as 'dia' | 'turno')}><option value="dia">Por día</option><option value="turno">Por turno activo</option></select></label><label>Tolerancia para alerta (minutos)<input type="number" min="0" max="1440" value={tolerancia} onChange={event => setTolerancia(event.target.value)} required /></label><label>Estado de la regla<select value={activo ? 'activo' : 'inactivo'} onChange={event => setActivo(event.target.value === 'activo')}><option value="activo">Activa</option><option value="inactivo">Inactiva</option></select></label></div>
      <fieldset className="pz-rule-windows"><legend>Franjas horarias permitidas</legend>{ventanas.map((window, index) => <div className="pz-rule-window-row" key={index}><strong>Rango {index + 1}</strong><label>Inicio<input type="time" value={window.inicio} onChange={event => updateWindow(index, 'inicio', event.target.value)} required /></label><label>Fin<input type="time" value={window.fin} onChange={event => updateWindow(index, 'fin', event.target.value)} required /></label><button type="button" className="pz-text-button" onClick={() => setVentanas(current => current.filter((_, position) => position !== index))} disabled={ventanas.length <= 1}>Quitar</button></div>)}<button type="button" className="pz-secondary pz-add-window" onClick={() => setVentanas(current => [...current, { inicio: '08:00', fin: '09:00' }])}>+ Agregar franja</button></fieldset>
      <fieldset className="pz-rule-methods"><legend>Métodos de verificación obligatorios</legend><label><input type="checkbox" checked={requerirQr} onChange={event => setRequerirQr(event.target.checked)} /><span><strong>Escaneo QR del puesto</strong><small>Lectura del código físico asociado al puesto</small></span></label><label><input type="checkbox" checked={requerirGps} onChange={event => setRequerirGps(event.target.checked)} /><span><strong>Geolocalización GPS en sitio</strong><small>Validación dentro de la geocerca configurada</small></span></label><label><input type="checkbox" checked={requerirFirma} onChange={event => setRequerirFirma(event.target.checked)} /><span><strong>Firma digital del guarda</strong><small>Requerida como evidencia de validación</small></span></label></fieldset>
      {saveError && <p className="pz-rule-error" role="alert">{saveError}</p>}
      <div className="pz-round-modal-actions"><button type="button" className="pz-secondary" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="pz-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar parámetros'}</button></div>
    </form>
  </div>;
}

function RoundConfigModal({ assets, installation, editing, onClose, onSave }: { assets: Asset[]; installation: Installation; editing: RoundConfig | null; onClose: () => void; onSave: (route: Omit<RoundConfig, 'id'>) => void }) {
  const [nombre, setNombre] = useState(editing?.nombre || '');
  const [puntos, setPuntos] = useState<string[]>(editing?.puntos || []);
  const [frecuenciaMinutos, setFrecuenciaMinutos] = useState(String(editing?.frecuenciaMinutos || 30));
  const [toleranciaMetros, setToleranciaMetros] = useState(String(editing?.toleranciaMetros || installation.geocerca_radio_m || 100));
  const [horaInicio, setHoraInicio] = useState(editing?.horaInicio || '06:00');
  const [horaFin, setHoraFin] = useState(editing?.horaFin || '18:00');
  const [activo, setActivo] = useState(editing?.activo ?? true);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({ nombre: nombre.trim(), puntos, frecuenciaMinutos: Math.max(1, Number(frecuenciaMinutos)), toleranciaMetros: Math.max(1, Number(toleranciaMetros)), horaInicio, horaFin, activo });
  };
  return <div className="pz-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="pz-round-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="pz-round-modal-title">
      <div className="pz-round-modal-head"><div><p className="pz-eyebrow">PLANIFICACIÓN OPERATIVA</p><h3 id="pz-round-modal-title">{editing ? 'Editar ruta de ronda' : 'Configurar ruta de ronda'}</h3><p>Configura el recorrido para {installation.nombre}.</p></div><button type="button" className="pz-close-button" onClick={onClose} aria-label="Cerrar">×</button></div>
      <label>Nombre de la ruta<input required value={nombre} onChange={event => setNombre(event.target.value)} placeholder="Ej. Ronda perimetral nocturna" /></label>
      <fieldset className="pz-round-points"><legend>Puntos a validar</legend>{assets.length ? assets.map(asset => <label key={asset.id}><input type="checkbox" checked={puntos.includes(asset.id)} onChange={event => setPuntos(current => event.target.checked ? [...current, asset.id] : current.filter(id => id !== asset.id))} /><span><strong>{asset.nombre_activo}</strong><small>{asset.ubicacion_detalle || asset.codigo_activo || 'Punto de control'}</small></span></label>) : <p className="pz-muted">Primero registra puntos de control QR/NFC para asignarlos a una ruta.</p>}</fieldset>
      <div className="pz-round-form-grid"><label>Frecuencia (minutos)<input type="number" min="1" required value={frecuenciaMinutos} onChange={event => setFrecuenciaMinutos(event.target.value)} /></label><label>Tolerancia GPS (metros)<input type="number" min="1" required value={toleranciaMetros} onChange={event => setToleranciaMetros(event.target.value)} /></label><label>Hora de inicio<input type="time" required value={horaInicio} onChange={event => setHoraInicio(event.target.value)} /></label><label>Hora de fin<input type="time" required value={horaFin} onChange={event => setHoraFin(event.target.value)} /></label></div>
      <label className="pz-round-toggle"><input type="checkbox" checked={activo} onChange={event => setActivo(event.target.checked)} /> Ruta activa</label>
      <div className="pz-round-modal-actions"><button type="button" className="pz-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="pz-primary">Guardar ruta</button></div>
    </form>
  </div>;
}

function bogotaDateKey(value: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
function clockMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
function timeIsInWindow(current: string, start: string, end: string) {
  const now = clockMinutes(current), from = clockMinutes(start), to = clockMinutes(end);
  return from <= to ? now >= from && now < to : now >= from || now < to;
}
function windowExceededTolerance(current: string, start: string, end: string, tolerance: number) {
  const now = clockMinutes(current), from = clockMinutes(start), to = clockMinutes(end);
  const rawDeadline = to + tolerance;
  const deadline = rawDeadline % 1440;
  if (from > to) {
    if (now >= from) return false;
    return now >= deadline;
  }
  if (rawDeadline < 1440) return now >= rawDeadline;
  return false;
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
