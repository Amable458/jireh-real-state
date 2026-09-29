import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Building2, Users, UserCheck, Power, Settings, UserCog, ClipboardCheck, ChevronDown } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';
import { useAuth } from '../store/auth.js';
import { db, logActivity, rpcListUsers } from '../db/database.js';
import { useRealtimeTable } from '../hooks/useRealtimeTable.js';
import { useSettings } from '../store/settings.js';
import { fmtMoney, fmtDate, todayISO } from '../utils/format.js';
import { fmtCur, recCurrency } from '../utils/currency.js';
import { deleteTenantCharges, tenantBillingBlocker } from '../utils/tenantCharges.js';
import CurrencyFields from '../components/CurrencyFields.jsx';

const propEmpty = () => ({ name: '', type: 'Apartamento', address: '', owner: '', rent: '', sale: '', status: 'disponible', notes: '' });
const tenantEmpty = () => ({
  name: '', phone: '', email: '', identification: '', propertyId: '',
  contractStart: todayISO(), contractEnd: '', monthlyRent: '', notes: '',
  currency: 'DOP', exchangeRate: '', commissionPercent: '', collectionDay: 1,
  managerId: ''
});
const agentEmpty = () => ({ name: '', phone: '', email: '', commission: '', notes: '', active: 1 });

export default function Properties() {
  const { user, token, hasRole } = useAuth();
  const canConfig = hasRole('SuperAdmin', 'Admin');
  // Borrar: solo Admin/SuperAdmin (la BD lo exige también; para Operativo fallaría en silencio)
  const canDelete = hasRole('SuperAdmin', 'Admin');
  const { usdToDop, adminBonusPerTenant, setAdminBonusPerTenant } = useSettings();
  const [tab, setTab] = useState('properties');
  const [properties, setProperties] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [agents, setAgents] = useState([]);
  const [staff, setStaff] = useState([]); // usuarios del sistema, para asignar administrador

  const [pOpen, setPOpen] = useState(false);
  const [pForm, setPForm] = useState(propEmpty());
  const [pEdit, setPEdit] = useState(null);

  const [tOpen, setTOpen] = useState(false);
  const [tForm, setTForm] = useState(tenantEmpty());
  const [tEdit, setTEdit] = useState(null);

  const [aOpen, setAOpen] = useState(false);
  const [aForm, setAForm] = useState(agentEmpty());
  const [aEdit, setAEdit] = useState(null);

  const [confirm, setConfirm] = useState({ open: false, kind: '', id: null });
  const [tErr, setTErr] = useState('');
  const [tSaving, setTSaving] = useState(false);

  const [bonusModal, setBonusModal] = useState(false);
  const [bonusInput, setBonusInput] = useState('');
  const [bonusErr, setBonusErr] = useState('');

  // Las tres tablas en paralelo (antes, una tras otra).
  const refresh = async () => {
    const [p, t, a] = await Promise.all([
      db.properties.toArray(),
      db.tenants.toArray(),
      db.agents.toArray()
    ]);
    setProperties(p); setTenants(t); setAgents(a);
  };
  // La lista de colaboradores casi nunca cambia: solo al abrir el módulo.
  const load = async () => {
    await Promise.all([
      refresh(),
      rpcListUsers(token).then(setStaff).catch(() => { /* sesión aún cargando */ })
    ]);
  };
  useEffect(() => { load(); /* eslint-disable-line */ }, []);
  useRealtimeTable(['properties', 'tenants', 'agents'], () => refresh());

  const saveProp = async (e) => {
    e.preventDefault();
    const payload = {
      name: pForm.name, type: pForm.type, address: pForm.address,
      owner: pForm.owner || '',
      rent: Number(pForm.rent) || 0, sale: Number(pForm.sale) || 0,
      status: pForm.status, notes: pForm.notes
    };
    if (pEdit) {
      await db.properties.update(pEdit, payload);
      await logActivity(user.sub, user.username, 'property.update', `id=${pEdit}`);
    } else {
      const id = await db.properties.add({ ...payload, createdAt: new Date().toISOString() });
      await logActivity(user.sub, user.username, 'property.create', `id=${id}`);
    }
    setPOpen(false); load();
  };

  const saveTenant = async (e) => {
    e.preventDefault();
    // Validación de fechas: el fin de contrato debe ser posterior al inicio
    if (tForm.contractStart && tForm.contractEnd && tForm.contractEnd <= tForm.contractStart) {
      setTErr('La fecha de fin de contrato debe ser posterior a la de inicio.');
      return;
    }
    const property = properties.find((p) => p.id === Number(tForm.propertyId));
    const manager = staff.find((s) => s.id === Number(tForm.managerId));
    const currency = tForm.currency === 'USD' ? 'USD' : 'DOP';
    const exchangeRate = currency === 'USD' ? (Number(tForm.exchangeRate) || usdToDop) : null;
    const payload = {
      name: tForm.name, phone: tForm.phone, email: tForm.email,
      identification: tForm.identification,
      propertyId: tForm.propertyId ? Number(tForm.propertyId) : null,
      propertyName: property?.name || '',
      contractStart: tForm.contractStart || null,
      contractEnd: tForm.contractEnd || null,
      monthlyRent: Number(tForm.monthlyRent) || 0,
      currency, exchangeRate,
      commissionPercent: tForm.commissionPercent === '' || tForm.commissionPercent == null ? null : Math.min(100, Math.max(0, Number(tForm.commissionPercent) || 0)),
      collectionDay: Math.min(31, Math.max(1, Number(tForm.collectionDay) || 1)),
      managerId: tForm.managerId ? Number(tForm.managerId) : null,
      managerName: manager?.fullName || manager?.username || '',
      notes: tForm.notes
    };
    setTErr(''); setTSaving(true);
    try {
      if (tEdit) {
        await db.tenants.update(tEdit, payload);
        await logActivity(user.sub, user.username, 'tenant.update', `id=${tEdit}`);
      } else {
        const id = await db.tenants.add({ ...payload, createdAt: new Date().toISOString() });
        await logActivity(user.sub, user.username, 'tenant.create', `id=${id}`);
      }
      setTOpen(false);
      await load();
    } catch (ex) {
      const msg = ex?.message || 'Error al guardar';
      const hint = /column|currency|commissionPercent|collectionDay|exchangeRate|schema cache/i.test(msg)
        ? ' — Ejecute la migración supabase/migration_tenants.sql en el SQL Editor de Supabase.'
        : '';
      setTErr(msg + hint);
    } finally {
      setTSaving(false);
    }
  };

  const saveAgent = async (e) => {
    e.preventDefault();
    const payload = {
      name: aForm.name,
      phone: aForm.phone || '',
      email: aForm.email || '',
      commission: Number(aForm.commission) || 0,
      notes: aForm.notes || '',
      active: aForm.active ? 1 : 0
    };
    if (aEdit) {
      await db.agents.update(aEdit, payload);
      await logActivity(user.sub, user.username, 'agent.update', `id=${aEdit}`);
    } else {
      const id = await db.agents.add({ ...payload, createdAt: new Date().toISOString() });
      await logActivity(user.sub, user.username, 'agent.create', `id=${id}`);
    }
    setAOpen(false); load();
  };

  const toggleAgentActive = async (a) => {
    await db.agents.update(a.id, { active: a.active ? 0 : 1 });
    await logActivity(user.sub, user.username, a.active ? 'agent.deactivate' : 'agent.activate', `id=${a.id}`);
    load();
  };

  const remove = async () => {
    if (confirm.kind === 'property') {
      await db.properties.delete(confirm.id);
      await logActivity(user.sub, user.username, 'property.delete', `id=${confirm.id}`);
    }
    if (confirm.kind === 'tenant') {
      // Borra en cascada las rentas pendientes y pagos a propietario generados
      await deleteTenantCharges(confirm.id);
      await db.tenants.delete(confirm.id);
      await logActivity(user.sub, user.username, 'tenant.delete', `id=${confirm.id}`);
    }
    if (confirm.kind === 'agent') {
      await db.agents.delete(confirm.id);
      await logActivity(user.sub, user.username, 'agent.delete', `id=${confirm.id}`);
    }
    load();
  };

  const today = new Date();
  const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  const propCols = [
    { key: 'name', label: 'Nombre' },
    { key: 'type', label: 'Tipo' },
    { key: 'address', label: 'Dirección' },
    { key: 'owner', label: 'Propietario', render: (r) => r.owner || '—' },
    { key: 'rent', label: 'Renta', render: (r) => fmtMoney(r.rent) },
    { key: 'sale', label: 'Venta', render: (r) => fmtMoney(r.sale) },
    { key: 'status', label: 'Estado', render: (r) => <span className="badge-info">{r.status}</span> },
    { key: 'actions', label: '', sortable: false, render: (r) => (
      <div className="flex gap-1 justify-end">
        <button className="btn-ghost p-1.5" onClick={() => editProperty(r)}><Edit2 size={14} /></button>
        {canDelete && (
          <button className="btn-ghost p-1.5 text-red-600" onClick={() => setConfirm({ open: true, kind: 'property', id: r.id })}><Trash2 size={14} /></button>
        )}
      </div>
    )}
  ];

  // Abrir editores (los usan las tablas y el panel de calidad de datos)
  const editTenant = (r) => {
    setTEdit(r.id);
    setTErr('');
    setTForm({
      ...tenantEmpty(), ...r,
      monthlyRent: r.monthlyRent ?? '',
      currency: r.currency || 'DOP',
      exchangeRate: r.exchangeRate ?? '',
      commissionPercent: r.commissionPercent ?? '',
      collectionDay: r.collectionDay ?? 1,
      contractEnd: r.contractEnd || '',
      managerId: r.managerId ?? ''
    });
    setTOpen(true);
  };
  const editProperty = (r) => {
    setPEdit(r.id);
    setPForm({ ...propEmpty(), ...r, rent: r.rent ?? '', sale: r.sale ?? '', owner: r.owner ?? '' });
    setPOpen(true);
  };

  // ---------- Calidad de datos ----------
  // Todo lo que impide que el sistema trabaje solo, en un único lugar.
  const now = new Date();
  const quality = [
    ...tenants.map((t) => {
      const issues = [];
      const blocker = tenantBillingBlocker(t, now.getFullYear(), now.getMonth() + 1);
      if (blocker) issues.push({ level: 'error', text: `No genera renta: ${blocker}` });
      if (t.contractStart && t.contractEnd && t.contractEnd <= t.contractStart) {
        issues.push({ level: 'error', text: 'Fechas de contrato inválidas (fin ≤ inicio)' });
      }
      if (!t.propertyId) issues.push({ level: 'warning', text: 'Sin propiedad vinculada' });
      return { kind: 'tenant', id: t.id, name: t.name, row: t, issues };
    }),
    ...properties.map((pr) => ({
      kind: 'property', id: pr.id, name: pr.name, row: pr,
      issues: (pr.owner || '').trim() ? [] : [{ level: 'warning', text: 'Sin propietario' }]
    }))
  ].filter((x) => x.issues.length)
   .sort((a, b) => b.issues.filter((i) => i.level === 'error').length - a.issues.filter((i) => i.level === 'error').length);
  const [qualityOpen, setQualityOpen] = useState(true);

  const tenantCols = [
    { key: 'name', label: 'Inquilino' },
    { key: 'propertyName', label: 'Propiedad' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'monthlyRent', label: 'Renta mensual', render: (r) => fmtCur(r.monthlyRent, recCurrency(r)) },
    { key: 'commissionPercent', label: '% Comisión', render: (r) =>
      r.commissionPercent != null && r.commissionPercent !== ''
        ? <span className="badge-info">{Number(r.commissionPercent)}% = {fmtCur((Number(r.monthlyRent) || 0) * Number(r.commissionPercent) / 100, recCurrency(r))}</span>
        : <span className="badge-warning" title="Sin % de comisión este inquilino no genera su renta automáticamente cada mes. Edítalo para completarlo.">Falta %</span>
    },
    { key: 'collectionDay', label: 'Día cobro', render: (r) => r.collectionDay ? `Día ${r.collectionDay}` : '—' },
    { key: 'managerName', label: 'Administrador', render: (r) =>
      r.managerName ? <span className="badge-slate">{r.managerName}</span> : <span className="text-ink-300">—</span>
    },
    { key: 'contractStart', label: 'Inicio', render: (r) => fmtDate(r.contractStart) },
    { key: 'contractEnd', label: 'Vence', render: (r) => {
      if (!r.contractEnd) return '—';
      // Fechas inválidas (fin ≤ inicio): dato erróneo que excluye al inquilino
      // de la generación automática — resaltarlo para corregirlo.
      if (r.contractStart && r.contractEnd <= r.contractStart) {
        return <span className="badge-danger" title="Fin de contrato anterior o igual al inicio — corrija las fechas">⚠ {fmtDate(r.contractEnd)}</span>;
      }
      const d = new Date(r.contractEnd);
      const expiring = d >= today && d <= in30;
      return <span className={expiring ? 'badge-warning' : ''}>{fmtDate(r.contractEnd)}</span>;
    }},
    { key: 'actions', label: '', sortable: false, render: (r) => (
      <div className="flex gap-1 justify-end">
        <button className="btn-ghost p-1.5" onClick={() => editTenant(r)}><Edit2 size={14} /></button>
        {canDelete && (
          <button className="btn-ghost p-1.5 text-red-600" onClick={() => setConfirm({ open: true, kind: 'tenant', id: r.id })}><Trash2 size={14} /></button>
        )}
      </div>
    )}
  ];

  const agentCols = [
    { key: 'name', label: 'Nombre' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'commission', label: 'Comisión %', render: (r) => `${Number(r.commission) || 0}%` },
    { key: 'active', label: 'Estado', render: (r) => r.active
      ? <span className="badge-success">Activo</span>
      : <span className="badge-slate">Inactivo</span> },
    { key: 'actions', label: '', sortable: false, render: (r) => (
      <div className="flex gap-1 justify-end">
        <button className="btn-ghost p-1.5" title="Editar" onClick={() => { setAEdit(r.id); setAForm({ ...r, commission: r.commission ?? '', active: r.active ?? 1 }); setAOpen(true); }}><Edit2 size={14} /></button>
        <button className="btn-ghost p-1.5" title={r.active ? 'Desactivar' : 'Activar'} onClick={() => toggleAgentActive(r)}>
          <Power size={14} className={r.active ? 'text-amber-600' : 'text-emerald-600'} />
        </button>
        {canDelete && (
          <button className="btn-ghost p-1.5 text-red-600" title="Eliminar" onClick={() => setConfirm({ open: true, kind: 'agent', id: r.id })}><Trash2 size={14} /></button>
        )}
      </div>
    )}
  ];

  return (
    <div>
      <PageHeader
        title="Propiedades e Inquilinos"
        subtitle="Catálogo de inmuebles y relaciones contractuales"
        actions={<HelpButton content={HELP.properties} />}
      />

      {quality.length > 0 && (
        <div className="card mb-5 overflow-hidden">
          <button
            type="button"
            onClick={() => setQualityOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-ink-50/60 transition-colors"
            aria-expanded={qualityOpen}
          >
            <span className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20">
                <ClipboardCheck size={16} aria-hidden="true" />
              </span>
              <span>
                <span className="font-semibold text-ink-900">Calidad de datos</span>
                <span className="text-sm text-ink-500"> · {quality.length} registro(s) por completar</span>
              </span>
            </span>
            <ChevronDown size={18} className={`text-ink-400 transition-transform duration-200 ${qualityOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {qualityOpen && (
            <ul className="border-t border-ink-100 divide-y divide-ink-100">
              {quality.map((q) => (
                <li key={`${q.kind}-${q.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-2.5">
                  <span className="text-[11px] uppercase tracking-wide text-ink-400 w-20 shrink-0">
                    {q.kind === 'tenant' ? 'Inquilino' : 'Propiedad'}
                  </span>
                  <span className="font-medium text-ink-800 min-w-[140px]">{q.name}</span>
                  <span className="flex flex-wrap gap-1.5 flex-1">
                    {q.issues.map((i) => (
                      <span key={i.text} className={i.level === 'error' ? 'badge-danger' : 'badge-warning'}>{i.text}</span>
                    ))}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1.5 text-xs"
                    onClick={() => (q.kind === 'tenant' ? editTenant(q.row) : editProperty(q.row))}
                  >
                    <Edit2 size={13} /> Corregir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card card-body">
        <div className="flex items-center justify-between border-b border-ink-200 mb-4">
          <div className="flex">
            <button onClick={() => setTab('properties')} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'properties' ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-500'}`}>
              <Building2 size={14} className="inline mr-1" /> Propiedades ({properties.length})
            </button>
            <button onClick={() => setTab('tenants')} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'tenants' ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-500'}`}>
              <Users size={14} className="inline mr-1" /> Inquilinos ({tenants.length})
            </button>
            <button onClick={() => setTab('agents')} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'agents' ? 'border-ink-900 text-ink-900' : 'border-transparent text-ink-500'}`}>
              <UserCheck size={14} className="inline mr-1" /> Agentes ({agents.length})
            </button>
          </div>
          {tab === 'properties' && (
            <button className="btn-primary" onClick={() => { setPEdit(null); setPForm(propEmpty()); setPOpen(true); }}>
              <Plus size={16} /> Nueva propiedad
            </button>
          )}
          {tab === 'tenants' && (
            <div className="flex gap-2">
              {canConfig && (
                <button className="btn-secondary" title="Configurar bono de administración por inquilino"
                  onClick={() => { setBonusInput(String(adminBonusPerTenant)); setBonusErr(''); setBonusModal(true); }}>
                  <Settings size={16} /> Bono administración
                </button>
              )}
              <button className="btn-primary" onClick={() => { setTEdit(null); setTErr(''); setTForm(tenantEmpty()); setTOpen(true); }}>
                <Plus size={16} /> Nuevo inquilino
              </button>
            </div>
          )}
          {tab === 'agents' && (
            <button className="btn-primary" onClick={() => { setAEdit(null); setAForm(agentEmpty()); setAOpen(true); }}>
              <Plus size={16} /> Nuevo agente
            </button>
          )}
        </div>

        {tab === 'properties' && <DataTable columns={propCols} rows={properties} emptyText="Sin propiedades registradas" />}
        {tab === 'tenants' && <DataTable columns={tenantCols} rows={tenants} emptyText="Sin inquilinos registrados" />}
        {tab === 'agents' && <DataTable columns={agentCols} rows={agents} emptyText="Sin agentes registrados" />}
      </div>

      <Modal
        open={pOpen} onClose={() => setPOpen(false)}
        title={pEdit ? 'Editar propiedad' : 'Nueva propiedad'}
        size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => setPOpen(false)}>Cancelar</button>
          <button className="btn-primary" onClick={saveProp}>Guardar</button>
        </>}
      >
        <form onSubmit={saveProp} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2"><label className="label">Nombre / código</label><input className="input" required value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} /></div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={pForm.type} onChange={(e) => setPForm({ ...pForm, type: e.target.value })}>
              <option>Apartamento</option><option>Casa</option><option>Local comercial</option><option>Oficina</option><option>Terreno</option>
            </select>
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input" value={pForm.status} onChange={(e) => setPForm({ ...pForm, status: e.target.value })}>
              <option value="disponible">Disponible</option><option value="rentado">Rentado</option><option value="vendido">Vendido</option>
            </select>
          </div>
          <div className="md:col-span-2"><label className="label">Dirección</label><input className="input" value={pForm.address} onChange={(e) => setPForm({ ...pForm, address: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="label">Propietario</label><input className="input" placeholder="Nombre del dueño de la propiedad (aparece en el pago automático)" value={pForm.owner} onChange={(e) => setPForm({ ...pForm, owner: e.target.value })} /></div>
          <div><label className="label">Renta sugerida (DOP)</label><input type="number" step="0.01" className="input" value={pForm.rent} onChange={(e) => setPForm({ ...pForm, rent: e.target.value })} /></div>
          <div><label className="label">Precio venta (DOP)</label><input type="number" step="0.01" className="input" value={pForm.sale} onChange={(e) => setPForm({ ...pForm, sale: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="label">Notas</label><textarea className="input" rows={2} value={pForm.notes} onChange={(e) => setPForm({ ...pForm, notes: e.target.value })} /></div>
        </form>
      </Modal>

      <Modal
        open={tOpen} onClose={() => setTOpen(false)}
        title={tEdit ? 'Editar inquilino' : 'Nuevo inquilino'}
        size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => setTOpen(false)} disabled={tSaving}>Cancelar</button>
          <button className="btn-primary" onClick={saveTenant} disabled={tSaving}>{tSaving ? 'Guardando...' : 'Guardar'}</button>
        </>}
      >
        <form onSubmit={saveTenant} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tErr && (
            <div className="md:col-span-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {tErr}
            </div>
          )}
          <div><label className="label">Nombre</label><input className="input" required value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} /></div>
          <div><label className="label">Cédula / ID</label><input className="input" value={tForm.identification} onChange={(e) => setTForm({ ...tForm, identification: e.target.value })} /></div>
          <div><label className="label">Teléfono</label><input className="input" value={tForm.phone} onChange={(e) => setTForm({ ...tForm, phone: e.target.value })} /></div>
          <div><label className="label">Email</label><input type="email" className="input" value={tForm.email} onChange={(e) => setTForm({ ...tForm, email: e.target.value })} /></div>
          <div className="md:col-span-2">
            <label className="label">Propiedad</label>
            <select className="input" value={tForm.propertyId} onChange={(e) => setTForm({ ...tForm, propertyId: e.target.value })}>
              <option value="">— ninguna —</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label className="label">Inicio contrato</label><input type="date" className="input" value={tForm.contractStart} onChange={(e) => setTForm({ ...tForm, contractStart: e.target.value })} /></div>
          <div><label className="label">Fin contrato</label><input type="date" className="input" value={tForm.contractEnd} onChange={(e) => setTForm({ ...tForm, contractEnd: e.target.value })} /></div>
          <CurrencyFields
            currency={tForm.currency}
            exchangeRate={tForm.exchangeRate}
            onChange={(patch) => setTForm({ ...tForm, ...patch })}
          />
          <div><label className="label">Renta mensual ({tForm.currency === 'USD' ? 'US$' : 'RD$'})</label><input type="number" step="0.01" className="input" value={tForm.monthlyRent} onChange={(e) => setTForm({ ...tForm, monthlyRent: e.target.value })} /></div>
          <div>
            <label className="label">% Comisión (lo que nos toca)</label>
            <input type="number" step="0.5" min="0" max="100" className="input" placeholder="ej. 10" value={tForm.commissionPercent} onChange={(e) => setTForm({ ...tForm, commissionPercent: e.target.value })} />
          </div>
          <div>
            <label className="label">Día de cobro mensual</label>
            <input type="number" min="1" max="31" className="input" value={tForm.collectionDay} onChange={(e) => setTForm({ ...tForm, collectionDay: e.target.value })} />
          </div>
          {tForm.monthlyRent && tForm.commissionPercent !== '' && Number(tForm.commissionPercent) > 0 && (
            <div className="md:col-span-2 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 text-sm text-ink-700">
              Cada mes se generará en <b>Ingresos</b> un cobro pendiente de{' '}
              <b>{fmtCur((Number(tForm.monthlyRent) || 0) * (Number(tForm.commissionPercent) || 0) / 100, tForm.currency === 'USD' ? 'USD' : 'DOP')}</b>
              {' '}({tForm.commissionPercent}% de la renta) el día {tForm.collectionDay || 1}.
            </div>
          )}
          <div className="md:col-span-2">
            <label className="label flex items-center gap-1.5"><UserCog size={14} className="text-ink-500" /> Administrador / responsable</label>
            <select className="input" value={tForm.managerId} onChange={(e) => setTForm({ ...tForm, managerId: e.target.value })}>
              <option value="">— sin asignar —</option>
              {staff.filter((s) => !s.blocked).map((s) => (
                <option key={s.id} value={s.id}>{s.fullName || s.username} ({s.role})</option>
              ))}
            </select>
            {tForm.managerId && (
              <p className="text-xs text-ink-500 mt-1">
                Genera un bono mensual de {fmtCur(adminBonusPerTenant, 'DOP')} por inquilino administrado en Gastos Mensuales, a nombre de este colaborador.
              </p>
            )}
          </div>
          <div className="md:col-span-2"><label className="label">Notas</label><textarea className="input" rows={2} value={tForm.notes} onChange={(e) => setTForm({ ...tForm, notes: e.target.value })} /></div>
        </form>
      </Modal>

      <Modal
        open={aOpen} onClose={() => setAOpen(false)}
        title={aEdit ? 'Editar agente' : 'Nuevo agente'}
        size="md"
        footer={<>
          <button className="btn-secondary" onClick={() => setAOpen(false)}>Cancelar</button>
          <button className="btn-primary" onClick={saveAgent}>Guardar</button>
        </>}
      >
        <form onSubmit={saveAgent} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2"><label className="label">Nombre completo</label><input className="input" required value={aForm.name} onChange={(e) => setAForm({ ...aForm, name: e.target.value })} /></div>
          <div><label className="label">Teléfono</label><input className="input" value={aForm.phone} onChange={(e) => setAForm({ ...aForm, phone: e.target.value })} /></div>
          <div><label className="label">Email</label><input type="email" className="input" value={aForm.email} onChange={(e) => setAForm({ ...aForm, email: e.target.value })} /></div>
          <div><label className="label">Comisión por defecto (%)</label><input type="number" step="0.01" className="input" value={aForm.commission} onChange={(e) => setAForm({ ...aForm, commission: e.target.value })} placeholder="ej. 5" /></div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={!!aForm.active} onChange={(e) => setAForm({ ...aForm, active: e.target.checked ? 1 : 0 })} />
              Agente activo (aparecerá en formularios de renta y venta)
            </label>
          </div>
          <div className="md:col-span-2"><label className="label">Notas</label><textarea className="input" rows={2} value={aForm.notes} onChange={(e) => setAForm({ ...aForm, notes: e.target.value })} /></div>
        </form>
      </Modal>

      <Modal
        open={bonusModal} onClose={() => setBonusModal(false)}
        title="Bono de administración por inquilino" size="sm"
        footer={<>
          <button className="btn-secondary" onClick={() => setBonusModal(false)}>Cancelar</button>
          <button className="btn-primary" onClick={async () => {
            setBonusErr('');
            try {
              await setAdminBonusPerTenant(bonusInput, user);
              setBonusModal(false);
            } catch (ex) {
              setBonusErr(ex.message || 'Error al guardar');
            }
          }}>Guardar</button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            Monto fijo (RD$) que se paga mensualmente a cada colaborador por <b>cada inquilino que administra</b>.
            Se genera automáticamente en <b>Gastos Mensuales</b> como un gasto pendiente por colaborador
            (ej. "Bono administración — Yuleimi (3 inquilinos administrados)"). Si el colaborador administra
            menos inquilinos, el monto baja solo; si administra más, sube. Una vez pagado, ese mes no se vuelve a tocar.
          </p>
          <div>
            <label className="label">Monto por inquilino (RD$)</label>
            <input type="number" step="0.01" min="0" className="input" value={bonusInput} onChange={(e) => setBonusInput(e.target.value)} autoFocus />
          </div>
          {bonusErr && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{bonusErr}</div>}
        </div>
      </Modal>

      <ConfirmModal
        open={confirm.open}
        onClose={() => setConfirm({ open: false, kind: '', id: null })}
        onConfirm={remove}
        title="Eliminar registro"
        message="Esta acción es irreversible. ¿Desea continuar?"
        danger
      />
    </div>
  );
}
