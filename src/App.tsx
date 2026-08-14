import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import {
  ApiError,
  createApiClient,
  type Customer,
  type CustomerInput,
  type EntityStatus,
  type Service,
  type ServiceCategory,
  type ServiceInput,
  type UserRole,
  type WorkOrder,
  type WorkOrderInput,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from './api';

type Page = 'dashboard' | 'operations' | 'customers' | 'services' | 'reports';
type FormTarget = 'work-order' | 'customer' | 'service' | null;

type AuthContext = {
  role: UserRole;
  tenantId: string;
  branchId: string;
};

type CustomerDraft = {
  code: string;
  legal_name: string;
  contact_name: string;
  email: string;
  phone: string;
  status: EntityStatus;
};

type ServiceDraft = {
  service_code: string;
  client_site_id: string;
  name: string;
  category: ServiceCategory;
  status: EntityStatus;
  price: string;
  start_date: string;
  end_date: string;
};

type WorkOrderDraft = {
  customer_id: string;
  title: string;
  description: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
};

const TOKEN_KEY = 'alarvix.dev-access-token';
// Development always uses Vite's same-origin proxy; production may override it with VITE_API_URL.
const api = createApiClient(
  import.meta.env.DEV ? window.location.origin : import.meta.env.VITE_API_URL || window.location.origin,
);

const statusLabels: Record<EntityStatus, string> = {
  draft: 'Borrador',
  active: 'Activo',
  paused: 'Pausado',
  archived: 'Archivado',
};

const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const priorityLabels: Record<WorkOrderPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

const categoryLabels: Record<ServiceCategory, string> = {
  guardia: 'Guardia',
  vigilancia: 'Vigilancia',
  monitoreo: 'Monitoreo',
  mantenimiento: 'Mantenimiento',
  otros: 'Otros',
};

const emptyCustomerDraft: CustomerDraft = {
  code: '',
  legal_name: '',
  contact_name: '',
  email: '',
  phone: '',
  status: 'active',
};

const emptyServiceDraft: ServiceDraft = {
  service_code: '',
  client_site_id: '',
  name: '',
  category: 'guardia',
  status: 'active',
  price: '0',
  start_date: '',
  end_date: '',
};

const emptyOrderDraft: WorkOrderDraft = {
  customer_id: '',
  title: '',
  description: '',
  priority: 'medium',
  status: 'pending',
};

function decodeToken(token: string): AuthContext {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('El access token no tiene formato JWT.');
  }

  try {
    const payload = JSON.parse(
      decodeURIComponent(
        atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((character) => `%${(`00${character.charCodeAt(0).toString(16)}`).slice(-2)}`)
          .join(''),
      ),
    ) as { app_metadata?: { role?: string; tenant_id?: string; branch_id?: string } };
    const metadata = payload.app_metadata;
    const role = metadata?.role as UserRole | undefined;

    if (!metadata?.tenant_id || !metadata.branch_id || !role) {
      throw new Error('El token debe incluir tenant_id, branch_id y role en app_metadata.');
    }

    return { tenantId: metadata.tenant_id, branchId: metadata.branch_id, role };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('No se pudo leer app_metadata del access token.');
  }
}

function formatDate(value?: string): string {
  if (!value) {
    return 'Sin fecha';
  }

  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatCurrency(value?: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value ?? 0);
}

function displayError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'La sesión no es válida o expiró. Actualiza el access token.';
    }
    if (error.status === 403) {
      return 'Tu rol no tiene permisos para realizar esta acción.';
    }
    return error.message;
  }

  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}

function canManageOrders(role?: UserRole): boolean {
  return role === 'admin' || role === 'manager';
}

function canManageCatalog(role?: UserRole): boolean {
  return role === 'admin' || role === 'manager' || role === 'supervisor';
}

function canDelete(role?: UserRole): boolean {
  return role === 'admin';
}

function toCustomerDraft(customer: Customer): CustomerDraft {
  return {
    code: customer.code,
    legal_name: customer.legal_name,
    contact_name: customer.contact_name || '',
    email: customer.email || '',
    phone: customer.phone || '',
    status: customer.status,
  };
}

function toServiceDraft(service: Service): ServiceDraft {
  return {
    service_code: service.service_code,
    client_site_id: service.client_site_id,
    name: service.name,
    category: service.category,
    status: service.status,
    price: String(service.price ?? 0),
    start_date: service.start_date?.slice(0, 10) || '',
    end_date: service.end_date?.slice(0, 10) || '',
  };
}

function toOrderDraft(order: WorkOrder): WorkOrderDraft {
  return {
    customer_id: order.customer_id,
    title: order.title,
    description: order.description || '',
    priority: order.priority,
    status: order.status,
  };
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [auth, setAuth] = useState<AuthContext | null>(() => {
    const storedToken = sessionStorage.getItem(TOKEN_KEY);
    if (!storedToken) {
      return null;
    }

    try {
      return decodeToken(storedToken);
    } catch {
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
  });
  const [tokenPanelOpen, setTokenPanelOpen] = useState(!token);
  const [tokenDraft, setTokenDraft] = useState(token);
  const [rememberToken, setRememberToken] = useState(Boolean(sessionStorage.getItem(TOKEN_KEY)));
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft>(emptyCustomerDraft);
  const [serviceDraft, setServiceDraft] = useState<ServiceDraft>(emptyServiceDraft);
  const [orderDraft, setOrderDraft] = useState<WorkOrderDraft>(emptyOrderDraft);

  const refreshData = useCallback(async () => {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextCustomers, nextServices, nextOrders] = await Promise.all([
        api.listCustomers(token),
        api.listServices(token),
        api.listWorkOrders(token),
      ]);
      setCustomers(nextCustomers);
      setServices(nextServices);
      setWorkOrders(nextOrders);
    } catch (requestError) {
      setError(displayError(requestError));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );
  const activeOrders = useMemo(
    () => workOrders.filter((order) => order.status === 'pending' || order.status === 'in_progress'),
    [workOrders],
  );
  const completedOrders = useMemo(
    () => workOrders.filter((order) => order.status === 'completed').length,
    [workOrders],
  );
  const completedRate = workOrders.length ? Math.round((completedOrders / workOrders.length) * 100) : 0;
  const activeServices = useMemo(
    () => services.filter((service) => service.status === 'active').length,
    [services],
  );
  const totalServiceValue = useMemo(
    () => services.reduce((total, service) => total + Number(service.price || 0), 0),
    [services],
  );

  function resetForm(): void {
    setFormTarget(null);
    setEditingId(null);
    setCustomerDraft(emptyCustomerDraft);
    setServiceDraft(emptyServiceDraft);
    setOrderDraft(emptyOrderDraft);
  }

  function openForm(target: Exclude<FormTarget, null>, entity?: Customer | Service | WorkOrder): void {
    setError(null);
    setNotice(null);
    setFormTarget(target);
    setEditingId(entity?.id || null);

    if (target === 'customer') {
      setCustomerDraft(entity ? toCustomerDraft(entity as Customer) : emptyCustomerDraft);
    }
    if (target === 'service') {
      setServiceDraft(entity ? toServiceDraft(entity as Service) : emptyServiceDraft);
    }
    if (target === 'work-order') {
      setOrderDraft(entity ? toOrderDraft(entity as WorkOrder) : { ...emptyOrderDraft, customer_id: customers[0]?.id || '' });
    }
  }

  function saveToken(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextToken = tokenDraft.trim();

    try {
      const nextAuth = decodeToken(nextToken);
      setToken(nextToken);
      setAuth(nextAuth);
      setError(null);
      setNotice(`Conectado como ${nextAuth.role}.`);
      setTokenPanelOpen(false);
      if (rememberToken) {
        sessionStorage.setItem(TOKEN_KEY, nextToken);
      } else {
        sessionStorage.removeItem(TOKEN_KEY);
      }
    } catch (tokenError) {
      setError(displayError(tokenError));
    }
  }

  function clearToken(): void {
    setToken('');
    setTokenDraft('');
    setAuth(null);
    setCustomers([]);
    setServices([]);
    setWorkOrders([]);
    setError(null);
    setNotice('El access token se eliminó de esta sesión.');
    sessionStorage.removeItem(TOKEN_KEY);
    resetForm();
    setTokenPanelOpen(true);
  }

  async function handleCustomerSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!token) {
      return;
    }

    const input: CustomerInput = {
      legal_name: customerDraft.legal_name.trim(),
      contact_name: customerDraft.contact_name.trim() || undefined,
      email: customerDraft.email.trim() || undefined,
      phone: customerDraft.phone.trim() || undefined,
      status: customerDraft.status,
      code: customerDraft.code.trim() || undefined,
    };

    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const updated = await api.updateCustomer(token, editingId, input);
        setCustomers((current) => current.map((customer) => customer.id === updated.id ? updated : customer));
        setNotice('Cliente actualizado correctamente.');
      } else {
        const created = await api.createCustomer(token, input);
        setCustomers((current) => [created, ...current]);
        setNotice('Cliente creado correctamente.');
      }
      resetForm();
    } catch (requestError) {
      setError(displayError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function handleServiceSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!token) {
      return;
    }

    const parsedPrice = Number(serviceDraft.price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError('El precio debe ser un número igual o mayor a cero.');
      return;
    }

    const input: ServiceInput = {
      service_code: serviceDraft.service_code.trim() || undefined,
      client_site_id: serviceDraft.client_site_id.trim(),
      name: serviceDraft.name.trim(),
      category: serviceDraft.category,
      status: serviceDraft.status,
      price: parsedPrice,
      start_date: serviceDraft.start_date || undefined,
      end_date: serviceDraft.end_date || undefined,
    };

    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const updated = await api.updateService(token, editingId, input);
        setServices((current) => current.map((service) => service.id === updated.id ? updated : service));
        setNotice('Servicio actualizado correctamente.');
      } else {
        const created = await api.createService(token, input);
        setServices((current) => [created, ...current]);
        setNotice('Servicio creado correctamente.');
      }
      resetForm();
    } catch (requestError) {
      setError(displayError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function handleOrderSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!token) {
      return;
    }

    const input: WorkOrderInput = {
      customer_id: orderDraft.customer_id,
      title: orderDraft.title.trim(),
      description: orderDraft.description.trim() || undefined,
      priority: orderDraft.priority,
      ...(editingId ? { status: orderDraft.status } : {}),
    };

    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const updated = await api.updateWorkOrder(token, editingId, input);
        setWorkOrders((current) => current.map((order) => order.id === updated.id ? updated : order));
        setNotice('Orden actualizada correctamente.');
      } else {
        const created = await api.createWorkOrder(token, input);
        setWorkOrders((current) => [created, ...current]);
        setNotice('Orden creada correctamente.');
      }
      resetForm();
    } catch (requestError) {
      setError(displayError(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntity(target: Exclude<FormTarget, null>, id: string): Promise<void> {
    if (!token || !window.confirm('Esta acción no se puede deshacer. ¿Deseas continuar?')) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (target === 'customer') {
        await api.deleteCustomer(token, id);
        setCustomers((current) => current.filter((customer) => customer.id !== id));
        setNotice('Cliente eliminado correctamente.');
      }
      if (target === 'service') {
        await api.deleteService(token, id);
        setServices((current) => current.filter((service) => service.id !== id));
        setNotice('Servicio eliminado correctamente.');
      }
      if (target === 'work-order') {
        await api.deleteWorkOrder(token, id);
        setWorkOrders((current) => current.filter((order) => order.id !== id));
        setNotice('Orden eliminada correctamente.');
      }
    } catch (requestError) {
      setError(displayError(requestError));
    } finally {
      setSaving(false);
    }
  }

  function renderEmpty(message: string): ReactElement {
    return <div className="empty-state">{message}</div>;
  }

  function renderOrders(limit?: number): ReactElement {
    const visibleOrders = limit ? workOrders.slice(0, limit) : workOrders;
    if (!visibleOrders.length) {
      return renderEmpty('No hay órdenes de trabajo para este tenant.');
    }

    return (
      <div className="order-list">
        {visibleOrders.map((order) => (
          <article key={order.id} className="order-item">
            <div className="order-meta">
              <span className="code">{order.code}</span>
              <span className={`status status-${order.status}`}>{workOrderStatusLabels[order.status]}</span>
            </div>
            <div className="order-title-row">
              <strong>{order.title}</strong>
              <span className={`priority priority-${order.priority}`}>{priorityLabels[order.priority]}</span>
            </div>
            <div className="order-details">
              <span>{customerById.get(order.customer_id)?.legal_name || 'Cliente no disponible'}</span>
              <span>{formatDate(order.created_at)}</span>
              {order.description && <span>{order.description}</span>}
            </div>
            {(canManageOrders(auth?.role) || canDelete(auth?.role)) && (
              <div className="item-actions">
                {canManageOrders(auth?.role) && <button className="text-button" onClick={() => openForm('work-order', order)}>Editar</button>}
                {canDelete(auth?.role) && <button className="text-button danger" onClick={() => void deleteEntity('work-order', order.id)}>Eliminar</button>}
              </div>
            )}
          </article>
        ))}
      </div>
    );
  }

  function renderCustomers(): ReactElement {
    if (!customers.length) {
      return renderEmpty('No hay clientes registrados para este tenant.');
    }

    return (
      <div className="data-list">
        {customers.map((customer) => (
          <article key={customer.id} className="data-item">
            <div>
              <span className="code">{customer.code}</span>
              <h3>{customer.legal_name}</h3>
              <p>{customer.contact_name || 'Sin contacto'} · {customer.email || 'Sin correo'} · {customer.phone || 'Sin teléfono'}</p>
            </div>
            <div className="data-item-side">
              <span className={`status status-${customer.status}`}>{statusLabels[customer.status]}</span>
              {(canManageCatalog(auth?.role) || canDelete(auth?.role)) && (
                <div className="item-actions">
                  {canManageCatalog(auth?.role) && <button className="text-button" onClick={() => openForm('customer', customer)}>Editar</button>}
                  {canDelete(auth?.role) && <button className="text-button danger" onClick={() => void deleteEntity('customer', customer.id)}>Eliminar</button>}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderServices(): ReactElement {
    if (!services.length) {
      return renderEmpty('No hay servicios registrados para este tenant.');
    }

    return (
      <div className="data-list">
        {services.map((service) => (
          <article key={service.id} className="data-item">
            <div>
              <span className="code">{service.service_code}</span>
              <h3>{service.name}</h3>
              <p>{categoryLabels[service.category]} · Sede {service.client_site_id} · {formatCurrency(service.price)}</p>
            </div>
            <div className="data-item-side">
              <span className={`status status-${service.status}`}>{statusLabels[service.status]}</span>
              {(canManageCatalog(auth?.role) || canDelete(auth?.role)) && (
                <div className="item-actions">
                  {canManageCatalog(auth?.role) && <button className="text-button" onClick={() => openForm('service', service)}>Editar</button>}
                  {canDelete(auth?.role) && <button className="text-button danger" onClick={() => void deleteEntity('service', service.id)}>Eliminar</button>}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderForm(): ReactElement | null {
    if (!formTarget) {
      return null;
    }

    const title = editingId ? 'Editar' : 'Crear';
    if (formTarget === 'customer') {
      return (
        <section className="panel form-card">
          <div className="panel-header">
            <div><p className="eyebrow">Catálogo</p><h3>{title} cliente</h3></div>
            <button className="ghost-button compact" onClick={resetForm}>Cerrar</button>
          </div>
          <form className="form-panel" onSubmit={(event) => void handleCustomerSubmit(event)}>
            <div className="field-row">
              <label>Código<input value={customerDraft.code} onChange={(event) => setCustomerDraft((current) => ({ ...current, code: event.target.value }))} placeholder="Se genera automáticamente" /></label>
              <label>Estado<select value={customerDraft.status} onChange={(event) => setCustomerDraft((current) => ({ ...current, status: event.target.value as EntityStatus }))}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <label>Razón social<input required minLength={2} value={customerDraft.legal_name} onChange={(event) => setCustomerDraft((current) => ({ ...current, legal_name: event.target.value }))} /></label>
            <div className="field-row">
              <label>Contacto<input value={customerDraft.contact_name} onChange={(event) => setCustomerDraft((current) => ({ ...current, contact_name: event.target.value }))} /></label>
              <label>Teléfono<input value={customerDraft.phone} onChange={(event) => setCustomerDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
            </div>
            <label>Correo<input type="email" value={customerDraft.email} onChange={(event) => setCustomerDraft((current) => ({ ...current, email: event.target.value }))} /></label>
            <button disabled={saving} type="submit" className="primary-button form-submit">{saving ? 'Guardando…' : 'Guardar cliente'}</button>
          </form>
        </section>
      );
    }

    if (formTarget === 'service') {
      return (
        <section className="panel form-card">
          <div className="panel-header">
            <div><p className="eyebrow">Catálogo</p><h3>{title} servicio</h3></div>
            <button className="ghost-button compact" onClick={resetForm}>Cerrar</button>
          </div>
          <form className="form-panel" onSubmit={(event) => void handleServiceSubmit(event)}>
            <div className="field-row">
              <label>Código<input value={serviceDraft.service_code} onChange={(event) => setServiceDraft((current) => ({ ...current, service_code: event.target.value }))} placeholder="Se genera automáticamente" /></label>
              <label>ID de sede<input required value={serviceDraft.client_site_id} onChange={(event) => setServiceDraft((current) => ({ ...current, client_site_id: event.target.value }))} placeholder="UUID de client_site" /></label>
            </div>
            <label>Nombre<input required minLength={2} value={serviceDraft.name} onChange={(event) => setServiceDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            <div className="field-row">
              <label>Categoría<select value={serviceDraft.category} onChange={(event) => setServiceDraft((current) => ({ ...current, category: event.target.value as ServiceCategory }))}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Estado<select value={serviceDraft.status} onChange={(event) => setServiceDraft((current) => ({ ...current, status: event.target.value as EntityStatus }))}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <div className="field-row">
              <label>Precio<input required min="0" step="0.01" type="number" value={serviceDraft.price} onChange={(event) => setServiceDraft((current) => ({ ...current, price: event.target.value }))} /></label>
              <label>Inicio<input type="date" value={serviceDraft.start_date} onChange={(event) => setServiceDraft((current) => ({ ...current, start_date: event.target.value }))} /></label>
            </div>
            <label>Fin<input type="date" value={serviceDraft.end_date} onChange={(event) => setServiceDraft((current) => ({ ...current, end_date: event.target.value }))} /></label>
            <button disabled={saving} type="submit" className="primary-button form-submit">{saving ? 'Guardando…' : 'Guardar servicio'}</button>
          </form>
        </section>
      );
    }

    return (
      <section className="panel form-card">
        <div className="panel-header">
          <div><p className="eyebrow">Operaciones</p><h3>{title} orden</h3></div>
          <button className="ghost-button compact" onClick={resetForm}>Cerrar</button>
        </div>
        <form className="form-panel" onSubmit={(event) => void handleOrderSubmit(event)}>
          <label>Cliente<select required value={orderDraft.customer_id} onChange={(event) => setOrderDraft((current) => ({ ...current, customer_id: event.target.value }))}><option value="" disabled>Selecciona un cliente</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.legal_name}</option>)}</select></label>
          <label>Título<input required minLength={3} value={orderDraft.title} onChange={(event) => setOrderDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Ej. Revisión de red" /></label>
          <label>Descripción<textarea value={orderDraft.description} onChange={(event) => setOrderDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Contexto y alcance de la orden" /></label>
          <div className="field-row">
            <label>Prioridad<select value={orderDraft.priority} onChange={(event) => setOrderDraft((current) => ({ ...current, priority: event.target.value as WorkOrderPriority }))}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {editingId && <label>Estado<select value={orderDraft.status} onChange={(event) => setOrderDraft((current) => ({ ...current, status: event.target.value as WorkOrderStatus }))}>{Object.entries(workOrderStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
          </div>
          <button disabled={saving || !customers.length} type="submit" className="primary-button form-submit">{saving ? 'Guardando…' : 'Guardar orden'}</button>
        </form>
      </section>
    );
  }

  function renderPage(): ReactElement {
    if (page === 'customers') {
      return <section className="panel"><div className="panel-header"><div><p className="eyebrow">Relaciones</p><h3>Clientes</h3></div><span>{customers.length} registrados</span></div>{renderCustomers()}</section>;
    }
    if (page === 'services') {
      return <section className="panel"><div className="panel-header"><div><p className="eyebrow">Catálogo</p><h3>Servicios</h3></div><span>{services.length} registrados</span></div>{renderServices()}</section>;
    }
    if (page === 'operations') {
      return <section className="panel"><div className="panel-header"><div><p className="eyebrow">Operación</p><h3>Órdenes de trabajo</h3></div><span>{activeOrders.length} abiertas</span></div>{renderOrders()}</section>;
    }
    if (page === 'reports') {
      return (
        <section className="report-grid">
          <article className="panel"><div className="panel-header"><h3>Distribución de órdenes</h3><span>Datos reales</span></div><ul className="summary-list">{Object.entries(workOrderStatusLabels).map(([status, label]) => <li key={status}><span>{label}</span><strong>{workOrders.filter((order) => order.status === status).length}</strong></li>)}</ul></article>
          <article className="panel"><div className="panel-header"><h3>Estado del catálogo</h3><span>Datos reales</span></div><ul className="summary-list"><li><span>Clientes activos</span><strong>{customers.filter((customer) => customer.status === 'active').length}</strong></li><li><span>Servicios activos</span><strong>{activeServices}</strong></li><li><span>Valor mensual registrado</span><strong>{formatCurrency(totalServiceValue)}</strong></li></ul></article>
        </section>
      );
    }

    return (
      <>
        <section className="stats-grid">
          <article className="stat-card"><span>Órdenes activas</span><strong>{activeOrders.length}</strong><em>pendientes o en curso</em></article>
          <article className="stat-card"><span>Clientes registrados</span><strong>{customers.length}</strong><em>en este tenant</em></article>
          <article className="stat-card"><span>Servicios activos</span><strong>{activeServices}</strong><em>catálogo operativo</em></article>
          <article className="stat-card"><span>Órdenes completadas</span><strong>{completedRate}%</strong><em>{completedOrders} finalizadas</em></article>
        </section>
        <section className="content-grid">
          <div className="panel large-panel"><div className="panel-header"><div><p className="eyebrow">Actividad</p><h3>Órdenes recientes</h3></div><button className="text-button" onClick={() => setPage('operations')}>Ver todas</button></div>{renderOrders(5)}</div>
          <div className="panel company-panel"><div className="panel-header"><div><p className="eyebrow">Resumen</p><h3>Operación actual</h3></div><span>En vivo</span></div><ul className="summary-list"><li><span>Prioridad urgente</span><strong>{workOrders.filter((order) => order.priority === 'urgent' && order.status !== 'completed').length}</strong></li><li><span>Servicios pausados</span><strong>{services.filter((service) => service.status === 'paused').length}</strong></li><li><span>Clientes activos</span><strong>{customers.filter((customer) => customer.status === 'active').length}</strong></li><li><span>Valor de servicios</span><strong>{formatCurrency(totalServiceValue)}</strong></li></ul></div>
        </section>
      </>
    );
  }

  const pageTitles: Record<Page, string> = {
    dashboard: 'Gestión operativa de la empresa',
    operations: 'Órdenes de trabajo',
    customers: 'Clientes',
    services: 'Servicios',
    reports: 'Informes operativos',
  };

  const createAction = page === 'operations'
    ? { label: '+ Nueva orden', target: 'work-order' as const, enabled: canManageOrders(auth?.role) }
    : page === 'customers'
      ? { label: '+ Nuevo cliente', target: 'customer' as const, enabled: canManageCatalog(auth?.role) }
      : page === 'services'
        ? { label: '+ Nuevo servicio', target: 'service' as const, enabled: canManageCatalog(auth?.role) }
        : null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block"><div className="brand-mark">A</div><div><p className="eyebrow">ERP enterprise</p><h1>ALARVIX</h1></div></div>
        <nav className="nav" aria-label="Navegación principal">
          {([['dashboard', 'Dashboard'], ['operations', 'Operaciones'], ['customers', 'Clientes'], ['services', 'Servicios'], ['reports', 'Informes']] as const).map(([value, label]) => (
            <button key={value} className={`nav-item ${page === value ? 'active' : ''}`} onClick={() => { setPage(value); resetForm(); }}>{label}</button>
          ))}
        </nav>
        <div className={`mini-card ${auth ? '' : 'warning'}`}><span className={`dot ${auth ? 'green' : 'yellow'}`} /><div><strong>{auth ? `Rol: ${auth.role}` : 'Sin conexión'}</strong><small>{auth ? 'Token de sesión activo' : 'Configura el access token'}</small></div></div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div><p className="eyebrow">{auth ? `Tenant ${auth.tenantId.slice(0, 8)} · Sucursal ${auth.branchId.slice(0, 8)}` : 'Conexión requerida'}</p><h2>{pageTitles[page]}</h2></div>
          <div className="topbar-actions">
            <button className="ghost-button" onClick={() => setTokenPanelOpen((current) => !current)}>Token API</button>
            <button className="ghost-button" disabled={!token || loading} onClick={() => void refreshData()}>{loading ? 'Actualizando…' : 'Actualizar'}</button>
            {createAction && createAction.enabled && <button className="primary-button" disabled={!token} onClick={() => openForm(createAction.target)}>{createAction.label}</button>}
          </div>
        </header>

        {tokenPanelOpen && (
          <section className="panel token-panel">
            <div className="panel-header"><div><p className="eyebrow">Desarrollo</p><h3>Conexión con API</h3></div>{token && <button className="ghost-button compact" onClick={() => setTokenPanelOpen(false)}>Cerrar</button>}</div>
            <p className="helper-text">Usa un access token de Supabase con <code>tenant_id</code>, <code>branch_id</code> y <code>role</code> en <code>app_metadata</code>. Nunca se usa <code>user_metadata</code>.</p>
            <form className="token-form" onSubmit={saveToken}>
              <label>Access token<textarea required value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} placeholder="eyJhbGciOi..." autoComplete="off" spellCheck="false" /></label>
              <label className="checkbox-label"><input type="checkbox" checked={rememberToken} onChange={(event) => setRememberToken(event.target.checked)} /> Conservar solo durante esta sesión del navegador</label>
              <div className="topbar-actions"><button type="submit" className="primary-button">Conectar</button>{token && <button type="button" className="ghost-button" onClick={clearToken}>Eliminar token</button>}</div>
            </form>
          </section>
        )}

        {error && <div className="feedback error-feedback" role="alert"><span>{error}</span>{token && <button className="text-button" onClick={() => void refreshData()}>Reintentar</button>}</div>}
        {notice && <div className="feedback success-feedback" role="status">{notice}</div>}
        {!token ? <section className="panel disconnected-state"><h3>Conecta tu sesión para cargar datos reales</h3><p>La aplicación no muestra datos de demostración. Configura el token de desarrollo para consultar el tenant autorizado.</p></section> : loading ? <section className="panel loading-state">Cargando clientes, servicios y órdenes de trabajo…</section> : <>{renderForm()}{renderPage()}</>}
      </main>
    </div>
  );
}
