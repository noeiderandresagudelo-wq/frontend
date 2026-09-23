import { createAuthedSupabaseClient } from './lib/supabase';

type TechnicianLocation = {
  tenant_id: string; tecnico_id: string; latitude: number; longitude: number; accuracy_m?: number | null; last_seen: string;
};

export type UserRole = 'admin' | 'manager' | 'supervisor' | 'technician' | 'client' | 'viewer';

export interface Customer {
  id: string; tenant_id: string; nombre: string; puesto?: string | null; cliente_nombre?: string | null;
  ciudad?: string | null; direccion?: string | null; departamento?: string | null; sector?: string | null;
  ans_time?: string | null; ubicacion?: string | null; zona_id?: string | null;
  supervisor_reaccion?: string | null; incomunicada: boolean; created_at?: string; updated_at?: string;
}
export interface Service {
  consecutivo: string; tenant_id: string; abonado_id?: string | null; tipo: string; prioridad: string;
  estado: string; tecnico_id?: string | null; fecha_creacion: string; descripcion?: string | null;
  timeline: unknown; insumos_usados: unknown; informe_tecnico?: string | null; evidencia_dano?: string | null;
  firma_cliente?: string | null; es_instalacion: boolean; instalacion_info?: unknown;
  origen_solicitud?: string | null; created_at?: string; updated_at?: string;
}
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: string;
  readonly hint?: string;

  constructor(message: string, status = 0, code?: string, details?: string, hint?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.hint = hint;
  }
}
async function run<T>(query: PromiseLike<{ data: T | null; error: { message: string; code?: string; details?: string; hint?: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) {
    const extra = [error.code && `código ${error.code}`, error.details, error.hint].filter(Boolean).join(' · ');
    throw new ApiError(extra ? `${error.message} (${extra})` : error.message, 400, error.code, error.details, error.hint);
  }
  return (data ?? []) as T;
}
export function createApiClient() {
  return {
    listCustomers: (token: string) => {
      const client = createAuthedSupabaseClient(token);
      return run<Customer[]>(client.from('clientes').select('*').order('created_at', { ascending: false }));
    },
    createCustomer: (token: string, input: Partial<Customer> & { tenant_id: string }) => {
      const client = createAuthedSupabaseClient(token);
      return run<Customer>(client.from('clientes').insert(input).select().single());
    },
    updateCustomer: (token: string, id: string, input: Partial<Customer>) => {
      const client = createAuthedSupabaseClient(token);
      return run<Customer>(client.from('clientes').update(input).eq('id', id).select().single());
    },
    deleteCustomer: (token: string, id: string) => {
      const client = createAuthedSupabaseClient(token);
      return run<Customer>(client.from('clientes').delete().eq('id', id).select().single());
    },
      listTechnicianLocations: (token: string) => {
      const client = createAuthedSupabaseClient(token);
      return run<TechnicianLocation[]>(client.from('tecnicos_ubicaciones').select('*').order('last_seen', { ascending: false }));
    },
    upsertTechnicianLocation: (token: string, input: {
      tenant_id: string; tecnico_id: string; latitude: number; longitude: number; accuracy_m?: number | null;
    }) => {
      const client = createAuthedSupabaseClient(token);
      return run<TechnicianLocation>(client.from('tecnicos_ubicaciones').upsert({
        ...input,
        last_seen: new Date().toISOString(),
      }, { onConflict: 'tenant_id,tecnico_id' }).select().single());
    },
    listServices: (token: string) => {
      const client = createAuthedSupabaseClient(token);
      return run<Service[]>(client.from('servicios').select('*').order('created_at', { ascending: false }));
    },
    createService: (token: string, input: Partial<Service> & { tenant_id: string }) => {
      const client = createAuthedSupabaseClient(token);
      return run<Service>(client.from('servicios').insert(input).select().single());
    },
    updateService: (token: string, consecutivo: string, input: Partial<Service>) => {
      const client = createAuthedSupabaseClient(token);
      return run<Service>(client.from('servicios').update(input).eq('consecutivo', consecutivo).select().single());
    },
    deleteService: (token: string, consecutivo: string) => {
      const client = createAuthedSupabaseClient(token);
      return run<Service>(client.from('servicios').delete().eq('consecutivo', consecutivo).select().single());
    },
  };
}
