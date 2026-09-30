-- Alarvix: trazabilidad completa de cotizaciones
-- Ejecutar una sola vez en Supabase SQL Editor.
-- Agrega metadatos sin eliminar ni modificar las columnas actuales.

ALTER TABLE public.cotizaciones
    ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fecha_actualizacion TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cotizador_id UUID,
    ADD COLUMN IF NOT EXISTS cotizador_nombre TEXT,
    ADD COLUMN IF NOT EXISTS tecnico_id TEXT,
    ADD COLUMN IF NOT EXISTS tecnico_nombre TEXT,
    ADD COLUMN IF NOT EXISTS fecha_visita_tecnica TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS diagnostico_tecnico TEXT,
    ADD COLUMN IF NOT EXISTS informe_tecnico JSONB,
    ADD COLUMN IF NOT EXISTS insumos_sugeridos JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS trazabilidad JSONB,
    ADD COLUMN IF NOT EXISTS origen TEXT;

CREATE INDEX IF NOT EXISTS idx_cotizaciones_servicio_id
    ON public.cotizaciones (servicio_id);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_tecnico_id
    ON public.cotizaciones (tecnico_id);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_fecha_creacion
    ON public.cotizaciones (fecha_creacion DESC);

-- Completa automáticamente la fecha de las cotizaciones antiguas
-- que no tengan fecha, usando el momento de migración como referencia.
UPDATE public.cotizaciones
SET fecha_creacion = COALESCE(fecha_creacion, NOW())
WHERE fecha_creacion IS NULL;

UPDATE public.cotizaciones
SET fecha_actualizacion = COALESCE(fecha_actualizacion, fecha_creacion, NOW())
WHERE fecha_actualizacion IS NULL;
