import { createClient } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'manager' | 'supervisor' | 'technician' | 'client' | 'viewer';

export interface Customer {
  id: string;
  tenant_id: string;
  nombre: string;
  puesto?: string | null;
  cliente_nombre?: string | null;
  ciudad?: string | null;
  direccion?: string | null;
  departamento?: string | null;
  sector?: string | null;
  ans_time?: string | null;
  ubicacion?: string | null;
  zona_id?: string | null;
  supervisor_reaccion?: string | null;
  incomunicada: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Service {
  consecutivo: string;
  tenant_id: string;
  abonado_id?: string | null;
  tipo: string;
  prioridad: string;
  estado: string;
  tecnico_id?: string | null;
  fecha_creacion: string;
  descripcion?: string | null;
  timeline: unknown;
  insumos_usados: unknown;
  informe_tecnico?: string | null;
  evidencia_dano?: string | null;
  firma_cliente?: string | null;
  es_instalacion: boolean;
  instalacion_info?: unknown;
  origen_solicitud?: string | null;
  created_at?: string;
  updated_at?: string;
}

export class ApiError extends Error {
  constructor(message: string, public readonly status = 0) {
    super(message);
    this.name = 'ApiError';
  }
}

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Vercel.');
}

function client(token: string) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function run<T>(token: string, operation: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await operation;
  if (error) throw new ApiError(error.message, 400);
  return (data ?? []) as T;
}

export function createApiClient() {
  return {
    listCustomers: (token: string) =>
      run<Customer[]>(token, client(token).from('clientes').select('*').order('created_at', { ascending: false })),

    createCustomer: (token: string, input: Partial<Customer> & { tenant_id: string }) =>
      run<Customer>(token, client(token).from('clientes').insert(input).select().single()),

    updateCustomer: (token: string, id: string, input: Partial<Customer>) =>
      run<Customer>(token, client(token).from('clientes').update(input).eq('id', id).select().single()),

    deleteCustomer: (token: string, id: string) =>
      run<Customer>(token, client(token).from('clientes').delete().eq('id', id).select().single()),

    listServices: (token: string) =>
      run<Service[]>(token, client(token).from('servicios').select('*').order('created_at', { ascending: false })),

    createService: (token: string, input: Partial<Service> & { tenant_id: string }) =>
      run<Service>(token, client(token).from('servicios').insert(input).select().single()),

    updateService: (token: string, consecutivo: string, input: Partial<Service>) =>
      run<Service>(token, client(token).from('servicios').update(input).eq('consecutivo', consecutivo).select().single()),

    deleteService: (token: string, consecutivo: string) =>
      run<Service>(token, client(token).from('servicios').delete().eq('consecutivo', consecutivo).select().single()),
  };
}
