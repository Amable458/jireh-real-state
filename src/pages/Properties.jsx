import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, Building2, Users, UserCheck, Power } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal, { ConfirmModal } from '../components/Modal.jsx';
import HelpButton from '../components/HelpButton.jsx';
import HELP from '../utils/helpContent.jsx';
import { useAuth } from '../store/auth.js';
import { db, logActivity } from '../db/database.js';
import { useRealtimeTable } from '../hooks/useRealtimeTable.js';
import { useSettings } from '../store/settings.js';
import { fmtMoney, fmtDate, todayISO } from '../utils/format.js';
import { fmtCur, recCurrency } from '../utils/currency.js';
import { deleteTenantCharges } from '../utils/tenantCharges.js';
import CurrencyFields from '../components/CurrencyFields.jsx';

const propEmpty = () => ({ name: '', type: 'Apartamento', address: '', owner: '', rent: '', sale: '', status: 'disponible', notes: '' });
const tenantEmpty = () => ({
  name: '', phone: '', email: '', identification: '', propertyId: '',
  contractStart: todayISO(), contractEnd: '', monthlyRent: '', notes: '',
  currency: 'DOP', exchangeRate: '', commissionPercent: '', collectionDay: 1
});
const agentEmpty = () => ({ name: '', phone: '', email: '', commission: '', notes: '', active: 1 });

export default function Properties() {
  const { user } = useAuth();
  const { usdToDop } = useSettings();
  const [tab, setTab] = useState('properties');
  const [properties, setProperties] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [agents, setAgents] = useState([]);

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

  const load = async () => {
    setProperties(await db.properties.toArray());
    setTenants(await db.tenants.toArray());
    setAgents(await db.agents.toArray());
  };
  useEffect(() => { load(); }, []);
  useRealtimeTable(['properties', 'tenants', 'agents'], () => load());

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
    const property = properties.find((p) => p.id === Number(tForm.propertyId));
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
        <button className="btn-ghost p-1.5" onClick={() => { setPEdit(r.id); setPForm({ ...propEmpty(), ...r, rent: r.rent ?? '', sale: r.sale ?? '', owner: r.owner ?? '' }); setPOpen(true); }}><Edit2 size={14} /></button>
        <button className="btn-ghost p-1.5 text-red-600" onClick={() => setConfirm({ open: true, kind: 'property', id: r.id })}><Trash2 size={14} /></button>
      </div>
    )}
  ];

  const tenantCols = [
    { key: 'name', label: 'Inquilino' },
    { key: 'propertyName', label: 'Propiedad' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'monthlyRent', label: 'Renta mensual', render: (r) => fmtCur(r.monthlyRent, recCurrency(r)) },
    { key: 'commissionPercent', label: '% Comisión', render: (r) =>
      r.commissionPercent != null && r.commissionPercent !== ''
        ? <span className="badge-info">{Number(r.commissionPercent)}% = {fmtCur((Number(r.monthlyRent) || 0) * Number(r.commissionPercent) / 100, recCurrency(r))}</span>
        : <span className="badge-slate" title="Sin % configurado: no genera ingreso automático">—</span>
    },
    { key: 'collectionDay', label: 'Día cobro', render: (r) => r.collectionDay ? `Día ${r.collectionDay}` : '—' },
    { key: 'contractStart', label: 'Inicio', render: (r) => fmtDate(r.contractStart) },
    { key: 'contractEnd', label: 'Vence', render: (r) => {
      if (!r.contractEnd) return '—';
      const d = new Date(r.contractEnd);
      const expiring = d >= today && d <= in30;
      return <span className={expiring ? 'badge-warning' : ''}>{fmtDate(r.contractEnd)}</span>;
    }},
    { key: 'actions', label: '', sortable: false, render: (r) => (
      <div className="flex gap-1 justify-end">
        <button className="btn-ghost p-1.5" onClick={() => {
          setTEdit(r.id);
          setTErr('');
          setTForm({
            ...tenantEmpty(), ...r,
            monthlyRent: r.monthlyRent ?? '',
            currency: r.currency || 'DOP',
            exchangeRate: r.exchangeRate ?? '',
            commissionPercent: r.commissionPercent ?? '',
            collectionDay: r.collectionDay ?? 1,
            contractEnd: r.contractEnd || ''
          });
          setTOpen(true);
        }}><Edit2 size={14} /></button>
        <button className="btn-ghost p-1.5 text-red-600" onClick={() => setConfirm({ open: true, kind: 'tenant', id: r.id })}><Trash2 size={14} /></button>
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
        <button className="btn-ghost p-1.5 text-red-600" title="Eliminar" onClick={() => setConfirm({ open: true, kind: 'agent', id: r.id })}><Trash2 size={14} /></button>
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
            <button className="btn-primary" onClick={() => { setTEdit(null); setTErr(''); setTForm(tenantEmpty()); setTOpen(true); }}>
              <Plus size={16} /> Nuevo inquilino
            </button>
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
