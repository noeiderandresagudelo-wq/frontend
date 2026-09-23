export type EntityStatus = 'draft' | 'active' | 'paused' | 'archived';
export type WorkOrderStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ServiceCategory = 'guardia' | 'vigilancia' | 'monitoreo' | 'mantenimiento' | 'otros';
export type UserRole = 'admin' | 'manager' | 'supervisor' | 'technician' | 'client' | 'viewer';

export interface Customer {
  id: string;
  tenant_id: string;
  code: string;
  legal_name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  status: EntityStatus;
  created_at?: string;
  updated_at?: string;
}

export interface Service {
  id: string;
  tenant_id: string;
  client_site_id: string;
  service_code: string;
  name: string;
  category: ServiceCategory;
  status: EntityStatus;
  price?: number;
  start_date?: string;
  end_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface WorkOrder {
  id: string;
  tenant_id: string;
  branch_id: string;
  customer_id: string;
  code: string;
  title: string;
  description?: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  assigned_to?: string;
  created_at?: string;
  updated_at?: string;
}

export type CustomerInput = Pick<Customer, 'legal_name' | 'contact_name' | 'email' | 'phone' | 'status'> & {
  code?: string;
};

export type ServiceInput = Pick<
  Service,
  'client_site_id' | 'name' | 'category' | 'status' | 'price' | 'start_date' | 'end_date'
> & {
  service_code?: string;
};

export type WorkOrderInput = Pick<
  WorkOrder,
  'customer_id' | 'title' | 'description' | 'priority'
> & {
  status?: WorkOrderStatus;
};

interface ApiEnvelope<T> {
  data: T;
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  } | string;
  message?: string;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function extractError(payload: ApiErrorEnvelope | null, fallback: string): { message: string; code?: string } {
  if (typeof payload?.error === 'string') {
    return { message: payload.error };
  }

  if (payload?.error && typeof payload.error === 'object') {
    return {
      message: payload.error.message || fallback,
      code: payload.error.code,
    };
  }

  return { message: payload?.message || fallback };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export function createApiClient(baseUrl: string) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
    if (!normalizedBaseUrl) {
      throw new ApiError('Configura VITE_API_URL antes de conectar la API.', 0, 'API_URL_MISSING');
    }

    let response: Response;
    try {
      response = await fetch(`${normalizedBaseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...init?.headers,
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? ` ${error.message}` : '';
      throw new ApiError(`No fue posible conectar con la API.${detail}`, 0, 'NETWORK_ERROR');
    }

    const hasJsonBody = response.headers.get('content-type')?.includes('application/json');
    const payload = hasJsonBody ? (await response.json()) as ApiEnvelope<T> & ApiErrorEnvelope : null;

    if (!response.ok) {
      const error = extractError(payload, `La solicitud falló (${response.status}).`);
      throw new ApiError(error.message, response.status, error.code);
    }

    return (payload as ApiEnvelope<T>).data;
  }

  return {
    listCustomers: (token: string) => request<Customer[]>('/api/v1/clients', token),
    createCustomer: (token: string, input: CustomerInput) =>
      request<Customer>('/api/v1/clients', token, { method: 'POST', body: JSON.stringify(input) }),
    updateCustomer: (token: string, id: string, input: Partial<CustomerInput>) =>
      request<Customer>(`/api/v1/clients/${id}`, token, { method: 'PATCH', body: JSON.stringify(input) }),
    deleteCustomer: (token: string, id: string) =>
      request<void>(`/api/v1/clients/${id}`, token, { method: 'DELETE' }),
    listServices: (token: string) => request<Service[]>('/api/v1/services', token),
    createService: (token: string, input: ServiceInput) =>
      request<Service>('/api/v1/services', token, { method: 'POST', body: JSON.stringify(input) }),
    updateService: (token: string, id: string, input: Partial<ServiceInput>) =>
      request<Service>(`/api/v1/services/${id}`, token, { method: 'PATCH', body: JSON.stringify(input) }),
    deleteService: (token: string, id: string) =>
      request<void>(`/api/v1/services/${id}`, token, { method: 'DELETE' }),
    listWorkOrders: (token: string) => request<WorkOrder[]>('/api/v1/work-orders', token),
    createWorkOrder: (token: string, input: WorkOrderInput) =>
      request<WorkOrder>('/api/v1/work-orders', token, { method: 'POST', body: JSON.stringify(input) }),
    updateWorkOrder: (token: string, id: string, input: Partial<WorkOrderInput>) =>
      request<WorkOrder>(`/api/v1/work-orders/${id}`, token, { method: 'PATCH', body: JSON.stringify(input) }),
    deleteWorkOrder: (token: string, id: string) =>
      request<void>(`/api/v1/work-orders/${id}`, token, { method: 'DELETE' }),
  };
}
