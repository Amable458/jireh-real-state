import {
  Plus, Edit2, Pencil, Trash2, CheckCircle2, FileDown, Printer, Settings, Download, Upload, X, Eye, EyeOff,
  ExternalLink, Star, ImagePlus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, Save,
  RotateCcw, Users, UserCog, Power, Lock, Unlock, FileText, FileSpreadsheet, ShieldCheck, Wrench, Sparkles,
  KeyRound, Globe, MessageSquareText, Copy, Building2, UserCheck, Calendar, CheckSquare, ArrowUpDown, LogOut
} from 'lucide-react';

// ============================================================
// Guías de cada sección (botón «Guía» arriba a la derecha).
// Estructura común: para qué sirve → paso a paso → botones y controles
// (con el mismo ícono que se ve en pantalla) → reglas y cálculos.
// ============================================================

const Section = ({ title, children }) => (
  <div>
    <h4 className="font-semibold text-ink-800 mb-1.5">{title}</h4>
    <div className="space-y-2.5">{children}</div>
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

// Resumen de una línea al inicio de cada guía
const Intro = ({ children }) => (
  <p className="text-[13px] text-ink-800 bg-ink-50 rounded-lg px-3 py-2.5 leading-relaxed">{children}</p>
);

// Pasos numerados para una tarea
const Steps = ({ title, children }) => (
  <div>
    {title && <p className="font-medium text-ink-800 text-[13px] mb-1">{title}</p>}
    <ol className="list-decimal pl-5 space-y-1 text-[13px]">{children}</ol>
  </div>
);

// Botón tal como se ve en pantalla: ícono + texto
const Chip = ({ icon: Icon, label, tone = 'neutral' }) => {
  const tones = {
    neutral: 'bg-white text-ink-700 ring-ink-200',
    primary: 'bg-brand-500 text-ink-900 ring-brand-500',
    green: 'bg-white text-emerald-700 ring-emerald-200',
    red: 'bg-white text-red-600 ring-red-200',
    amber: 'bg-white text-amber-700 ring-amber-200'
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap ${tones[tone]}`}>
      {Icon && <Icon size={12} aria-hidden="true" />}{label}
    </span>
  );
};

// Lista «botón → qué hace»
const Controls = ({ children }) => <div className="divide-y divide-ink-100 border-y border-ink-100">{children}</div>;
const Ctl = ({ chip, who, children }) => (
  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,12rem)_1fr] gap-x-3 gap-y-1 py-2 items-start">
    <div className="flex flex-wrap items-center gap-1">{chip}</div>
    <div className="text-[13px] text-ink-700">
      {children}
      {who && <span className="ml-1 text-[11px] text-ink-500">({who})</span>}
    </div>
  </div>
);

// Controles que comparten todas las tablas
const TablaComun = () => (
  <Section title="Cómo usar las tablas">
    <Controls>
      <Ctl chip={<Chip icon={Search} label="Buscar..." />}>Escribe cualquier palabra (nombre, propiedad, monto) y la tabla muestra solo lo que coincide.</Ctl>
      <Ctl chip={<Chip icon={ArrowUpDown} label="Título de columna" />}>Un clic ordena de menor a mayor; otro clic, al revés.</Ctl>
      <Ctl chip={<><Chip icon={ChevronLeft} label="" /><Chip icon={ChevronRight} label="" /></>}>Junto a la tabla, en pantallas pequeñas: muestran las columnas que no caben. También se puede deslizar de lado.</Ctl>
      <Ctl chip={<><Chip icon={ChevronsLeft} label="" /><Chip icon={ChevronLeft} label="" /><Chip label="1 2 3" /><Chip icon={ChevronRight} label="" /><Chip icon={ChevronsRight} label="" /></>}>Abajo: primera página, anterior, número de página, siguiente y última.</Ctl>
      <Ctl chip={<><Chip label="Ver 10 por página" /><Chip label="Ir a … Ir" /></>}>Cuántos registros ver por página, y saltar directo a una página escribiendo su número.</Ctl>
    </Controls>
  </Section>
);

// Selector de mes y año que tienen varias pantallas
const Periodo = () => (
  <Ctl chip={<><Chip icon={Calendar} label="Año" /><Chip label="Mes" /></>}>Arriba a la derecha: elige el mes que quieres ver. Lo que registres se guarda en el mes de su <b>fecha</b>, no en el mes que tengas seleccionado.</Ctl>
);

const HELP = {
  // ---------------------------------------------------------------- Dashboard
  dashboard: (
    <>
      <Intro>El <b>Dashboard</b> es la foto del mes: cuánto entró, cuánto se pagó, cuánto queda y qué está pendiente. Aquí no se registra nada; todo viene de Ingresos, Ventas y Gastos.</Intro>
      <Section title="Botones y controles">
        <Controls>
          <Periodo />
          <Ctl chip={<><Chip label="RD$" /><Chip label="US$" /><Chip label="Ambas" /><Chip label="Convertido a RD$" /></>}>
            Cómo ver las monedas: solo pesos, solo dólares, <b>Ambas</b> (tarjetas separadas) o <b>Convertido a RD$</b> (todo sumado en pesos con la tasa de cada movimiento).
          </Ctl>
          <Ctl chip={<Chip icon={Pencil} label="Tasa USD → DOP" />}>Cambia la tasa de cambio que se propone en los registros nuevos en dólares. No cambia los registros ya guardados: cada uno conserva la tasa de su día.</Ctl>
        </Controls>
      </Section>
      <Section title="Las tarjetas">
        <ul className="list-disc pl-5 text-[13px] space-y-1">
          <li><b>Ingresos totales:</b> rentas cobradas (las parciales solo por lo cobrado) + la <b>comisión</b> de las ventas del mes. Lo pendiente no suma.</li>
          <li><b>Gastos pagados:</b> solo lo que ya se pagó, quincena por quincena. «Comprometido total» incluye lo pendiente, como referencia.</li>
          <li><b>Balance neto / Excedente:</b> ingresos menos gastos pagados. Si sale negativo aparece en rojo y ese mes no hay distribución ni bonos.</li>
          <li><b>Volumen de ventas (referencia):</b> precio total de lo vendido. No es ingreso: el dinero de una venta va del comprador al vendedor; a la empresa solo le entra la comisión.</li>
        </ul>
        <Formula>Excedente = Ingresos cobrados − Gastos PAGADOS</Formula>
      </Section>
      <Section title="Las alertas (campana)">
        <ul className="list-disc pl-5 text-[13px] space-y-1">
          <li><b>Gastos pendientes de meses anteriores:</b> algo quedó sin pagar (aunque sea una quincena).</li>
          <li><b>No generan renta automática:</b> inquilinos a los que les falta un dato (renta, % de comisión, fechas) para que el sistema cree su cobro cada mes. Corrígelos en Propiedades e Inquilinos.</li>
          <li><b>Contratos por vencer (30 días):</b> inquilinos cuyo contrato termina pronto.</li>
          <li><b>Rentas pendientes este mes:</b> cobros que todavía no se han marcado como pagados.</li>
        </ul>
      </Section>
      <Section title="Gráfica anual">
        <p className="text-[13px]">Compara ingresos, gastos y excedente de los 12 meses del año elegido.</p>
      </Section>
      <Note>Distribución y Bonificaciones siempre trabajan con el excedente <b>en RD$</b> (convertido), porque no se pueden repartir monedas mezcladas.</Note>
    </>
  ),

  // ---------------------------------------------------------------- Ingresos
  rentals: (
    <>
      <Intro>En <b>Ingresos</b> se cobra: aquí aparecen las rentas de cada mes y los otros ingresos (contratos, administración…). Cuando un inquilino paga, se marca aquí y el sistema ofrece el <b>recibo</b>.</Intro>
      <Section title="Paso a paso">
        <Steps title="Cobrar una renta">
          <li>Las rentas de los inquilinos aparecen solas cada mes como <b>Pendiente</b> (no hay que crearlas).</li>
          <li>Cuando el inquilino paga, toca <Chip icon={CheckCircle2} label="" tone="green" /> en su fila y confirma.</li>
          <li>El sistema pregunta <b>«¿Generar recibo?»</b>: revisa la fecha y la forma de pago y toca <Chip icon={Printer} label="Imprimir" tone="primary" /> o <Chip icon={FileDown} label="Descargar PDF" />. Si no hace falta, «No, gracias».</li>
          <li>Al quedar pagada, se crea solo el <b>pago al propietario</b> en Gastos (renta menos nuestra comisión).</li>
        </Steps>
        <Steps title="Registrar un pago parcial (abono)">
          <li>Toca <Chip icon={Edit2} label="" /> en la renta, cambia el estado a <b>Parcial</b> y escribe lo recibido en «Pagado (parcial)».</li>
          <li>Guarda: también se ofrece el recibo, solo por el abono. Cuando pague el resto, márcala como pagada y el nuevo recibo saldrá por la diferencia.</li>
        </Steps>
        <Steps title="Registrar otro ingreso">
          <li>Toca <Chip icon={Plus} label="Nuevo ingreso" tone="primary" />, elige la categoría (Contrato de renta, Por contrato, Por administración u Otros), el monto, la moneda y la fecha.</li>
          <li>Marca <b>Ingreso recurrente</b> si se repite todos los meses: el sistema lo creará como pendiente al empezar cada mes.</li>
        </Steps>
      </Section>
      <Section title="Botones y controles">
        <Controls>
          <Periodo />
          <Ctl chip={<Chip icon={Plus} label="Nuevo ingreso" tone="primary" />}>Abre el formulario para registrar un ingreso.</Ctl>
          <Ctl chip={<Chip icon={Settings} label="Desglose contrato" />} who="Admin">Define las cuentas por pagar que nacen al cobrar un <b>Contrato de renta</b> (notario, abogado, data crédito, gestor…) y sus montos.</Ctl>
          <Ctl chip={<><Chip label="Moneda" /><Chip label="Estado" /></>}>Filtros de la tabla: ver solo RD$ o US$, y solo pendientes, parciales o pagados.</Ctl>
          <Ctl chip={<Chip icon={CheckCircle2} label="" tone="green" />}>Marca el ingreso como <b>pagado</b> (pide confirmación). Crea el pago al propietario o las cuentas del contrato, y ofrece el recibo.</Ctl>
          <Ctl chip={<Chip icon={FileDown} label="" />}>En ingresos cobrados: abre la ventana del <b>recibo</b> para imprimirlo o descargarlo otra vez.</Ctl>
          <Ctl chip={<Chip icon={MessageSquareText} label="" />}>Ver la nota del ingreso. Si está gris, no tiene nota.</Ctl>
          <Ctl chip={<Chip icon={Edit2} label="" />}>Editar el ingreso (monto, estado, fecha, agente…).</Ctl>
          <Ctl chip={<Chip icon={Trash2} label="" tone="red" />} who="Admin">Eliminar. También borra su pago al propietario o las cuentas del contrato.</Ctl>
        </Controls>
      </Section>
      <Section title="Estados">
        <ul className="list-disc pl-5 text-[13px] space-y-1">
          <li><b>Pendiente:</b> no se ha cobrado. No suma a los ingresos y sale en las alertas del Dashboard.</li>
          <li><b>Parcial:</b> se cobró una parte; solo esa parte cuenta como ingreso.</li>
          <li><b>Pagado:</b> cobrado completo.</li>
        </ul>
      </Section>
      <Section title="Reglas que conviene saber">
        <Formula>Comisión = Renta × (% del inquilino / 100) — lo que le toca a la empresa</Formula>
        <Formula>Pago al propietario = Renta − Comisión (se crea al marcar PAGADA)</Formula>
        <Formula>Contrato de renta: ingreso real = Monto − cuentas por pagar del desglose</Formula>
        <p className="text-[13px]">Si una renta vuelve a pendiente o se elimina, su pago al propietario (o las cuentas del contrato) se borran solos. El <b>agente</b> de cada renta cobrada cuenta como un cierre para sus bonificaciones.</p>
      </Section>
      <TablaComun />
    </>
  ),

  // ---------------------------------------------------------------- Recibos
  receipts: (
    <>
      <Intro><b>Recibos</b> guarda cada recibo de pago entregado a un inquilino: nombre, propiedad, monto, fecha y forma de pago. Desde aquí se buscan y se vuelven a imprimir. Es distinto del <b>Reporte a Propietario</b>, que muestra el descuento de administración.</Intro>
      <Section title="Paso a paso">
        <Steps title="Emitir un recibo">
          <li>En <b>Ingresos</b>, marca el cobro como pagado con <Chip icon={CheckCircle2} label="" tone="green" /> (o guarda un abono).</li>
          <li>En la ventana «¿Generar recibo?» revisa la <b>fecha del pago</b> y la <b>forma de pago</b>.</li>
          <li>Toca <Chip icon={Printer} label="Imprimir" tone="primary" /> para mandarlo a la impresora, o <Chip icon={FileDown} label="Descargar PDF" /> para enviarlo por WhatsApp o correo.</li>
        </Steps>
        <Steps title="Buscar un recibo viejo">
          <li>Elige el <b>inquilino</b> o la <b>propiedad</b>, o un rango de fechas.</li>
          <li>Usa <Chip icon={Printer} label="" /> o <Chip icon={FileDown} label="" /> en la fila.</li>
        </Steps>
      </Section>
      <Section title="Botones y controles">
        <Controls>
          <Ctl chip={<><Chip label="Inquilino" /><Chip label="Propiedad" /></>}>Muestra solo los recibos de esa persona o de esa propiedad.</Ctl>
          <Ctl chip={<><Chip label="Desde" /><Chip label="Hasta" /></>}>Limita por fecha de pago.</Ctl>
          <Ctl chip={<Chip icon={X} label="Quitar filtros" />}>Vuelve a mostrar todos.</Ctl>
          <Ctl chip={<Chip icon={FileDown} label="" />}>Descarga el recibo en PDF.</Ctl>
          <Ctl chip={<Chip icon={Printer} label="" />}>Lo envía a la impresora.</Ctl>
          <Ctl chip={<Chip icon={Trash2} label="" tone="red" />} who="Admin">Quita el recibo del historial. El cobro en Ingresos no cambia.</Ctl>
        </Controls>
        <p className="text-[13px]">Arriba de la tabla se ve cuántos recibos hay en el filtro y el total cobrado en RD$ y US$.</p>
      </Section>
      <Section title="Cómo se numeran">
        <ul className="list-disc pl-5 text-[13px] space-y-1">
          <li>Cada recibo lleva un número consecutivo (<b>REC-00001</b>, <b>REC-00002</b>…) y el monto escrito en letras.</li>
          <li>Si un cobro ya tiene recibo, se reimprime <b>el mismo</b>: no se gastan números.</li>
          <li>Un abono y luego el resto generan <b>dos</b> recibos, cada uno por lo que se recibió ese día.</li>
        </ul>
      </Section>
      <TablaComun />
    </>
  ),

  // ---------------------------------------------------------------- Ventas
  sales: (
    <>
      <Intro>En <b>Ingresos por Venta</b> se registra cada propiedad vendida. A la empresa solo le entra la <b>comisión</b>; el precio de venta es un dato de referencia.</Intro>
      <Section title="Paso a paso">
        <Steps title="Registrar una venta">
          <li>Toca <Chip icon={Plus} label="Nueva venta" tone="primary" />.</li>
          <li>Elige la <b>propiedad del inventario</b>: si tiene precio guardado, se propone solo con su moneda.</li>
          <li>Escribe el comprador, el agente, el precio y el <b>% de comisión</b>; el monto de la comisión se calcula solo.</li>
          <li>Si la venta se hizo con colegas, toca <Chip icon={Plus} label="Añadir colega" /> y pon el % de la comisión de cada uno.</li>
          <li>Guarda: la propiedad queda como <b>Vendida</b> en el inventario.</li>
        </Steps>
      </Section>
      <Section title="Botones y controles">
        <Controls>
          <Periodo />
          <Ctl chip={<Chip icon={Plus} label="Nueva venta" tone="primary" />}>Abre el formulario de venta.</Ctl>
          <Ctl chip={<><Chip icon={Users} label="Colegas" /><Chip icon={Plus} label="Añadir colega" /></>}>Dentro del formulario: reparte la comisión con otros corredores. Cada colega se vuelve una cuenta por pagar en Gastos.</Ctl>
          <Ctl chip={<Chip icon={Trash2} label="" tone="red" />}>Dentro del formulario, junto a un colega: lo quita del reparto.</Ctl>
          <Ctl chip={<Chip icon={Edit2} label="" />}>Editar la venta.</Ctl>
          <Ctl chip={<Chip icon={Trash2} label="" tone="red" />} who="Admin">Eliminar la venta. La propiedad vuelve a <b>Disponible</b> y las cuentas pendientes de los colegas se borran (las ya pagadas se conservan).</Ctl>
        </Controls>
      </Section>
      <Section title="Vínculo con el inventario y con la web">
        <ul className="list-disc pl-5 text-[13px] space-y-1">
          <li>La propiedad vendida <b>no se borra</b>: queda en Propiedades e Inquilinos con la etiqueta <b>Vendida</b>, con su propietario, exclusividad y notas.</li>
          <li>Si cambias la venta a otra propiedad, la anterior vuelve a Disponible (salvo que otra venta la use).</li>
          <li>La venta <b>no toca la página web</b>: si la propiedad está publicada, sigue visible hasta que la ocultes o elimines en <b>Propiedades en la web</b>.</li>
        </ul>
      </Section>
      <Section title="Cálculos">
        <Formula>Comisión = Precio × (% comisión / 100) — esto sí es ingreso</Formula>
        <Formula>Pago a cada colega = Comisión × (% del colega / 100)</Formula>
        <Formula>Neto de la empresa = Comisión − pagos a colegas</Formula>
      </Section>
      <TablaComun />
    </>
  ),

  // ---------------------------------------------------------------- Gastos
  expenses: (
    <>
      <Intro>En <b>Gastos Mensuales</b> está todo lo que la empresa paga: salarios, servicios, pagos a propietarios, bonos… Cada gasto se puede pagar en dos <b>quincenas</b> (día 15 y día 30).</Intro>
      <Section title="Paso a paso">
        <Steps title="Pagar un gasto">
          <li>Toca <Chip icon={CheckCircle2} label="" tone="green" /> en la fila: paga la <b>siguiente quincena pendiente</b> (primero la del 15, luego la del 30).</li>
          <li>La confirmación dice cuál quincena y cuánto. Si se pagó todo de una vez, usa <b>«Pagar las dos»</b>.</li>
        </Steps>
        <Steps title="Crear un gasto">
          <li>Toca <Chip icon={Plus} label="Nuevo gasto" tone="primary" />, escribe la descripción, la moneda y el monto mensual.</li>
          <li>Quincenas: si las dejas vacías se divide a la mitad; si escribes una, la otra se completa sola.</li>
          <li>Deja marcado <b>Gasto recurrente</b> solo si se repite cada mes (salarios, servicios). Quítalo para gastos de una sola vez.</li>
        </Steps>
        <Steps title="Corregir un pago marcado por error">
          <li>Toca <Chip icon={Edit2} label="" />, desmarca «Pagada» en la quincena equivocada y guarda.</li>
        </Steps>
      </Section>
      <Section title="Botones y controles">
        <Controls>
          <Periodo />
          <Ctl chip={<Chip icon={Plus} label="Nuevo gasto" tone="primary" />}>Abre el formulario de gasto.</Ctl>
          <Ctl chip={<><Chip label="Moneda" /><Chip label="Estado" /></>}>Filtros: solo RD$ o US$; y pendientes, parciales, pagados o «con algo por pagar».</Ctl>
          <Ctl chip={<Chip label="Confirma qué quincena se pagó" tone="amber" />}>Aviso arriba de la tabla: gastos que hay que revisar. Toca el nombre para abrirlo.</Ctl>
          <Ctl chip={<Chip label="Quincenas que no suman el mensual" tone="amber" />}>Gastos donde Quincena 1 + Quincena 2 no da el monto mensual. Toca el nombre para corregirlo.</Ctl>
          <Ctl chip={<Chip icon={CheckCircle2} label="" tone="green" />}>Paga la siguiente quincena (con confirmación).</Ctl>
          <Ctl chip={<Chip icon={Edit2} label="" />}>Editar: montos, quincenas pagadas y sus fechas, recurrente, notas.</Ctl>
          <Ctl chip={<Chip icon={Trash2} label="" tone="red" />} who="Admin">Eliminar el gasto.</Ctl>
          <Ctl chip={<Chip icon={Copy} label="Gasto recurrente" />}>Casilla del formulario: copia el gasto al mes siguiente automáticamente, sin pagar.</Ctl>
        </Controls>
      </Section>
      <Section title="Estados">
        <ul className="list-disc pl-5 text-[13px] space-y-1">
          <li><b>Pendiente:</b> no se ha pagado nada.</li>
          <li><b>Parcial</b> (ej. «1ª pagada · falta 2ª»): se pagó una quincena; debajo dice cuánto falta.</li>
          <li><b>Pagado:</b> se pagaron todas las quincenas.</li>
        </ul>
      </Section>
      <Section title="Gastos que crea el sistema solo">
        <p className="text-[13px]">Pago a propietario (al cobrar una renta), bono de administración, cuentas de un contrato de renta y pago a colegas de una venta. Se regeneran cada mes por su cuenta, por eso no llevan la casilla de recurrente.</p>
      </Section>
      <Section title="Cómo afecta al excedente">
        <Formula>Excedente = Ingresos − Gastos PAGADOS</Formula>
        <p className="text-[13px]">Solo resta lo que ya se pagó: si de un salario se pagó la 1ª quincena, solo esa mitad resta. Lo que falta sale como <b>Pendiente por pagar</b> y, si queda de un mes anterior, en las alertas del Dashboard.</p>
      </Section>
      <TablaComun />
    </>
  ),

  // ---------------------------------------------------------------- Distribución
  distribution: (
    <>
      <Intro><b>Distribución de Fondos</b> decide cómo se reparte el excedente del mes entre bolsas (ahorro, oficina, bonos del equipo…). Solo Admin y SuperAdmin.</Intro>
      <Section title="Paso a paso">
        <Steps title="Cambiar los porcentajes">
          <li>Escribe el % de cada categoría (o su nombre).</li>
          <li>Cuando la suma dé exactamente <b>100%</b>, se habilita <Chip icon={Save} label="Guardar cambios" tone="primary" />.</li>
        </Steps>
      </Section>
      <Section title="Botones y controles">
        <Controls>
          <Periodo />
          <Ctl chip={<Chip icon={Plus} label="Añadir" />}>Agrega una categoría nueva.</Ctl>
          <Ctl chip={<Chip icon={Trash2} label="" tone="red" />}>Elimina la categoría (no disponible en «Bonos equipo»).</Ctl>
          <Ctl chip={<Chip icon={Save} label="Guardar cambios" tone="primary" />}>Guarda la configuración (pide confirmación). Solo se activa si suma 100%.</Ctl>
          <Ctl chip={<Chip icon={RotateCcw} label="Restaurar" />}>Descarta lo que cambiaste y vuelve a lo guardado.</Ctl>
        </Controls>
      </Section>
      <Section title="Cálculo">
        <Formula>Monto de cada categoría = Excedente × (% / 100)</Formula>
        <p className="text-[13px]">Si el excedente del mes es cero o negativo, no hay nada que repartir.</p>
      </Section>
      <Note>«Bonos equipo» no se puede borrar ni renombrar porque alimenta Bonificaciones; su porcentaje sí se puede cambiar. Cada cambio queda en la bitácora.</Note>
    </>
  ),

  // ---------------------------------------------------------------- Bonificaciones
  bonuses: (
    <>
      <Intro><b>Bonificaciones</b> muestra cuánto le toca a cada agente este mes. Es solo de consulta: se calcula solo con el excedente y los cierres de cada uno.</Intro>
      <Section title="Botones y controles">
        <Controls>
          <Periodo />
        </Controls>
      </Section>
      <Section title="Cómo se calcula">
        <Formula>Pool = Excedente × (% de «Bonos equipo» en Distribución / 100)</Formula>
        <Formula>Bono del agente = Pool × (cierres del agente / cierres totales del mes)</Formula>
        <p className="text-[13px]">Un <b>cierre</b> es una renta cobrada (pagada o parcial) que tiene un agente asignado.</p>
      </Section>
      <Section title="¿Por qué alguien no tiene bono?">
        <ul className="list-disc pl-5 text-[13px] space-y-1">
          <li>El mes no tuvo excedente (salió en cero o negativo).</li>
          <li>«Bonos equipo» está en 0% en Distribución.</li>
          <li>Sus rentas no tienen agente asignado: edítalas en Ingresos y elige el agente.</li>
        </ul>
      </Section>
    </>
  ),

  // ---------------------------------------------------------------- Propiedades e Inquilinos
  properties: (
    <>
      <Intro><b>Propiedades e Inquilinos</b> es el inventario interno: propiedades, inquilinos con sus contratos y agentes. De aquí salen las rentas automáticas de cada mes. Es distinto de <b>Propiedades en la web</b>, que solo controla lo que ve el público.</Intro>
      <Section title="Paso a paso">
        <Steps title="Dar de alta un inquilino nuevo">
          <li>Si la propiedad no existe, créala en la pestaña <Chip icon={Building2} label="Propiedades" /> con su <b>propietario</b> (es el nombre que sale en el pago al dueño).</li>
          <li>En <Chip icon={Users} label="Inquilinos" /> toca <Chip icon={Plus} label="Nuevo inquilino" tone="primary" />, elige la propiedad, las fechas del contrato, la moneda, la <b>renta mensual</b>, el <b>% de comisión</b> y el <b>día de cobro</b>.</li>
          <li>Opcional: elige el <b>administrador / responsable</b> (cobra el bono de administración).</li>
          <li>Desde ese mes, la renta aparece sola en Ingresos como pendiente.</li>
        </Steps>
      </Section>
      <Section title="Botones y controles">
        <Controls>
          <Ctl chip={<><Chip icon={Building2} label="Propiedades" /><Chip icon={Users} label="Inquilinos" /><Chip icon={UserCheck} label="Agentes" /></>}>Pestañas: cambian la tabla y el botón de crear.</Ctl>
          <Ctl chip={<Chip icon={Plus} label="Nueva propiedad" tone="primary" />}>Agrega una propiedad al inventario: tipo, estado, dirección, propietario, moneda, renta sugerida, precio de venta, exclusividad y notas.</Ctl>
          <Ctl chip={<><Chip label="Todas" /><Chip label="Disponibles" /><Chip label="Rentadas" /><Chip label="Vendidas" /></>}>Filtros de la pestaña Propiedades, con el conteo de cada grupo.</Ctl>
          <Ctl chip={<Chip icon={Plus} label="Nuevo inquilino" tone="primary" />}>Agrega un inquilino con su contrato y renta.</Ctl>
          <Ctl chip={<Chip icon={Settings} label="Bono administración" />} who="Admin">Monto en RD$ que gana el administrador por cada inquilino que lleva.</Ctl>
          <Ctl chip={<Chip icon={Plus} label="Nuevo agente" tone="primary" />}>Agrega un agente (quien cierra rentas y ventas).</Ctl>
          <Ctl chip={<Chip icon={Edit2} label="Corregir" />}>En el panel <b>Calidad de datos</b>: abre el registro al que le falta algo para que el sistema trabaje solo.</Ctl>
          <Ctl chip={<Chip icon={Edit2} label="" />}>Editar el registro.</Ctl>
          <Ctl chip={<Chip icon={Power} label="" tone="amber" />}>Agentes: desactivar / activar. Un agente inactivo no aparece en los formularios pero conserva su historial.</Ctl>
          <Ctl chip={<Chip icon={Trash2} label="" tone="red" />} who="Admin">Eliminar. Mejor desactivar o marcar Vendida si hay historial.</Ctl>
          <Ctl chip={<Chip icon={UserCog} label="Administrador / responsable" />}>Campo del inquilino: el colaborador que lo administra.</Ctl>
        </Controls>
      </Section>
      <Section title="Estado, moneda y exclusividad de una propiedad">
        <ul className="list-disc pl-5 text-[13px] space-y-1">
          <li><b>Estado:</b> Disponible, Rentada o Vendida. Registrar una venta la marca como Vendida sola; nunca se borra del inventario.</li>
          <li><b>Moneda:</b> la renta sugerida y el precio de venta se ven en RD$ o US$ según la propiedad. Al asignarle un inquilino nuevo, su renta empieza en esa moneda.</li>
          <li><b>Exclusividad:</b> marca si la tenemos en exclusiva y hasta cuándo. Vencida se ve en rojo.</li>
        </ul>
      </Section>
      <Section title="Lo que el sistema hace solo">
        <Formula>Renta del mes = renta mensual del inquilino (pendiente, en su día de cobro)</Formula>
        <Formula>Pago al propietario = Renta − Comisión (al cobrar la renta)</Formula>
        <Formula>Bono de administración = RD$ por inquilino × inquilinos que administra</Formula>
        <p className="text-[13px]">Las rentas solo se crean dentro de las fechas del contrato y si el inquilino tiene renta y % de comisión. Un contrato que vence en 30 días se marca en amarillo y sale en el Dashboard.</p>
      </Section>
      <TablaComun />
    </>
  ),

  // ---------------------------------------------------------------- Reporte a Propietario
  ownerReports: (
    <>
      <Intro><b>Reporte a Propietario</b> es el informe para el dueño de un inmueble: la renta cobrada, los gastos hechos en su propiedad y cuánto le queda neto. Sale en PDF con el formato de la empresa.</Intro>
      <Section title="Paso a paso">
        <Steps title="Hacer un reporte">
          <li>Toca <Chip icon={Plus} label="Nuevo reporte" tone="primary" /> y elige el inquilino: se llenan solos el propietario, la dirección, la renta y la moneda (todo se puede cambiar).</li>
          <li>Pon el periodo (desde / hasta), la fecha de pago y la cuenta del propietario.</li>
          <li>Agrega cada gasto con <Chip icon={Plus} label="Agregar gasto" />: fecha, forma de pago, descripción, a quién se pagó y monto.</li>
          <li>Toca <Chip icon={FileDown} label="Guardar y PDF" tone="primary" />: se guarda y se descarga listo para entregar.</li>
        </Steps>
      </Section>
      <Section title="Botones y controles">
        <Controls>
          <Ctl chip={<Chip icon={Plus} label="Nuevo reporte" tone="primary" />}>Abre un reporte en blanco.</Ctl>
          <Ctl chip={<Chip icon={Plus} label="Agregar gasto" />}>Añade un renglón de gasto. El acumulado se calcula solo.</Ctl>
          <Ctl chip={<Chip icon={X} label="" tone="red" />}>Quita ese renglón.</Ctl>
          <Ctl chip={<Chip icon={FileDown} label="Guardar y PDF" tone="primary" />}>Guarda el reporte y descarga el PDF.</Ctl>
          <Ctl chip={<Chip icon={FileDown} label="" />}>En la tabla: vuelve a descargar el PDF de un reporte guardado.</Ctl>
          <Ctl chip={<Chip icon={Edit2} label="" />}>Editar el reporte.</Ctl>
          <Ctl chip={<Chip icon={Trash2} label="" tone="red" />} who="Admin">Eliminar el reporte.</Ctl>
        </Controls>
      </Section>
      <Section title="Cálculo">
        <Formula>Neto a entregar = Renta cobrada − Total de gastos</Formula>
        <p className="text-[13px]">Si los gastos superan la renta, el PDF lo muestra como <b>Saldo a favor de Jireh</b>.</p>
      </Section>
      <Note>Este reporte es informativo: no crea ingresos ni gastos ni cambia el Dashboard. Para el comprobante que se le da al inquilino, usa <b>Recibos</b>.</Note>
      <TablaComun />
    </>
  ),

  // ---------------------------------------------------------------- Propiedades en la web
  webProps: (
    <>
      <Intro><b>Propiedades en la web</b> controla lo que el público ve en <b>jireh-realestate.vercel.app</b>. Es independiente del inventario interno: agregar, ocultar o eliminar aquí no cambia Propiedades e Inquilinos, y vender una propiedad no la quita de la web.</Intro>
      <Section title="Paso a paso">
        <Steps title="Publicar una propiedad">
          <li>Toca <Chip icon={Plus} label="Nueva propiedad" tone="primary" /> y luego <Chip icon={ImagePlus} label="Agregar fotos" />.</li>
          <li>La <b>primera foto es la portada</b>: usa <Chip icon={Star} label="" /> para elegir otra, o las flechas para ordenarlas.</li>
          <li>Llena título, operación (venta / renta / en planos), tipo, ciudad, sector, precio y detalles.</li>
          <li>Deja el estado en <b>Publicada</b> y guarda. Sale en la web en menos de un minuto.</li>
        </Steps>
        <Steps title="Sacar varias de la web a la vez">
          <li>Marca las casillas de la izquierda (o la de arriba para toda la página).</li>
          <li>En la barra oscura toca <Chip icon={EyeOff} label="Ocultar" /> o <Chip icon={Trash2} label="Eliminar" tone="red" />.</li>
        </Steps>
      </Section>
      <Section title="Botones y controles">
        <Controls>
          <Ctl chip={<Chip icon={Plus} label="Nueva propiedad" tone="primary" />}>Abre el formulario de una propiedad para la web.</Ctl>
          <Ctl chip={<><Chip label="Todas" /><Chip label="Publicadas" /><Chip label="Ocultas" /><Chip label="Vendidas / alquiladas" /></>}>Filtros por estado, con su conteo.</Ctl>
          <Ctl chip={<Chip icon={CheckSquare} label="Casillas" />}>Seleccionar varias. Aparece una barra con <b>Publicar</b>, <b>Ocultar</b>, <b>Eliminar</b> y <b>Quitar selección</b>.</Ctl>
          <Ctl chip={<Chip icon={ExternalLink} label="" />}>Abre la propiedad tal como la ve el público.</Ctl>
          <Ctl chip={<><Chip icon={EyeOff} label="" /><Chip icon={Eye} label="" /></>}>Ocultar de la web (queda como borrador) o volver a publicar.</Ctl>
          <Ctl chip={<Chip icon={Edit2} label="" />}>Editar datos y fotos.</Ctl>
          <Ctl chip={<Chip icon={Trash2} label="" tone="red" />} who="Admin">Elimina la propiedad y sus fotos <b>para siempre</b>. Si solo quieres sacarla, usa Ocultar.</Ctl>
          <Ctl chip={<><Chip icon={ImagePlus} label="Agregar fotos" /><Chip icon={Star} label="" /><Chip icon={ChevronLeft} label="" /><Chip icon={ChevronRight} label="" /><Chip icon={X} label="" /></>}>En el formulario: subir fotos, elegir portada, mover a la izquierda o derecha, quitar una foto.</Ctl>
          <Ctl chip={<Chip label="Añadir" />}>Agrega una característica que no está en la lista (ej. «Jacuzzi»).</Ctl>
          <Ctl chip={<Chip label="Guardar y agregar otra" />}>Guarda y deja el formulario listo para la siguiente.</Ctl>
          <Ctl chip={<Chip icon={Globe} label="Ver cómo se ve en la web" />}>Abre la página pública en otra pestaña.</Ctl>
        </Controls>
      </Section>
      <Section title="Estados">
        <ul className="list-disc pl-5 text-[13px] space-y-1">
          <li><b>Publicada:</b> se ve en la web.</li>
          <li><b>Oculta:</b> borrador; no se ve pero no se pierde nada.</li>
          <li><b>Vendida / alquilada:</b> sale de la web y suma al contador de negocios cerrados.</li>
        </ul>
      </Section>
      <Note>Las fotos se comprimen solas. Las del iPhone en formato HEIC no se pueden leer: en Ajustes → Cámara → Formatos, elige «Más compatible». «Precio a consultar» publica sin precio visible.</Note>
      <TablaComun />
    </>
  ),

  // ---------------------------------------------------------------- Reportes
  reports: (
    <>
      <Intro><b>Reportes</b> arma el resumen financiero de un mes, un año o un rango de meses, y lo descarga en PDF o Excel.</Intro>
      <Section title="Paso a paso">
        <Steps>
          <li>Elige el modo: <b>Mes específico</b>, <b>Año completo</b> o <b>Rango de meses</b>, y las fechas.</li>
          <li>Toca <Chip label="Generar" tone="primary" /> para ver el resumen en pantalla.</li>
          <li>Descárgalo con <Chip icon={FileText} label="PDF" /> o <Chip icon={FileSpreadsheet} label="Excel" />.</li>
        </Steps>
      </Section>
      <Section title="Botones y controles">
        <Controls>
          <Ctl chip={<Chip label="Mes / Año / Rango" />}>Qué periodo abarca el reporte.</Ctl>
          <Ctl chip={<Chip label="Generar" tone="primary" />}>Calcula el reporte con lo elegido.</Ctl>
          <Ctl chip={<Chip icon={FileText} label="PDF" />}>Primera página con el resumen por mes; luego el detalle de cada mes (rentas, ventas, gastos, bonificaciones).</Ctl>
          <Ctl chip={<Chip icon={FileSpreadsheet} label="Excel" />}>Hojas separadas: Resumen, Rentas, Ventas, Gastos, Bonificaciones y Distribución.</Ctl>
        </Controls>
      </Section>
      <Section title="De dónde salen los totales">
        <Formula>Ingresos = lo cobrado en el periodo (rentas + comisiones de venta)</Formula>
        <Formula>Gastos = lo pagado en el periodo</Formula>
        <Formula>Excedente = Ingresos − Gastos</Formula>
      </Section>
    </>
  ),

  // ---------------------------------------------------------------- Usuarios
  users: (
    <>
      <Intro><b>Usuarios</b> maneja quién entra al sistema y qué puede hacer, y muestra la bitácora de lo que se ha hecho. Solo Admin y SuperAdmin.</Intro>
      <Section title="Botones y controles">
        <Controls>
          <Ctl chip={<Chip icon={Plus} label="Nuevo usuario" tone="primary" />}>Crea una cuenta: nombre, usuario, contraseña y rol.</Ctl>
          <Ctl chip={<Chip icon={Edit2} label="" />}>Editar nombre, rol o contraseña. Si dejas la contraseña vacía, se mantiene la actual.</Ctl>
          <Ctl chip={<><Chip icon={Lock} label="" tone="amber" /><Chip icon={Unlock} label="" tone="green" /></>}>Bloquear (no puede iniciar sesión) o desbloquear. Nadie puede bloquearse a sí mismo.</Ctl>
          <Ctl chip={<Chip icon={Trash2} label="" tone="red" />}>Eliminar la cuenta. Su historial en la bitácora se conserva.</Ctl>
          <Ctl chip={<Chip icon={KeyRound} label="Cambiar contraseña" />}>En el menú de la izquierda, abajo: cada quien cambia su propia contraseña.</Ctl>
          <Ctl chip={<Chip icon={LogOut} label="Salir" />}>En el menú de la izquierda: cerrar sesión.</Ctl>
        </Controls>
      </Section>
      <Section title="Roles">
        <ul className="list-disc pl-5 text-[13px] space-y-1">
          <li><b>SuperAdmin:</b> todo, incluido Respaldo. Puede crear otros SuperAdmin.</li>
          <li><b>Admin:</b> todo menos Respaldo; puede eliminar registros y configurar distribución, desgloses y bonos. No puede tocar a un SuperAdmin.</li>
          <li><b>Operativo:</b> el trabajo diario: ingresos, cobros, recibos, ventas, gastos, propiedades. No puede eliminar.</li>
        </ul>
      </Section>
      <Section title="Bitácora de actividad">
        <p className="text-[13px]">Muestra los últimos 50 movimientos: inicios de sesión, lo que se creó, editó, cobró o eliminó, recibos emitidos y cambios de configuración, con quién y cuándo.</p>
      </Section>
    </>
  ),

  // ---------------------------------------------------------------- Respaldo
  backup: (
    <>
      <Intro><b>Respaldo</b> guarda y recupera todos los datos del sistema. Solo SuperAdmin. Además, cada noche se hace un respaldo automático en un repositorio privado.</Intro>
      <Section title="Botones y controles">
        <Controls>
          <Ctl chip={<Chip icon={Download} label="Descargar respaldo" tone="primary" />}>Descarga un archivo <code>.json</code> con todos los datos. Guárdalo en un lugar seguro.</Ctl>
          <Ctl chip={<Chip icon={Upload} label="Seleccionar archivo" />}><b>Restaura</b> un respaldo: antes de aplicar muestra qué trae y pide confirmación. <b>Reemplaza todo</b> lo actual por lo del archivo; si algo falla, no cambia nada.</Ctl>
          <Ctl chip={<Chip icon={ShieldCheck} label="Ejecutar validación" />}>Revisa que los datos estén sanos (por ejemplo, rentas que apuntan a inquilinos borrados) y muestra un informe.</Ctl>
          <Ctl chip={<Chip icon={Wrench} label="Reparar referencias huérfanas" />}>Dentro del informe: limpia los vínculos rotos que encontró la validación.</Ctl>
          <Ctl chip={<Chip icon={Sparkles} label="Generar datos de ejemplo" />}>Crea 6 meses de datos ficticios para practicar. <b>No usar con datos reales.</b></Ctl>
          <Ctl chip={<Chip icon={Trash2} label="Limpiar datos" tone="red" />}>Borra rentas, ventas, gastos, propiedades, inquilinos y bitácora. Conserva usuarios, agentes y la configuración.</Ctl>
        </Controls>
      </Section>
      <Note>Antes de restaurar o limpiar, descarga un respaldo. Restaurar y limpiar no se pueden deshacer.</Note>
    </>
  )
};

export default HELP;
