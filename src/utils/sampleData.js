import { db, logActivity } from '../db/database.js';

const PROPERTIES = [
  { name: 'Torre Anacaona 305', type: 'Apartamento', address: 'Av. Anacaona #27, Mirador Sur, DN', rent: 65000, sale: 12500000, status: 'rentado' },
  { name: 'Torre Anacaona 412', type: 'Apartamento', address: 'Av. Anacaona #27, Mirador Sur, DN', rent: 75000, sale: 14200000, status: 'rentado' },
  { name: 'Residencial Naco 2B', type: 'Apartamento', address: 'C/ Tiradentes #54, Naco, DN', rent: 55000, sale: 9800000, status: 'rentado' },
  { name: 'Casa Arroyo Hondo', type: 'Casa', address: 'C/ Camino Chiquito #18, Arroyo Hondo II', rent: 90000, sale: 18500000, status: 'rentado' },
  { name: 'Local Plaza Lincoln', type: 'Local comercial', address: 'Av. Abraham Lincoln #1056, Piantini', rent: 120000, sale: 25000000, status: 'rentado' },
  { name: 'Oficina Acrópolis 8A', type: 'Oficina', address: 'Av. Winston Churchill, Acrópolis Center', rent: 45000, sale: 8200000, status: 'disponible' },
  { name: 'Apto. Bella Vista', type: 'Apartamento', address: 'C/ Rómulo Betancourt, Bella Vista', rent: 42000, sale: 7800000, status: 'rentado' },
  { name: 'Casa Cuesta Hermosa', type: 'Casa', address: 'Cuesta Hermosa III, Arroyo Hondo', rent: 85000, sale: 16500000, status: 'disponible' },
  { name: 'Terreno Punta Cana', type: 'Terreno', address: 'Bávaro, Punta Cana, La Altagracia', rent: 0, sale: 32000000, status: 'disponible' },
  { name: 'Apto. Evaristo Morales', type: 'Apartamento', address: 'C/ José Brea Peña, Evaristo Morales', rent: 38000, sale: 6900000, status: 'vendido' }
];

const TENANT_NAMES = [
  ['Juan Carlos Pérez', '809-555-1010', 'jc.perez@correo.do', '001-1234567-8'],
  ['Lucía Fernández', '809-555-2020', 'lucia.fdez@correo.do', '001-2234568-9'],
  ['Pedro Martínez', '829-555-3030', 'p.martinez@correo.do', '001-3334569-1'],
  ['Sofía Reyes Polanco', '849-555-4040', 'sofia.rp@correo.do', '001-4434561-2'],
  ['Empresa BlueTech SRL', '809-555-5050', 'admin@bluetech.do', '1-30-12345-6'],
  ['Carlos Mejía Núñez', '809-555-6060', 'cmejia@correo.do', '001-5534563-4'],
  ['María Altagracia Soto', '829-555-7070', 'masoto@correo.do', '001-6634564-5']
];

const AGENT_EXTRA = [
  { name: 'Roberto Sánchez Díaz', phone: '809-555-8081', email: 'rsanchez@jireh.do', commission: 5, active: 1 },
  { name: 'Yelitza Báez Rosa',     phone: '809-555-8082', email: 'ybaez@jireh.do',     commission: 4.5, active: 1 }
];

const EXPENSES_BASE = [
  { description: 'Alquiler de oficina', monthly: 35000, recurring: 1 },
  { description: 'Energía eléctrica (EDESUR)', monthly: 12500, recurring: 1 },
  { description: 'Internet + Teléfono (Claro)', monthly: 4800, recurring: 1 },
  { description: 'Agua potable (CAASD)', monthly: 1800, recurring: 1 },
  { description: 'Salarios administrativos', monthly: 95000, recurring: 1 },
  { description: 'Publicidad redes sociales', monthly: 18000, recurring: 1 },
  { description: 'Mantenimiento y limpieza', monthly: 7500, recurring: 1 },
  { description: 'Suministros de oficina', monthly: 3500, recurring: 1 },
  { description: 'Hosting + dominio web', monthly: 2200, recurring: 1 },
  { description: 'Seguros (Universal)', monthly: 5500, recurring: 1 }
];

const monthsBack = (n) => {
  const now = new Date();
  const list = [];
  for (let i = n; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    list.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return list;
};

const dayInMonth = (y, m, d) => {
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};

const pick = (arr, i) => arr[i % arr.length];

export async function clearTransactionalData(currentUser) {
  const tablesToWipe = ['rentals', 'sales', 'expenses', 'properties', 'tenants', 'distributions', 'activityLog'];
  await db.transaction('rw', tablesToWipe.map((t) => db.table(t)), async () => {
    for (const t of tablesToWipe) await db.table(t).clear();
  });
  if (currentUser) {
    await logActivity(currentUser.sub, currentUser.username, 'data.clear', 'Datos transaccionales eliminados');
  }
}

export async function loadSampleData(currentUser) {
  await db.transaction('rw', db.tables, async () => {
    const tablesToWipe = ['rentals', 'sales', 'expenses', 'properties', 'tenants', 'distributions', 'activityLog'];
    for (const t of tablesToWipe) await db.table(t).clear();

    const allAgents = await db.agents.toArray();
    const existingNames = new Set(allAgents.map((a) => a.name));
    const toAdd = AGENT_EXTRA.filter((a) => !existingNames.has(a.name));
    if (toAdd.length) {
      await db.agents.bulkAdd(toAdd.map((a) => ({ ...a, createdAt: new Date().toISOString() })));
    }
    const agents = await db.agents.where('active').equals(1).toArray();

    const propIds = await db.properties.bulkAdd(
      PROPERTIES.map((p) => ({ ...p, createdAt: new Date().toISOString() })),
      { allKeys: true }
    );

    const tenantSeeds = TENANT_NAMES.map((t, i) => {
      const propId = propIds[i % propIds.length];
      const property = PROPERTIES[i % PROPERTIES.length];
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - (10 + i));
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 12 + (i % 3) * 6);
      return {
        name: t[0], phone: t[1], email: t[2], identification: t[3],
        propertyId: propId, propertyName: property.name,
        contractStart: startDate.toISOString().slice(0, 10),
        contractEnd: endDate.toISOString().slice(0, 10),
        monthlyRent: property.rent || 50000,
        notes: '',
        createdAt: new Date().toISOString()
      };
    });
    const tenantIds = await db.tenants.bulkAdd(tenantSeeds, { allKeys: true });

    const periods = monthsBack(5);
    const rentals = [];
    const sales = [];
    const expenses = [];

    periods.forEach((p, idx) => {
      tenantSeeds.forEach((t, ti) => {
        const tenantId = tenantIds[ti];
        const agent = pick(agents, ti + idx);
        const isLast = idx === periods.length - 1;
        let status = 'pagado';
        let paid = t.monthlyRent;
        if (isLast && ti === 0) { status = 'pendiente'; paid = 0; }
        else if (isLast && ti === 1) { status = 'parcial'; paid = Math.round(t.monthlyRent * 0.5); }
        else if (idx === 2 && ti === 3) { status = 'parcial'; paid = Math.round(t.monthlyRent * 0.7); }

        rentals.push({
          year: p.year, month: p.month,
          date: dayInMonth(p.year, p.month, 5 + (ti % 10)),
          propertyId: t.propertyId, propertyName: t.propertyName,
          tenantId, tenantName: t.name,
          agentId: agent?.id || null, agentName: agent?.name || '',
          amount: t.monthlyRent, paid, status, notes: '',
          createdAt: new Date().toISOString()
        });
      });

      const salesThisMonth = idx === 1 ? 1 : idx === 3 ? 1 : idx === 4 ? 1 : 0;
      for (let s = 0; s < salesThisMonth; s++) {
        const property = PROPERTIES[(idx + s) % PROPERTIES.length];
        const propertyId = propIds[(idx + s) % propIds.length];
        const agent = pick(agents, idx + s + 2);
        const price = property.sale || 8000000;
        sales.push({
          year: p.year, month: p.month,
          date: dayInMonth(p.year, p.month, 18 + s),
          propertyId, propertyName: property.name,
          buyer: ['Inversora Caribe SRL', 'Familia Rodríguez Castro', 'Manuel Gómez Hernández', 'Grupo Alba SRL'][(idx + s) % 4],
          agentId: agent?.id || null, agentName: agent?.name || '',
          price, commission: Math.round(price * 0.03),
          notes: '',
          createdAt: new Date().toISOString()
        });
      }

      EXPENSES_BASE.forEach((e, ei) => {
        const isLast = idx === periods.length - 1;
        const status = isLast && ei % 3 === 0 ? 'pendiente' : 'pagado';
        expenses.push({
          year: p.year, month: p.month,
          description: e.description,
          monthly: e.monthly,
          q1: e.monthly / 2,
          q2: e.monthly / 2,
          paymentDate: dayInMonth(p.year, p.month, 15),
          status,
          recurring: e.recurring,
          notes: '',
          createdAt: new Date().toISOString()
        });
      });
    });

    if (rentals.length) await db.rentals.bulkAdd(rentals);
    if (sales.length) await db.sales.bulkAdd(sales);
    if (expenses.length) await db.expenses.bulkAdd(expenses);
  });

  if (currentUser) {
    await logActivity(currentUser.sub, currentUser.username, 'sample.load', 'Datos de ejemplo cargados');
  }

  return {
    properties: PROPERTIES.length,
    tenants: TENANT_NAMES.length,
    months: 6,
    rentals: TENANT_NAMES.length * 6,
    sales: 3,
    expenses: EXPENSES_BASE.length * 6
  };
}
