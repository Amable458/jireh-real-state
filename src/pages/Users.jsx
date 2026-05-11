import { useEffect, useState } from 'react';
import { Plus, Edit2, Lock, Unlock, ShieldAlert } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';
import { useAuth } from '../store/auth.js';
import { db, logActivity } from '../db/database.js';
import { sha256 } from '../utils/crypto.js';
import { fmtDateTime } from '../utils/format.js';

const ROLES = ['SuperAdmin', 'Admin', 'Operativo'];
const empty = () => ({ username: '', fullName: '', role: 'Operativo', password: '' });

export default function Users() {
  const { user, hasRole } = useAuth();
  const isSuper = hasRole('SuperAdmin');
  const [rows, setRows] = useState([]);
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [editId, setEditId] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, kind: '', id: null });
  const [err, setErr] = useState('');

  const load = async () => {
    setRows(await db.users.toArray());
    const all = await db.activityLog.orderBy('ts').reverse().limit(50).toArray();
    setLogs(all);
  };
  useEffect(() => { load(); }, []);

  const onAdd = () => { setEditId(null); setForm(empty()); setErr(''); setOpen(true); };
  const onEdit = (u) => {
    setEditId(u.id);
    setForm({ username: u.username, fullName: u.fullName || '', role: u.role, password: '' });
    setErr(''); setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.username.trim()) return setErr('Usuario requerido');
    if (!editId && form.password.length < 6) return setErr('La contraseña debe tener al menos 6 caracteres');

    if (editId) {
      const target = await db.users.get(editId);
      if (target.role === 'SuperAdmin' && form.role !== 'SuperAdmin' && !isSuper) {
        return setErr('Solo SuperAdmin puede modificar otros SuperAdmin');
      }
      const patch = { username: form.username, fullName: form.fullName, role: form.role };
      if (form.password) patch.passHash = await sha256(form.password);
      await db.users.update(editId, patch);
      await logActivity(user.sub, user.username, 'user.update', `id=${editId}`);
    } else {
      const exists = await db.users.where('username').equalsIgnoreCase(form.username.trim()).first();
      if (exists) return setErr('Usuario ya existe');
      const id = await db.users.add({
        username: form.username.trim(), fullName: form.fullName,
        role: form.role, passHash: await sha256(form.password),
        blocked: 0, createdAt: new Date().toISOString()
      });
      await logActivity(user.sub, user.username, 'user.create', `id=${id} role=${form.role}`);
    }
    setOpen(false); load();
  };

  const toggleBlock = async (u) => {
    if (u.role === 'SuperAdmin' && !isSuper) return;
    if (u.id === user.sub) return;
    await db.users.update(u.id, { blocked: u.blocked ? 0 : 1 });
    await logActivity(user.sub, user.username, u.blocked ? 'user.unblock' : 'user.block', `id=${u.id}`);
    load();
  };

  const columns = [
    { key: 'username', label: 'Usuario', render: (u) => <span className="font-mono text-sm">{u.username}</span> },
    { key: 'fullName', label: 'Nombre' },
    { key: 'role', label: 'Rol', render: (u) => {
      const c = u.role === 'SuperAdmin' ? 'badge-danger' : u.role === 'Admin' ? 'badge-info' : 'badge-slate';
      return <span className={c}>{u.role}</span>;
    }},
    { key: 'blocked', label: 'Estado', render: (u) => u.blocked ? <span className="badge-danger">Bloqueado</span> : <span className="badge-success">Activo</span> },
    { key: 'createdAt', label: 'Creado', render: (u) => fmtDateTime(u.createdAt) },
    { key: 'actions', label: '', sortable: false, render: (u) => {
      const cantTouch = (u.role === 'SuperAdmin' && !isSuper) || u.id === user.sub;
      return (
        <div className="flex gap-1 justify-end">
          <button onClick={() => onEdit(u)} disabled={cantTouch} className="btn-ghost p-1.5 disabled:opacity-30"><Edit2 size={14} /></button>
          <button onClick={() => setConfirm({ open: true, kind: 'block', id: u.id })} disabled={cantTouch} className={`btn-ghost p-1.5 disabled:opacity-30 ${u.blocked ? 'text-emerald-600' : 'text-red-600'}`}>
            {u.blocked ? <Unlock size={14} /> : <Lock size={14} />}
          </button>
        </div>
      );
    }}
  ];

  return (
    <div>
      <PageHeader
        title="Usuarios"
        subtitle="Gestión de cuentas y bitácora de actividad"
        actions={<>
          <HelpButton content={HELP.users} />
          <button className="btn-primary" onClick={onAdd}><Plus size={16} /> Nuevo usuario</button>
        </>}
      />

      <div className="card card-body mb-5">
        <DataTable columns={columns} rows={rows} />
      </div>

      <div className="card card-body">
        <h3 className="font-semibold text-ink-700 mb-3 flex items-center gap-2"><ShieldAlert size={18} /> Bitácora de actividad reciente</h3>
        <div className="table-wrap max-h-96 overflow-y-auto">
          <table className="table">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-ink-400 py-6">Sin registros</td></tr>
              ) : logs.map((l) => (
                <tr key={l.id}>
                  <td className="text-xs whitespace-nowrap">{fmtDateTime(l.ts)}</td>
                  <td className="font-mono text-xs">{l.username}</td>
                  <td><span className="badge-info">{l.action}</span></td>
                  <td className="text-xs text-ink-500">{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editId ? 'Editar usuario' : 'Nuevo usuario'}
        footer={<>
          <button className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
          <button className="btn-primary" onClick={save}>Guardar</button>
        </>}
      >
        <form onSubmit={save} className="space-y-4">
          <div><label className="label">Usuario</label><input className="input" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div><label className="label">Nombre completo</label><input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
          <div>
            <label className="label">Rol</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.filter((r) => r !== 'SuperAdmin' || isSuper).map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{editId ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editId ? 'Dejar en blanco para no cambiar' : 'mínimo 6 caracteres'} />
          </div>
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
        </form>
      </Modal>

      <ConfirmModal
        open={confirm.open}
        onClose={() => setConfirm({ open: false, kind: '', id: null })}
        onConfirm={async () => {
          const u = await db.users.get(confirm.id);
          if (u) await toggleBlock(u);
        }}
        title="Cambiar estado"
        message="¿Confirma cambiar el estado (activo/bloqueado) de este usuario?"
      />
    </div>
  );
}
