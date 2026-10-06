import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SupervisionModule from './SupervisionModule';
import type { UserRole } from './api';
import { supabase } from './lib/supabase';
import './supervision-standalone.css';

function SupervisionStandalone() {
  const [state, setState] = useState<{token:string;tenantId:string;role:UserRole}|null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        if (!cancelled) setError(sessionError.message);
        return;
      }
      const session = data.session;
      if (!session) {
        if (!cancelled) setError('No hay una sesión de Supabase activa.');
        return;
      }
      const metadata = session.user.app_metadata || {};
      const rawRole = String(metadata.role || session.user.user_metadata?.role || '').trim().toLowerCase();
      const tenantId = String(metadata.tenant_id || session.user.user_metadata?.tenant_id || '').trim();
      const allowed: UserRole[] = ['admin','manager','supervisor','technician','client','viewer'];
      const role = allowed.includes(rawRole as UserRole) ? rawRole as UserRole : 'viewer';
      if (!tenantId) {
        if (!cancelled) setError('La sesión no tiene tenant_id en app_metadata.');
        return;
      }
      if (!cancelled) setState({token:session.access_token,tenantId,role});
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return <div className="supervision-standalone-error"><strong>No se pudo cargar Supervisión</strong><span>{error}</span></div>;
  }
  if (!state) {
    return <div className="supervision-standalone-loading">Cargando módulo de Supervisión…</div>;
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
