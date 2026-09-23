# Alarvix ERP Frontend

Frontend React/Vite de Alarvix. La aplicación consulta Supabase directamente desde el navegador mediante @supabase/supabase-js y las políticas RLS del proyecto.

## Configuración

En Vercel configura:

    VITE_SUPABASE_URL
    VITE_SUPABASE_ANON_KEY

Usa únicamente la clave pública/publishable de Supabase en el frontend. Nunca expongas una service_role o una clave sb_secret_.

## Autenticación

La versión actual permite conectar un access token de Supabase desde la pantalla de sesión. El JWT debe contener en app_metadata:

    {
      "tenant_id": "uuid-del-tenant",
      "role": "admin | manager | supervisor | technician | client | viewer"
    }

Las operaciones se ejecutan directamente contra las tablas de Supabase y quedan protegidas por RLS.

## Mapa

El dashboard utiliza un mapa embebido de OpenStreetMap. No se usa Google Maps, Mapbox ni una API key de mapas.

## Desarrollo

    npm install
    npm run dev

## Validación

    npm run lint
    npm run build

Vercel usa Node 22 o superior según el campo engines de package.json.
