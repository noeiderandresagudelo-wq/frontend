# Alarvix ERP Frontend

Aplicación React para administrar clientes, servicios y órdenes de trabajo del tenant autenticado. El dashboard y los informes derivan sus métricas de la API: no se incluyen datos de demostración.

## Configuración

Crea un archivo `.env.local` en esta carpeta:

```dotenv
# Desarrollo local: el navegador consume el proxy same-origin de Vite.
VITE_API_PROXY_TARGET=http://127.0.0.1:3000

# Producción o API en otro origen (opcional):
# VITE_API_URL=https://api.example.com
```

En desarrollo, no definas `VITE_API_URL`: Vite reenvía `/api/*` a `VITE_API_PROXY_TARGET`, evitando los bloqueos CORS y el error `Failed to fetch`. Reinicia `npm run dev` después de cambiar `.env.local`.

En producción, si el backend comparte el origen mediante un reverse proxy, tampoco definas `VITE_API_URL`. Si está en otro origen, define `VITE_API_URL` con el origen del backend, sin `/api/v1` al final, y configura CORS en el backend. La aplicación consume:

- `GET | POST | PUT | DELETE /api/v1/clients` (mostrado como **Clientes** en la interfaz)
- `GET | POST | PUT | DELETE /api/v1/services`
- `GET | POST | PUT | DELETE /api/v1/work-orders`

El backend debe permitir el origen del frontend mediante CORS.

## Access token de desarrollo

Al iniciar, abre **Token API** e ingresa un access token de Supabase. `admin` y `123` no son credenciales válidas para este flujo: el backend no dispone de un endpoint de autenticación por usuario/contraseña y solo acepta un JWT Bearer emitido por Supabase. Se verifica localmente que el JWT tenga estos claims exclusivamente dentro de `app_metadata`:

```json
{
  "tenant_id": "uuid-del-tenant",
  "branch_id": "uuid-de-la-sucursal",
  "role": "admin | manager | supervisor | technician | client | viewer"
}
```

El token viaja en `Authorization: Bearer <token>`. Por defecto queda solo en memoria; la casilla de la interfaz permite conservarlo en `sessionStorage` hasta que se cierre la sesión del navegador. Nunca se guarda en `localStorage`, archivos `.env` ni repositorio. Los roles limitan las acciones visibles y la API es la autoridad final para autorizar cada operación.

Permisos representados en la interfaz:

| Recurso | Crear/editar | Eliminar |
| --- | --- | --- |
| Órdenes | `admin`, `manager` | `admin` |
| Clientes | `admin`, `manager`, `supervisor` | `admin` |
| Servicios | `admin`, `manager`, `supervisor` | `admin` |

Al crear un servicio se solicita el `client_site_id` porque es una relación obligatoria del modelo de datos.

## Ejecución

```bash
npm install
npm run dev
```

## Validación y build

```bash
npm run lint
npm run build
```
