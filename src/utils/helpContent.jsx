const Section = ({ title, children }) => (
  <div>
    <h4 className="font-semibold text-slate-800 mb-1">{title}</h4>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const Formula = ({ children }) => (
  <div className="bg-brand-50 border border-brand-200 rounded-md px-3 py-2 font-mono text-xs text-brand-900 my-1">
    {children}
  </div>
);

const Note = ({ children }) => (
  <div className="bg-amber-50 border-l-4 border-amber-400 px-3 py-2 text-xs text-amber-900">
    💡 {children}
  </div>
);

const HELP = {
  dashboard: (
    <>
      <Section title="¿Qué muestra el Dashboard?">
        <p>Resumen financiero del mes seleccionado y comparativa anual.</p>
      </Section>
      <Section title="Ingresos totales">
        <Formula>Rentas pagadas + Rentas parciales (lo cobrado) + Ventas del mes</Formula>
        <p>Las rentas <b>pendientes</b> NO se suman al ingreso. Las parciales solo aportan la parte efectivamente cobrada.</p>
      </Section>
      <Section title="Gastos totales">
        <Formula>Suma de "Monto mensual" de TODOS los gastos del mes (pagados + pendientes)</Formula>
      </Section>
      <Section title="Balance neto / Excedente">
        <Formula>Ingresos totales − Gastos totales</Formula>
        <p>Si es negativo, el mes es <b>deficitario</b> y se muestra una alerta roja. En ese caso no hay distribución ni bonificaciones.</p>
      </Section>
      <Section title="Comisiones">
        <p>Suma del campo <b>Comisión</b> de las ventas registradas en el mes.</p>
      </Section>
      <Section title="Gráfica anual">
        <p>Compara ingresos, gastos y excedente de los 12 meses del año seleccionado.</p>
      </Section>
      <Section title="Alertas">
        <ul className="list-disc list-inside text-xs">
          <li><b>Contratos por vencer:</b> inquilinos cuyo <code>contractEnd</code> cae en los próximos 30 días.</li>
          <li><b>Rentas pendientes:</b> hasta 5 rentas del mes con estado distinto a "pagado".</li>
        </ul>
      </Section>
    </>
  ),

  rentals: (
    <>
      <Section title="¿Qué se registra aquí?">
        <p>Cada renta cobrable mensual por propiedad/inquilino. Una renta = un cargo del mes.</p>
      </Section>
      <Section title="Estados">
        <ul className="list-disc list-inside text-xs space-y-1">
          <li><b>Pagado:</b> ingreso completo (monto total cuenta como ingreso).</li>
          <li><b>Parcial:</b> solo el campo "Pagado" cuenta como ingreso real.</li>
          <li><b>Pendiente:</b> no aporta a los ingresos del mes (genera alerta en Dashboard).</li>
        </ul>
      </Section>
      <Section title="Agente que cerró">
        <p>Determina la asignación de bonificaciones. Si el agente no aparece, agréguelo en <b>Propiedades e Inquilinos → Agentes</b>.</p>
      </Section>
      <Section title="Tarjetas resumen">
        <Formula>Pagado = suma de monto de rentas en estado "pagado"</Formula>
        <Formula>Parcial = suma del campo "Pagado" de las rentas parciales</Formula>
        <Formula>Pendiente = suma de monto de rentas en estado "pendiente"</Formula>
      </Section>
      <Note>Las rentas en estado "pagado" o "parcial" cuentan como <b>cierres del agente</b> para el cálculo proporcional del bono.</Note>
    </>
  ),

  sales: (
    <>
      <Section title="¿Qué se registra aquí?">
        <p>Cierres de venta de propiedades. Cada venta se asigna a un agente y a un mes/año.</p>
      </Section>
      <Section title="Campos clave">
        <ul className="list-disc list-inside text-xs space-y-1">
          <li><b>Precio:</b> monto bruto de venta. Suma completa a los ingresos del mes.</li>
          <li><b>Comisión:</b> pago al agente. Es informativa, no se descuenta automáticamente de los ingresos (debe registrarse como gasto si aplica).</li>
        </ul>
      </Section>
      <Section title="Totales">
        <Formula>Total ventas = suma de precios del mes</Formula>
        <Formula>Comisiones = suma del campo Comisión del mes</Formula>
      </Section>
    </>
  ),

  expenses: (
    <>
      <Section title="¿Qué se registra aquí?">
        <p>Todos los gastos operativos mensuales: alquiler, salarios, servicios, etc.</p>
      </Section>
      <Section title="Quincenas">
        <p>Quincena 1 vence el día <b>15</b>, Quincena 2 el día <b>30</b>. Si los deja vacíos al crear, el sistema divide el monto mensual entre 2.</p>
        <Formula>Q1 + Q2 ≈ Monto mensual</Formula>
      </Section>
      <Section title="Recurrentes">
        <p>Si marca <b>"Gasto recurrente"</b>, al entrar al mes siguiente el sistema copia automáticamente esa partida con estado "pendiente". No duplica si ya existen gastos en el mes destino.</p>
      </Section>
      <Section title="Cómo afecta al excedente">
        <Formula>Total mensual = suma de TODOS los gastos del mes (sin importar estado)</Formula>
        <p>Esto significa que un gasto registrado como "pendiente" ya impacta el cálculo del excedente.</p>
      </Section>
      <Note>El campo "Pendiente" en tarjetas resumen muestra solo lo que aún no se ha pagado, pero contablemente todo el gasto ya está reservado.</Note>
    </>
  ),

  distribution: (
    <>
      <Section title="¿Qué hace este módulo?">
        <p>Define cómo se reparte el <b>excedente del mes</b> entre distintas bolsas (ahorro, oficina, bonos, etc.).</p>
      </Section>
      <Section title="Categorías personalizables">
        <p>Puede <b>añadir</b>, <b>renombrar</b> y <b>eliminar</b> categorías. Los porcentajes deben sumar exactamente 100% para poder guardar.</p>
      </Section>
      <Section title="Categoría protegida: Bonos equipo">
        <p>Esta categoría <b>no se puede eliminar ni renombrar</b> porque alimenta el módulo de Bonificaciones. Su porcentaje sí se puede modificar.</p>
      </Section>
      <Section title="Fórmula">
        <Formula>Excedente = Ingresos − Gastos</Formula>
        <Formula>Monto categoría = Excedente × (% categoría / 100)</Formula>
        <p>Si el excedente es ≤ 0, no se aplica distribución ese mes.</p>
      </Section>
      <Note>Cambiar los porcentajes se registra en la bitácora (acción <code>distribution.config</code>) por trazabilidad.</Note>
    </>
  ),

  bonuses: (
    <>
      <Section title="¿Cómo se calculan?">
        <p>El sistema reserva un <b>pool</b> del excedente del mes basado en el % de la categoría "Bonos equipo" (configurada en Distribución).</p>
      </Section>
      <Section title="Fórmulas">
        <Formula>Pool = Excedente × (% Bonos equipo / 100)</Formula>
        <Formula>Bono agente = Pool × (cierres del agente / cierres totales del mes)</Formula>
        <p>Un "cierre" cuenta cuando una renta queda en estado <b>pagado</b> o <b>parcial</b>, y tiene un agente asignado.</p>
      </Section>
      <Section title="Casos sin bono">
        <ul className="list-disc list-inside text-xs space-y-1">
          <li>Mes con excedente ≤ 0: pool = 0, no hay bonificaciones.</li>
          <li>% Bonos equipo = 0: pool = 0.</li>
          <li>Renta sin agente asignado: no genera bono para nadie.</li>
        </ul>
      </Section>
      <Note>Para cambiar el % del pool, vaya a <b>Distribución de Fondos</b> y ajuste la categoría "Bonos equipo".</Note>
    </>
  ),

  properties: (
    <>
      <Section title="Tres catálogos en una vista">
        <ul className="list-disc list-inside text-xs space-y-1">
          <li><b>Propiedades:</b> inmuebles disponibles para renta o venta.</li>
          <li><b>Inquilinos:</b> personas/empresas con contrato sobre una propiedad.</li>
          <li><b>Agentes:</b> personal que cierra rentas y ventas. Solo los <b>activos</b> aparecen en formularios.</li>
        </ul>
      </Section>
      <Section title="Alertas de vencimiento">
        <p>Los inquilinos cuyo <b>Fin de contrato</b> cae dentro de los próximos 30 días se marcan en amarillo y aparecen en el Dashboard.</p>
      </Section>
      <Section title="Agentes inactivos">
        <p>Use el botón <i>Power</i> para desactivar a un agente sin perder su historial. Las rentas/ventas pasadas conservan su nombre asignado.</p>
      </Section>
    </>
  ),

  reports: (
    <>
      <Section title="Modos de filtro">
        <ul className="list-disc list-inside text-xs space-y-1">
          <li><b>Mes específico:</b> reporte detallado de un solo mes.</li>
          <li><b>Año completo:</b> 12 meses del año elegido (incluye meses vacíos).</li>
          <li><b>Rango:</b> entre dos pares año/mes consecutivos.</li>
        </ul>
      </Section>
      <Section title="Origen de los totales">
        <Formula>Ingresos = suma de Ingresos de cada mes del rango</Formula>
        <Formula>Gastos = suma de Gastos mensuales del rango</Formula>
        <Formula>Excedente = Ingresos − Gastos del rango</Formula>
      </Section>
      <Section title="Exportación PDF">
        <p>Primera página: resumen mensual. Páginas siguientes: detalle por mes (rentas, ventas, gastos, bonificaciones).</p>
      </Section>
      <Section title="Exportación Excel">
        <p>Genera hojas separadas: <b>Resumen, Rentas, Ventas, Gastos, Bonificaciones, Distribución</b>. Las categorías de distribución se renombran dinámicamente según su configuración.</p>
      </Section>
    </>
  ),

  users: (
    <>
      <Section title="Roles del sistema">
        <ul className="list-disc list-inside text-xs space-y-1">
          <li><b>SuperAdmin:</b> acceso total, incluido Respaldo. Puede crear otros SuperAdmin.</li>
          <li><b>Admin:</b> gestión de usuarios (excepto SuperAdmin), distribución, reportes.</li>
          <li><b>Operativo:</b> registro diario de rentas, ventas, gastos, propiedades.</li>
        </ul>
      </Section>
      <Section title="Bloqueo de cuentas">
        <p>Un usuario bloqueado no puede iniciar sesión. No puede bloquearse a sí mismo. Un Admin no puede bloquear/editar a un SuperAdmin.</p>
      </Section>
      <Section title="Contraseñas">
        <p>Se almacenan con hash <b>SHA-256</b>. En edición, dejar la contraseña vacía mantiene la actual.</p>
      </Section>
      <Section title="Bitácora">
        <p>Registra automáticamente: login/logout, creación/edición/eliminación en cualquier módulo, cambios de distribución, respaldos e importaciones. Se conservan los últimos 50 eventos visibles.</p>
      </Section>
    </>
  ),

  backup: (
    <>
      <Section title="Exportar respaldo">
        <p>Descarga un archivo <code>jireh-backup-YYYY-MM-DD.json</code> con todas las tablas: usuarios, rentas, ventas, gastos, propiedades, inquilinos, agentes, configuración, distribuciones y bitácora.</p>
      </Section>
      <Section title="Importar / Restaurar">
        <p><b>Reemplaza por completo</b> los datos actuales con los del archivo. Tras importar, la app recarga automáticamente.</p>
      </Section>
      <Section title="Cargar datos de ejemplo">
        <p>Genera un escenario realista de 6 meses (10 propiedades, 7 inquilinos, 2 agentes extra, ~42 rentas, 3 ventas, 60 gastos). Útil para probar todos los módulos. Conserva los usuarios y agentes existentes.</p>
      </Section>
      <Section title="Limpiar datos">
        <p>Borra rentas, ventas, gastos, propiedades, inquilinos, distribuciones y bitácora. Conserva usuarios, agentes y la configuración de distribución.</p>
      </Section>
      <Note>Antes de importar o limpiar, considere exportar un respaldo primero.</Note>
    </>
  )
};

export default HELP;
