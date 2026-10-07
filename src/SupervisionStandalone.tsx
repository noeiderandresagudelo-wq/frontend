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

        const legacyUser = (window as Window & { currentUser?: any }).currentUser;
        const metadata = session.user?.app_metadata || {};
        const userMetadata = session.user?.user_metadata || {};
        const rawRole = String(
          metadata.role ||
          userMetadata.role ||
          metadata.rol ||
          userMetadata.rol ||
          legacyUser?.rol ||
          ''
        ).trim().toLowerCase();

        const tenantId = String(
          metadata.tenant_id ||
          userMetadata.tenant_id ||
          metadata.tenantId ||
          userMetadata.tenantId ||
          legacyUser?.tenant_id ||
          legacyUser?.tenantId ||
          ''
        ).trim();

        const allowed: UserRole[] = ['admin','manager','supervisor','technician','client','viewer'];
        const role = allowed.includes(rawRole as UserRole) ? rawRole as UserRole : 'viewer';

        if (!tenantId) {
          if (!cancelled) {
            setLoading(false);
            setError('La sesión no tiene tenant_id en app_metadata.');
          }
          return;
        }

        if (!cancelled) {
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
