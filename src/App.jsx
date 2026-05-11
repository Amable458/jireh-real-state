import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './router/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Rentals from './pages/Rentals.jsx';
import Sales from './pages/Sales.jsx';
import Expenses from './pages/Expenses.jsx';
import Distribution from './pages/Distribution.jsx';
import Bonuses from './pages/Bonuses.jsx';
import Properties from './pages/Properties.jsx';
import Reports from './pages/Reports.jsx';
import Users from './pages/Users.jsx';
import Backup from './pages/Backup.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/ingresos" element={<Rentals />} />
        <Route path="/ventas" element={<Sales />} />
        <Route path="/gastos" element={<Expenses />} />
        <Route path="/bonificaciones" element={<Bonuses />} />
        <Route path="/propiedades" element={<Properties />} />

        <Route path="/distribucion" element={
          <ProtectedRoute roles={['SuperAdmin', 'Admin']}><Distribution /></ProtectedRoute>
        } />
        <Route path="/reportes" element={
          <ProtectedRoute roles={['SuperAdmin', 'Admin']}><Reports /></ProtectedRoute>
        } />
        <Route path="/usuarios" element={
          <ProtectedRoute roles={['SuperAdmin', 'Admin']}><Users /></ProtectedRoute>
        } />
        <Route path="/respaldo" element={
          <ProtectedRoute roles={['SuperAdmin']}><Backup /></ProtectedRoute>
        } />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
