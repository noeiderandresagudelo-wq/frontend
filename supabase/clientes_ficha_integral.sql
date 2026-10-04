-- Alarvix: ampliar ficha de clientes/puestos para edición integral
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS telefono_supervisor text,
  ADD COLUMN IF NOT EXISTS modelo_panel text,
  ADD COLUMN IF NOT EXISTS tipo_comunicador text,
  ADD COLUMN IF NOT EXISTS zonas_configuradas text,
  ADD COLUMN IF NOT EXISTS contactos_emergencia jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS datos_facturacion jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clientes.contactos_emergencia IS 'Lista JSON de contactos de emergencia/reacción del puesto.';
COMMENT ON COLUMN public.clientes.datos_facturacion IS 'Datos de facturación y observaciones comerciales del cliente/puesto.';