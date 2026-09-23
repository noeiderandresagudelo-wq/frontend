import { supabase } from './lib/supabase';

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
  constructor(message: string, public readonly status = 0) { super(message); this.name = 'ApiError'; }
}
function applyToken(token: string) {
  supabase.realtime.setAuth(token);
  return token;
}
async function run<T>(query: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new ApiError(error.message, 400);
  return (data ?? []) as T;
}
export function createApiClient() {
  return {
    listCustomers: (token: string) => run<Customer[]>(supabase.from('clientes').select('*').order('created_at', { ascending: false }).then(applyToken)),
    createCustomer: (token: string, input: Partial<Customer> & { tenant_id: string }) => { applyToken(token); return run<Customer>(supabase.from('clientes').insert(input).select().single()); },
    updateCustomer: (token: string, id: string, input: Partial<Customer>) => { applyToken(token); return run<Customer>(supabase.from('clientes').update(input).eq('id', id).select().single()); },
    deleteCustomer: (token: string, id: string) => { applyToken(token); return run<Customer>(supabase.from('clientes').delete().eq('id', id).select().single()); },
    listServices: (token: string) => { applyToken(token); return run<Service[]>(supabase.from('servicios').select('*').order('created_at', { ascending: false })); },
    createService: (token: string, input: Partial<Service> & { tenant_id: string }) => { applyToken(token); return run<Service>(supabase.from('servicios').insert(input).select().single()); },
    updateService: (token: string, consecutivo: string, input: Partial<Service>) => { applyToken(token); return run<Service>(supabase.from('servicios').update(input).eq('consecutivo', consecutivo).select().single()); },
    deleteService: (token: string, consecutivo: string) => { applyToken(token); return run<Service>(supabase.from('servicios').delete().eq('consecutivo', consecutivo).select().single()); },
  };
}
