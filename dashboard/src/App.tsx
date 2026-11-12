import { useState, useEffect, useCallback, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazyWithRetry as lazy } from './utils/lazyWithRetry';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { useRole } from './hooks/useRole';
import { RoleProvider } from './components/RoleProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { API_BASE_URL } from './services/api';
import { clearActorState, isUserRole, resolveStartupValidation } from './utils/authLifecycle';
import { getStoredApiKey, clearStoredAuth } from './utils/authStorage';
import './App.css';

const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Sessions = lazy(() => import('./pages/Sessions').then(m => ({ default: m.Sessions })));
const Chats = lazy(() => import('./pages/Chats').then(m => ({ default: m.Chats })));
const Webhooks = lazy(() => import('./pages/Webhooks').then(m => ({ default: m.Webhooks })));
const Templates = lazy(() => import('./pages/Templates').then(m => ({ default: m.Templates })));
const Logs = lazy(() => import('./pages/Logs').then(m => ({ default: m.Logs })));
const ApiKeys = lazy(() => import('./pages/ApiKeys').then(m => ({ default: m.ApiKeys })));
const MessageTester = lazy(() => import('./pages/MessageTester').then(m => ({ default: m.MessageTester })));
const Infrastructure = lazy(() => import('./pages/Infrastructure').then(m => ({ default: m.Infrastructure })));
const Plugins = lazy(() => import('./pages/Plugins'));
const BulkGroups = lazy(() => import('./pages/BulkGroups').then(m => ({ default: m.BulkGroups })));
const BulkGroupMembers = lazy(() => import('./pages/BulkGroupMembers').then(m => ({ default: m.BulkGroupMembers })));
const AiSupport = lazy(() => import('./pages/AiSupport').then(m => ({ default: m.AiSupport })));
const PanelUsers = lazy(() => import('./pages/PanelUsers').then(m => ({ default: m.PanelUsers })));
const BulkCampaign = lazy(() => import('./pages/BulkCampaign').then(m => ({ default: m.BulkCampaign })));
const Credits = lazy(() => import('./pages/Credits').then(m => ({ default: m.Credits })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function AppContent() {
  // Capture the key ONCE at mount. Read live per render, the null→key transition when
  // handleLogin stores a fresh key would re-fire the startup re-validation effect below and
  // double the /auth/validate request on every sign-in — the effect is for genuine page
  // refreshes with a saved key only.
  const [savedKey] = useState(getStoredApiKey);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const { setRole, role } = useRole();

  const handleLogin = (validatedRole?: string) => {
    // The login page's validate response already carried the role, so no second /auth/validate
    // round-trip is needed here. An absent or unrecognized role falls back to viewer, the
    // least-privileged default.
    setRole(isUserRole(validatedRole) ? validatedRole : 'viewer');

    setIsAuthenticated(true);
    setAuthChecked(true);
  };

  const handleLogout = useCallback(() => {
    void fetch(`${API_BASE_URL}/panel/auth/logout`, { method: 'POST', credentials: 'include' });
    setIsAuthenticated(false);
    setRole(null);
    clearStoredAuth();
    // Wipe the React Query cache too: it is keyed by resource, not actor, so without a full
    // clear a logout → login in the same tab with a different key/scope shows the previous
    // actor's sessions/messages/apiKeys/audit rows.
    clearActorState(queryClient);
  }, [setRole]);

  // Re-validate and refresh the role on mount if already authenticated
  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE_URL}/auth/validate`, {
      method: 'POST',
      credentials: 'include',
      headers: savedKey ? { 'X-API-Key': savedKey } : {},
      signal: AbortSignal.timeout(30000),
    })
      .then(async res => {
        const decision = resolveStartupValidation(res.status, await res.json().catch(() => null));
        if (cancelled || (savedKey && getStoredApiKey() !== savedKey)) return;
        if (decision.action === 'logout') {
          setIsAuthenticated(false);
        } else if (decision.action === 'role') {
          setRole(decision.role);
          setIsAuthenticated(true);
        }
      })
      .catch(() => {
        // Network failure (API unreachable): keep the cached role so a transient outage at
        // page load doesn't eject the user — an explicit 401/403 above still logs out.
      })
      .finally(() => { if (!cancelled) setAuthChecked(true); });
    return () => { cancelled = true; };
  }, [savedKey, setRole, handleLogout]);

  // A login change in another tab must also clear this tab's actor-scoped data.
  useEffect(() => {
    const syncAuth = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === 'openwa_api_key' || event.key === null)) {
        sessionStorage.removeItem('openwa_api_key');
        clearActorState(queryClient);
        window.location.reload();
      }
    };
    window.addEventListener('storage', syncAuth);
    return () => window.removeEventListener('storage', syncAuth);
  }, []);

  const loadingFallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Loader2 className="animate-spin" size={32} />
    </div>
  );

  if (!authChecked) return loadingFallback;
  if (!isAuthenticated) {
    return (
      <Suspense fallback={loadingFallback}>
        <Login onLogin={handleLogin} />
      </Suspense>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={loadingFallback}>
          <Routes>
            <Route path="/" element={<Layout onLogout={handleLogout} userRole={role} />}>
              <Route index element={<Dashboard />} />
              <Route path="sessions" element={<Sessions />} />
              <Route path="chats" element={<Chats />} />
              <Route path="webhooks" element={<Webhooks />} />
              <Route path="templates" element={<Templates />} />
              {role === 'admin' && <Route path="api-keys" element={<ApiKeys />} />}
              {role === 'admin' && <Route path="panel-users" element={<PanelUsers />} />}
              <Route path="credits" element={<Credits admin={role === 'admin'} />} />
              <Route path="logs" element={<Logs />} />
              <Route path="message-tester" element={<MessageTester />} />
              {role === 'admin' && <Route path="infrastructure" element={<Infrastructure />} />}
              {role === 'admin' && <Route path="plugins" element={<Plugins />} />}
              {role === 'admin' && <Route path="ai-support" element={<AiSupport />} />}
              <Route path="bulk-campaign" element={<BulkCampaign />} />
              <Route path="bulk-groups" element={<BulkGroups />} />
              <Route path="bulk-group-members" element={<BulkGroupMembers />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RoleProvider>
          <AppContent />
        </RoleProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
