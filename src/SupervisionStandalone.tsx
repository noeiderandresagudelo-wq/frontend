import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SupervisionModule from './SupervisionModule';
import SupervisorMobile from './SupervisorMobile';
import type { UserRole } from './api';
import './supervision-standalone.css';

function SupervisionStandalone() {
  const [state, setState] = useState<{token:string;tenantId:string;role:UserRole}|null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let authSubscription: { unsubscribe: () => void } | null = null;

    (async () => {
      const waitForLegacySupabase = async (): Promise<any> => {
        // En APK/WebView el script legacy puede tardar más en crear el cliente.
        for (let attempt = 0; attempt < 160; attempt += 1) {
          const client = (window as Window & { supabaseClient?: any }).supabaseClient;
          if (client?.auth?.getSession) return client;
          await new Promise(resolve => window.setTimeout(resolve, 100));
        }
        return null;
      };

      const legacyClient = await waitForLegacySupabase();
      if (!legacyClient) {
        if (!cancelled) {
          setLoading(false);
          setError('No se encontró la conexión de Supabase de la sesión actual.');
        }
        return;
      }

      const applySession = async (session: any) => {
        if (cancelled) return;

        if (!session) {
          // Importante para la APK: el módulo puede montarse antes de que el
          // usuario termine de iniciar sesión. No debemos dejar el error fijo.
          setState(null);
          setError('');
          setLoading(true);
          return;
        }

        // La identidad operativa se resuelve en PostgreSQL, no desde metadata
        // editable/caducada del cliente. Esto mantiene tenant y rol alineados con
        // el perfil real de Alarvix.
        let context: any = null;
        let contextError: any = null;
        try {
          const result = await legacyClient.rpc('supervision_context');
          context = Array.isArray(result.data) ? result.data[0] : result.data;
          contextError = result.error;
        } catch (e) {
          contextError = e;
        }

        // El contexto de PostgreSQL es la fuente principal. Si el perfil
        // histórico de usuarios no está enlazado todavía con auth.users, usamos
        // exclusivamente los claims del JWT ya validado por Supabase como fallback.
        const claims = (() => {
          try {
            const part = String(session.access_token || '').split('.')[1];
            if (!part) return null;
            return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
              app_metadata?: { role?: string; rol?: string; tenant_id?: string };
              user_metadata?: { role?: string; rol?: string; tenant_id?: string };
            };
          } catch {
            return null;
          }
        })();

        const fallbackRole =
          context?.role ||
          claims?.app_metadata?.role ||
          claims?.app_metadata?.rol ||
          claims?.user_metadata?.role ||
          claims?.user_metadata?.rol ||
          '';
        const fallbackTenant =
          context?.tenant_id ||
          claims?.app_metadata?.tenant_id ||
          claims?.user_metadata?.tenant_id ||
          '';

        if (!fallbackTenant || !fallbackRole) {
          if (!cancelled) {
            setLoading(false);
            setError(contextError?.message || 'La sesión no contiene tenant y rol válidos para Supervisión.');
          }
          return;
        }

        const allowed: UserRole[] = ['admin','manager','supervisor','technician','client','viewer'];
        const normalizedRole = String(fallbackRole).toLowerCase();
        const role = allowed.includes(normalizedRole as UserRole)
          ? normalizedRole as UserRole
          : 'viewer';
        const tenantId = String(fallbackTenant).trim();        if (!cancelled) {
          setError('');
          setLoading(false);
          setState({token:session.access_token,tenantId,role});
        }
      };

      // Primero intentamos recuperar la sesión ya persistida.
      try {
        const { data, error: sessionError } = await legacyClient.auth.getSession();
        if (sessionError) {
          if (!cancelled) {
            setLoading(false);
            setError(sessionError.message);
          }
        } else {
          await applySession(data.session);
        }
      } catch (e) {
        if (!cancelled) {
          setLoading(false);
          setError(e instanceof Error ? e.message : 'No fue posible recuperar la sesión.');
        }
      }

      // Y, sobre todo, quedamos escuchando el login/logout.
      // Esto corrige el caso de la APK donde React se monta antes del login.
      const { data: listener } = legacyClient.auth.onAuthStateChange((event: string, session: any) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          window.setTimeout(() => { void applySession(session); }, 0);
        } else if (event === 'SIGNED_OUT') {
          void applySession(null);
        }
      });
      authSubscription = listener.subscription;
    })();

    return () => {
      cancelled = true;
      authSubscription?.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="supervision-standalone-loading">Cargando módulo de Supervisión…</div>;
  }

  if (error) {
    return <div className="supervision-standalone-error"><strong>No se pudo cargar Supervisión</strong><span>{error}</span></div>;
  }

  if (!state) {
    return <div className="supervision-standalone-loading">Esperando inicio de sesión…</div>;
  }

  // El supervisor es un perfil de campo/móvil. No debe entrar al ERP de escritorio,
  // independientemente del ancho de pantalla.
  if (state.role === 'supervisor') {
    return <SupervisorMobile {...state} />;
  }

  return <SupervisionModule {...state} />;
}

const mount = document.getElementById('supervision-react-mount');
if (mount) {
  createRoot(mount).render(
    <StrictMode>
      <SupervisionStandalone />
    </StrictMode>
  );
}
