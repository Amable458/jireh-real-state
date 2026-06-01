import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './router/ProtectedRoute.jsx';
import { useAuth } from './store/auth.js';
import { useSettings } from './store/settings.js';

// Login no se hace lazy (es la pantalla más común antes de autenticar)
import Login from './pages/Login.jsx';

// Code splitting: cada ruta protegida se descarga bajo demanda
const Dashboard    = lazy(() => import('./pages/Dashboard.jsx'));
const Rentals      = lazy(() => import('./pages/Rentals.jsx'));
const Sales        = lazy(() => import('./pages/Sales.jsx'));
const Expenses     = lazy(() => import('./pages/Expenses.jsx'));
const Distribution = lazy(() => import('./pages/Distribution.jsx'));
const Bonuses      = lazy(() => import('./pages/Bonuses.jsx'));
const Properties   = lazy(() => import('./pages/Properties.jsx'));
const Reports      = lazy(() => import('./pages/Reports.jsx'));
const Users        = lazy(() => import('./pages/Users.jsx'));
const Backup       = lazy(() => import('./pages/Backup.jsx'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center h-full p-12">
      <div className="text-ink-400 text-sm">Cargando...</div>
    </div>
  );
}

function HydrateGate({ children }) {
  const { ready, hydrate } = useAuth();
  const loadSettings = useSettings((s) => s.load);
  useEffect(() => { hydrate(); loadSettings(); /* eslint-disable-line */ }, []);
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <div className="text-ink-400 text-sm">Validando sesión...</div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <HydrateGate>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
          <Route path="/ingresos" element={<Suspense fallback={<PageFallback />}><Rentals /></Suspense>} />
          <Route path="/ventas" element={<Suspense fallback={<PageFallback />}><Sales /></Suspense>} />
          <Route path="/gastos" element={<Suspense fallback={<PageFallback />}><Expenses /></Suspense>} />
          <Route path="/bonificaciones" element={<Suspense fallback={<PageFallback />}><Bonuses /></Suspense>} />
          <Route path="/propiedades" element={<Suspense fallback={<PageFallback />}><Properties /></Suspense>} />

          <Route path="/distribucion" element={
            <ProtectedRoute roles={['SuperAdmin', 'Admin']}>
              <Suspense fallback={<PageFallback />}><Distribution /></Suspense>
            </ProtectedRoute>
          } />
          <Route path="/reportes" element={
            <Suspense fallback={<PageFallback />}><Reports /></Suspense>
          } />
          <Route path="/usuarios" element={
            <ProtectedRoute roles={['SuperAdmin', 'Admin']}>
              <Suspense fallback={<PageFallback />}><Users /></Suspense>
            </ProtectedRoute>
          } />
          <Route path="/respaldo" element={
            <ProtectedRoute roles={['SuperAdmin']}>
              <Suspense fallback={<PageFallback />}><Backup /></Suspense>
            </ProtectedRoute>
          } />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </HydrateGate>
  );
}
