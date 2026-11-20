// =====================================================================
// Caja · MODO DEMOSTRACIÓN
// Reemplaza la conexión a Supabase por una base de datos de ejemplo en
// memoria. Nada sale del navegador y nada toca la caja real.
// =====================================================================
(function () {
  'use strict';

  // ---------- 1. Almacenamiento aislado ----------
  // La demo vive en el mismo sitio que la app real: si usara el mismo
  // localStorage podría mezclar datos (por ejemplo, la cola de ventas sin
  // internet). Por eso usa una memoria propia que se borra al recargar.
  const memoria = new Map();
  const almacen = {
    getItem: k => (memoria.has(String(k)) ? memoria.get(String(k)) : null),
    setItem: (k, v) => { memoria.set(String(k), String(v)); },
    removeItem: k => { memoria.delete(String(k)); },
    clear: () => memoria.clear(),
    key: i => [...memoria.keys()][i] ?? null,
    get length() { return memoria.size; },
  };
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: () => almacen }); } catch (e) { /* el navegador no lo permite: se usa igual la memoria vía local.* */ }
  almacen.setItem('caja:metaDiaria', '60'); almacen.setItem('metaDiaria', '60');
  almacen.setItem('caja:miYape', '987654321');
  almacen.setItem('caja:ultimoRespaldo', JSON.stringify({ fecha: new Date(Date.now() - 2 * 864e5).toISOString(), total: 1840 }));
  almacen.setItem('caja:ultimoConteo', JSON.stringify({ fecha: new Date(Date.now() - 5 * 864e5).toISOString(), cuadro: false }));

  // ---------- 2. Utilidades ----------
  let semilla = 20261119;
  const azar = () => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla / 4294967296; };
  const elegir = pesos => { const t = pesos.reduce((a, p) => a + p[1], 0); let r = azar() * t; for (const [v, w] of pesos) { if ((r -= w) <= 0) return v; } return pesos[0][0]; };
  const r2 = n => Math.round(n * 100) / 100;
  const OFF = 5 * 3600e3; // Lima = UTC-5
  const fechaLima = ms => new Date(ms - OFF).toISOString().slice(0, 10);
  const enLima = (dia, h, m) => Date.parse(`${dia}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-05:00`);
  const iso = ms => new Date(ms).toISOString();
  const ahora = Date.now(), hoy = fechaLima(ahora);
  const diaMenos = n => fechaLima(Date.parse(hoy + 'T12:00:00-05:00') - n * 864e5);
  let sec = 0; const uid = p => p + (++sec).toString(36);

  // ---------- 3. Catálogo ----------
  const MARCAS = [
    // id, nombre, costo por unidad, precio unidad, precio paquete (null = no se vende entero), stock mínimo, peso en ventas, marca, variante, categoría, unidades por paquete, código en factura, nombre en factura
    ['p1', 'Pall Mall SUNS', 0.65, 1.00, 18.00, 20, 30, 'Pall Mall', 'SUNS', 'k1', 20, '460069', 'CIG PALL MALL SUNS XL UND CAJT 20 P'],
    ['p2', 'Pall Mall BOOST', 0.65, 1.00, 18.00, 20, 28, 'Pall Mall', 'BOOST', 'k1', 20, '460066', 'CIG PALL MALL BOOST UND CAJT 20 PZA'],
    ['p3', 'Pall Mall BLUE', 0.64, 1.00, 18.00, 20, 20, 'Pall Mall', 'BLUE', 'k1', 20, '460022', 'CIG PALL MALL BLUE UND CAJT 20 PZA'],
    ['p4', 'Lucky Strike TWIST', 0.95, 1.50, 25.00, 20, 14, 'Lucky Strike', 'TWIST', 'k1', 20, '460018', 'CIG LUCK STRK TWIST UND CAJT 20 PZA'],
    ['p6', 'Fini Ositos', 1.84, 2.50, null, 12, 9, 'Fini', 'Ositos', 'k2', 12, '001292', 'GOMAS FINI OSITOS (CJX12UN) UNX80G'],
    ['p7', 'Fini Gusanos ácidos', 1.84, 2.50, null, 12, 7, 'Fini', 'Gusanos ácidos', 'k2', 12, '001289', 'GOMAS FINI GUSANOS ACIDOS(CJX12UN) UNX90G'],
  ];
  const FAC = Object.fromEntries(MARCAS.map(m => [m[0], m[10]]));
  const productos = MARCAS.map(([id, nombre, , , , stock_minimo, , marca, variante, cat, , cod, nf]) => ({ id, nombre, sku: id.toUpperCase(), activo: true, stock_minimo, categoria_id: cat,
    unidad_base_id: cat === 'k2' ? 4 : 1, marca, variante, codigo_factura: cod, nombre_factura: nf }));
  const presentaciones = [];
  MARCAS.forEach(([id, nombre, costo, pu, pc, , , , , cat, fac]) => {
    const prod = productos.find(p => p.id === id);
    presentaciones.push({ id: id + 'u', producto_id: id, nombre: 'Unidad', factor: 1, es_base: true, se_compra: false, se_vende: true, activo: true, codigo_barras: null, productos: prod });
    presentaciones.push({ id: id + 'c', producto_id: id, nombre: (cat === 'k2' ? 'Caja x ' : 'Cajetilla x ') + fac, factor: fac, es_base: false, se_compra: true, se_vende: pc != null, activo: true, codigo_barras: '77' + id.slice(1).padStart(11, '0'), productos: prod });
  });
  const precio = {}; MARCAS.forEach(([id, , , pu, pc]) => { precio[id + 'u'] = pu; if (pc != null) precio[id + 'c'] = pc; });
  const costoBase = Object.fromEntries(MARCAS.map(m => [m[0], m[2]]));

  const metodos = [
    { id: 1, codigo: 'EFECTIVO', nombre: 'Efectivo', activo: true }, { id: 2, codigo: 'TARJETA_DEBITO', nombre: 'Tarjeta de débito de la empresa', activo: true },
    { id: 3, codigo: 'TRANSFERENCIA', nombre: 'Transferencia', activo: true }, { id: 4, codigo: 'YAPE', nombre: 'Yape', activo: true }, { id: 5, codigo: 'PLIN', nombre: 'Plin', activo: true },
  ];
  const cuentas = [
    { id: 'cf1', nombre: 'Caja principal', tipo: 'EFECTIVO', usa_sesiones: true, activo: true, creado_en: '2026-10-01' },
    { id: 'cf2', nombre: 'Cuenta de la empresa', tipo: 'BANCO', usa_sesiones: false, activo: true, creado_en: '2026-10-01' },
    { id: 'cf3', nombre: 'Yape', tipo: 'BILLETERA', usa_sesiones: false, activo: true, creado_en: '2026-10-01' },
    { id: 'cf4', nombre: 'Plin', tipo: 'BILLETERA', usa_sesiones: false, activo: true, creado_en: '2026-10-01' },
  ];
  const clientes = [
    { id: 'cl0', nombre: 'Cliente varios', es_generico: true, permite_credito: false, activo: true },
    { id: 'cl1', nombre: 'Rosa Pérez', telefono: '987111222', permite_credito: true, limite_credito: 100, activo: true },
    { id: 'cl2', nombre: 'Don Julio Ramírez', telefono: null, permite_credito: true, limite_credito: 80, activo: true },
    { id: 'cl3', nombre: 'Carlos Vela', telefono: '956333444', permite_credito: true, limite_credito: 60, activo: true },
  ];
  const proveedores = [
    { id: 'pv1', razon_social: 'Distribuidora Amazónica SAC', tipo_documento: 'RUC', numero_documento: '20600000011', telefono: '987000111', activo: true },
    { id: 'pv2', razon_social: 'Mayorista Ucayali EIRL', tipo_documento: 'RUC', numero_documento: '20600000022', telefono: '987000222', activo: true },
    { id: 'pv3', razon_social: 'Dulcería Selva SAC', tipo_documento: 'RUC', numero_documento: '20600000033', telefono: '987000333', activo: true },
  ];
  const catGasto = [{ id: 'g1', nombre: 'Transporte', tipo: 'OPERATIVO', activo: true }, { id: 'g2', nombre: 'Bolsas y empaques', tipo: 'OPERATIVO', activo: true }, { id: 'g3', nombre: 'Recargas y teléfono', tipo: 'OPERATIVO', activo: true }];
  const motivos = [
    { id: 1, codigo: 'DANADO', nombre: 'Producto dañado', tipo_aplicable: 'MERMA', activo: true },
    { id: 5, codigo: 'CONTEO_SOBRANTE', nombre: 'Sobrante en conteo físico', tipo_aplicable: 'AJUSTE_POSITIVO', activo: true },
    { id: 6, codigo: 'CONTEO_FALTANTE', nombre: 'Faltante en conteo físico', tipo_aplicable: 'AJUSTE_NEGATIVO', activo: true },
  ];

  // ---------- 4. Historia: compras, ventas, gastos ----------
  const DIAS = 21;
  const compras = [], ventasRaw = [], gastos = [];
  // Compras: dos proveedores; Distribuidora Amazónica subió Pall Mall SUNS hace poco
  const costoCompra = (pid, prov, dia) => {
    let c = costoBase[pid] * FAC[pid];
    if (prov === 'pv2') c *= 0.985;
    if (pid === 'p1' && prov === 'pv1' && dia >= diaMenos(6)) c *= 1.045;
    return r2(c);
  };
  // Ventas por día, con horas pico al mediodía y en la tarde
  const HORAS = [[8, 2], [9, 3], [10, 4], [11, 6], [12, 9], [13, 8], [14, 5], [15, 4], [16, 5], [17, 8], [18, 10], [19, 9], [20, 7], [21, 4], [22, 2]];
  const marcaPeso = MARCAS.map(m => [m[0], m[6]]);
  for (let n = DIAS - 1; n >= 0; n--) {
    const dia = diaMenos(n), dow = new Date(dia + 'T12:00:00-05:00').getUTCDay();
    const cuantas = Math.round((dow === 5 || dow === 6 ? 30 : 21) + azar() * 8);
    for (let i = 0; i < cuantas; i++) {
      const h = elegir(HORAS), m = Math.floor(azar() * 60), ms = enLima(dia, h, m);
      if (ms > ahora - 60e3) continue;
      const pid = elegir(marcaPeso), caj = precio[pid + 'c'] != null && azar() < 0.16;
      const lineas = [{ presentacion_id: pid + (caj ? 'c' : 'u'), cantidad: caj ? 1 : elegir([[1, 5], [2, 3], [3, 2], [5, 1]]) }];
      if (azar() < 0.12) { const p2 = elegir(marcaPeso); lineas.push({ presentacion_id: p2 + 'u', cantidad: 1 }); }
      ventasRaw.push({ ms, lineas, medio: elegir([[1, 52], [4, 38], [5, 10]]), cliente: 'cl0', condicion: 'CONTADO' });
    }
    if (n % 2 === 0) gastos.push({ dia, cat: 'g1', desc: 'Pasaje para compras', monto: 5 });
    if (n % 7 === 3) gastos.push({ dia, cat: 'g2', desc: 'Bolsitas', monto: 4.5 });
    if (n % 10 === 1) gastos.push({ dia, cat: 'g3', desc: 'Recarga del celular', monto: 10 });
  }
  // Fiados pendientes
  [[12, 'cl1', 'p1c', 2], [5, 'cl1', 'p1c', 1], [4, 'cl2', 'p2c', 1], [1, 'cl3', 'p3c', 1]].forEach(([n, cli, pres, cant]) => {
    ventasRaw.push({ ms: enLima(diaMenos(n), 18, 20), lineas: [{ presentacion_id: pres, cantidad: cant }], medio: null, cliente: cli, condicion: 'CREDITO', vence: diaMenos(n - 7) });
  });
  ventasRaw.sort((a, b) => a.ms - b.ms);
  // Compras: se calculan a partir de lo vendido para que el stock nunca quede negativo
  // y termine con algunas marcas por reponer.
  const vendido = {}; MARCAS.forEach(([id]) => vendido[id] = 0);
  ventasRaw.forEach(v => v.lineas.forEach(l => { const pr = presentaciones.find(p => p.id === l.presentacion_id); vendido[pr.producto_id] += l.cantidad * pr.factor; }));
  const FINAL = { p1: 57, p2: 59, p3: 48, p4: 28, p6: 30, p7: 20 }; // stock con el que termina la demo (como el negocio real)
  const TANDAS = [[20, 'pv1', 0.46, 'k1'], [14, 'pv2', 0.2, 'k1'], [9, 'pv2', 0.14, 'k1'], [6, 'pv1', 0.1, 'k1'], [2, 'pv1', 0.1, 'k1'], [19, 'pv3', 0.45, 'k2'], [9, 'pv3', 0.3, 'k2'], [3, 'pv3', 0.25, 'k2']];
  const VENCE = { 'pv3-19': 2, 'pv3-9': 25, 'pv3-3': 6 }; // días hasta el vencimiento desde hoy (negativo = vence lejos)
  TANDAS.forEach(([n, prov, parte, cat], k) => {
    const dia = diaMenos(n), mismas = TANDAS.filter(t => t[3] === cat), j = mismas.findIndex(t => t[0] === n && t[1] === prov);
    const lineas = MARCAS.filter(m => m[9] === cat).map(([pid]) => {
      const total = Math.ceil((vendido[pid] + FINAL[pid]) / FAC[pid]);
      const antes = mismas.slice(0, j).reduce((s, t) => s + Math.round(total * t[2]), 0);
      const cant = j === mismas.length - 1 ? total - antes : Math.round(total * parte);
      const ve = VENCE[prov + '-' + n];
      return { presentacion_id: pid + 'c', producto_id: pid, cantidad: cant, costo_unitario: costoCompra(pid, prov, dia), vence: ve === undefined ? null : diaMenos(ve < 0 ? ve : -ve) };
    }).filter(l => l.cantidad > 0);
    compras.push({ id: 'cp' + k, proveedor_id: prov, dia, ms: enLima(dia, 9, 30), serie: { pv1: 'F001', pv2: 'F002', pv3: 'B001' }[prov], numero: String(1200 + k * 37), condicion: k === 4 ? 'CREDITO' : 'CONTADO', lineas });
  });

  // ---------- 5. Vistas derivadas (se recalculan tras cada venta) ----------
  const D = {};
  // Boletas emitidas (se conservan entre recálculos)
  const boletas = [], boletaVentas = [];
  let boletasSembradas = false;
  function derivar() {
    // Costo promedio y stock por producto, en orden cronológico
    const ev = [];
    compras.forEach(c => c.lineas.forEach(l => ev.push({ ms: c.ms, tipo: 'C', pid: l.producto_id, cant: l.cantidad * FAC[l.producto_id], costo: l.costo_unitario / FAC[l.producto_id], c })));
    ventasRaw.forEach(v => v.lineas.forEach(l => { const pr = presentaciones.find(p => p.id === l.presentacion_id); ev.push({ ms: v.ms, tipo: 'V', pid: pr.producto_id, cant: l.cantidad * pr.factor, v, l }); }));
    ev.push({ ms: enLima(diaMenos(5), 21, 30), tipo: 'A', pid: 'p2', cant: 3 }); // faltante del último conteo
    ev.sort((a, b) => a.ms - b.ms);
    const st = {}, kardex = [];
    MARCAS.forEach(([id]) => st[id] = { q: 0, cp: costoBase[id] });
    ev.forEach(e => {
      const s = st[e.pid];
      if (e.tipo === 'C') { s.cp = (s.q * s.cp + e.cant * e.costo) / (s.q + e.cant); s.q += e.cant; }
      else { e.costoU = s.cp; s.q -= e.cant; }
      kardex.push({ producto_id: e.pid, producto: productos.find(p => p.id === e.pid).nombre, fecha: iso(e.ms), secuencia: kardex.length, tipo: { C: 'COMPRA', V: 'VENTA', A: 'AJUSTE_NEGATIVO' }[e.tipo],
        cantidad_base: e.tipo === 'C' ? e.cant : -e.cant, costo_unitario: r2(e.tipo === 'C' ? e.costo : s.cp), costo_total: r2((e.tipo === 'C' ? 1 : -1) * e.cant * (e.costo || s.cp)),
        saldo_cantidad: s.q, saldo_valor: r2(s.q * s.cp), costo_promedio: r2(s.cp) });
    });

    // Ventas
    let num = 0;
    const ventas = [], vtot = [], vdet = [], lineasRent = [], movFin = [], cxc = [];
    ventasRaw.forEach(v => {
      const id = v.id || (v.id = uid('v')); num++;
      let total = 0, costo = 0;
      const dets = v.lineas.map((l, i) => {
        const pr = presentaciones.find(p => p.id === l.presentacion_id);
        const pu = l.precio_unitario ?? precio[pr.id], sub = r2(pu * l.cantidad);
        const evt = ev.find(e => e.l === l), cu = evt ? evt.costoU : costoBase[pr.producto_id];
        const ct = r2(cu * l.cantidad * pr.factor);
        total += sub; costo += ct;
        lineasRent.push({ fecha: fechaLima(v.ms), producto_id: pr.producto_id, presentacion_id: pr.id, cantidad_base: l.cantidad * pr.factor, venta_neta: sub, costo: ct });
        return { id: id + 'd' + i, venta_id: id, linea: i + 1, cantidad: l.cantidad, precio_unitario: pu, subtotal: sub, costo_total: ct, presentacion_id: pr.id };
      });
      total = r2(total); costo = r2(costo);
      const cli = clientes.find(c => c.id === v.cliente);
      const doc = 'T001-' + String(num).padStart(6, '0');
      const cobrado = v.condicion === 'CONTADO' ? total : 0;
      ventas.push({ id, fecha: iso(v.ms), estado: 'EMITIDA', observaciones: v.obs || null, origen: v.obs === 'Venta registrada en el conteo físico' ? 'CONTEO' : 'CAJA', venta_detalles: dets.map(d => ({ subtotal: d.subtotal, costo_total: d.costo_total, presentacion_id: d.presentacion_id, cantidad: d.cantidad, cantidad_base: r2(d.cantidad * (presentaciones.find(x => x.id === d.presentacion_id)?.factor || 1)) })) });
      vdet.push(...dets);
      vtot.push({ venta_id: id, documento: doc, fecha: iso(v.ms), cliente_id: cli.id, cliente: cli.nombre, condicion: v.condicion, total, costo_ventas: costo, importe_devuelto: 0, costo_devuelto: 0,
        estado: 'EMITIDA', saldo: r2(total - cobrado), cobros_netos: cobrado, fecha_vencimiento: v.vence || null });
      if (v.medio) movFin.push({ id: uid('mf'), fecha: iso(v.ms), tipo: 'COBRO_VENTA', monto: total, metodo_pago_id: v.medio, cuenta_financiera_id: { 1: 'cf1', 4: 'cf3', 5: 'cf4' }[v.medio], descripcion: 'Cobro ' + doc });
      if (v.condicion === 'CREDITO') cxc.push({ venta_id: id, documento: doc, fecha: iso(v.ms), cliente_id: cli.id, cliente: cli.nombre, total, importe_devuelto: 0, cobros_netos: 0, saldo: total,
        fecha_vencimiento: v.vence, dias_vencido: Math.max(0, Math.floor((Date.parse(hoy) - Date.parse(v.vence)) / 864e5)) });
    });

    // Gastos y compras como movimientos de dinero
    const gastosV = gastos.map((g, i) => ({ id: 'gs' + i, fecha: g.dia, descripcion: g.desc, monto: g.monto, estado: 'REGISTRADO', categoria_gasto_id: g.cat, metodo_pago_id: 1,
      categorias_gasto: { nombre: catGasto.find(c => c.id === g.cat).nombre, tipo: 'OPERATIVO' } }));
    gastos.forEach(g => movFin.push({ id: uid('mf'), fecha: iso(enLima(g.dia, 10, 0)), tipo: 'PAGO_GASTO', monto: -g.monto, metodo_pago_id: 1, cuenta_financiera_id: 'cf1', descripcion: g.desc }));
    const compDet = [], compTot = [];
    compras.forEach(c => {
      let tot = 0;
      c.lineas.forEach((l, i) => { const imp = r2(l.cantidad * l.costo_unitario); tot += imp;
        compDet.push({ id: c.id + 'd' + i, compra_id: c.id, linea: i + 1, presentacion_id: l.presentacion_id, cantidad: l.cantidad, factor_conversion: FAC[l.producto_id], costo_unitario: l.costo_unitario, fecha_vencimiento: l.vence || null, importe_neto: imp, igv_monto: 0,
          costo_total: imp, cantidad_base: l.cantidad * FAC[l.producto_id], costo_unitario_base: +(l.costo_unitario / FAC[l.producto_id]).toFixed(6), compras: { proveedor_id: c.proveedor_id, fecha_emision: c.dia, fecha_ingreso: iso(c.ms), estado: 'REGISTRADA' } }); });
      tot = r2(tot);
      const prov = proveedores.find(p => p.id === c.proveedor_id);
      compTot.push({ compra_id: c.id, proveedor_id: c.proveedor_id, proveedor: prov.razon_social, fecha_emision: c.dia, fecha_ingreso: iso(c.ms), serie: c.serie, numero: c.numero, condicion: c.condicion,
        fecha_vencimiento: c.condicion === 'CREDITO' ? diaMenos(-13) : null, estado: 'REGISTRADA', importe_lineas: tot, igv: 0, total: tot, importe_devuelto: 0, pagos_netos: c.condicion === 'CREDITO' ? 0 : tot,
        saldo: c.condicion === 'CREDITO' ? tot : 0, costo_inventario: tot });
      if (c.condicion === 'CONTADO') movFin.push({ id: uid('mf'), fecha: iso(c.ms), tipo: 'PAGO_COMPRA', monto: -tot, metodo_pago_id: 2, cuenta_financiera_id: 'cf2', descripcion: 'Compra ' + c.serie + '-' + c.numero });
    });
    movFin.sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Resultados por día
    const dias = {};
    for (let n = DIAS - 1; n >= 0; n--) dias[diaMenos(n)] = { v: 0, c: 0, g: 0, aj: 0 };
    // La historia ya tiene sus boletas registradas, salvo los últimos 2 días (para ver el control en acción)
    if (!boletasSembradas) {
      boletasSembradas = true;
      const limite = diaMenos(1), porDia = {};
      vtot.forEach(v => { const d = fechaLima(Date.parse(v.fecha)); if (d < limite) (porDia[d] ??= []).push(v); });
      let n = 1;
      Object.keys(porDia).sort().forEach(d => {
        const chicas = porDia[d].filter(v => v.total <= 5), grandes = porDia[d].filter(v => v.total > 5);
        grandes.forEach(v => { const id = uid('bo'); boletas.push({ id, serie: 'B001', numero: String(n++), fecha: d, importe: v.total, consolidada: false, estado: 'EMITIDA' }); boletaVentas.push({ boleta_id: id, venta_id: v.venta_id }); });
        if (chicas.length) { const id = uid('bo'); boletas.push({ id, serie: 'B001', numero: String(n++), fecha: d, importe: r2(chicas.reduce((a, v) => a + v.total, 0)), consolidada: true, estado: 'EMITIDA' }); chicas.forEach(v => boletaVentas.push({ boleta_id: id, venta_id: v.venta_id })); }
      });
    }
    vtot.forEach(v => { const d = dias[fechaLima(Date.parse(v.fecha))]; if (d) { d.v += v.total; d.c += v.costo_ventas; } });
    gastos.forEach(g => { if (dias[g.dia]) dias[g.dia].g += g.monto; });
    const ajDia = diaMenos(5); if (dias[ajDia]) dias[ajDia].aj = r2(3 * costoBase.p2);
    const resultados = Object.entries(dias).map(([fecha, d]) => {
      const vn = r2(d.v), cmv = r2(d.c + d.aj), ub = r2(vn - cmv), go = r2(d.g);
      return { fecha, ventas_brutas: vn, devoluciones: 0, ventas_netas: vn, costo_mercaderia_vendida: cmv, de_ello_mermas_ajustes: d.aj, utilidad_bruta: ub, gastos_operativos: go, gastos_administrativos: 0,
        utilidad_operativa: r2(ub - go), gastos_financieros: 0, otros_egresos: 0, utilidad_neta_estimada: r2(ub - go), retiro_en_especie: 0 };
    });

    // Saldos de cuentas y caja de hoy
    const saldoDe = cf => r2(movFin.filter(m => m.cuenta_financiera_id === cf).reduce((a, m) => a + m.monto, 0) + ({ cf1: 120, cf2: 900, cf3: 0, cf4: 0 }[cf]));
    const aperturaMs = enLima(hoy, 7, 45);
    const hoyMov = movFin.filter(m => m.cuenta_financiera_id === 'cf1' && Date.parse(m.fecha) >= aperturaMs);
    const sesion = { id: 'cs-hoy', sesion_id: 'cs-hoy', cuenta_financiera_id: 'cf1', estado: 'ABIERTA', abierta_en: iso(aperturaMs), monto_apertura: 50,
      entradas: r2(hoyMov.filter(m => m.monto > 0).reduce((a, m) => a + m.monto, 0)), salidas: r2(hoyMov.filter(m => m.monto < 0).reduce((a, m) => a + m.monto, 0)),
      cobros_otros_medios: r2(movFin.filter(m => m.tipo === 'COBRO_VENTA' && m.metodo_pago_id !== 1 && Date.parse(m.fecha) >= aperturaMs).reduce((a, m) => a + m.monto, 0)) };
    const sesiones = [sesion, ...[1, 2, 3, 4, 5].map(n => {
      const d = diaMenos(n), a = enLima(d, 7, 50), c = enLima(d, 22, 10);
      const ent = r2(movFin.filter(m => m.cuenta_financiera_id === 'cf1' && m.monto > 0 && Date.parse(m.fecha) >= a && Date.parse(m.fecha) <= c).reduce((x, m) => x + m.monto, 0));
      const sal = r2(movFin.filter(m => m.cuenta_financiera_id === 'cf1' && m.monto < 0 && Date.parse(m.fecha) >= a && Date.parse(m.fecha) <= c).reduce((x, m) => x + m.monto, 0));
      const esperado = r2(50 + ent + sal), dif = n === 3 ? -2 : 0;
      return { id: 'cs' + n, sesion_id: 'cs' + n, cuenta_financiera_id: 'cf1', estado: 'CERRADA', abierta_en: iso(a), cerrada_en: iso(c), monto_apertura: 50, entradas: ent, salidas: sal,
        cobros_otros_medios: 0, saldo_esperado: esperado, monto_cierre_declarado: r2(esperado + dif), diferencia: dif };
    })];

    Object.assign(D, {
      perfiles: [{ id: 'demo', nombre: 'Luis Alvan', activo: true, roles: { codigo: 'ADMIN' } }],
      roles: [{ id: 1, codigo: 'ADMIN', nombre: 'Administrador' }],
      metodos_pago: metodos, cuentas_financieras: cuentas, clientes, proveedores, categorias: [{ id: 'k1', nombre: 'Cigarros', activo: true, prefijo_factura: 'CIG', unidad_medida_id: 1, paquete_nombre: 'Cajetilla', paquete_unidades: 20, vende_paquete: true, controla_vencimiento: false }, { id: 'k2', nombre: 'Gomas', activo: true, prefijo_factura: 'GOMAS', unidad_medida_id: 4, paquete_nombre: 'Caja', paquete_unidades: 12, vende_paquete: false, controla_vencimiento: true }],
      unidades_medida: [{ id: 1, codigo: 'CIGARRO', nombre: 'Cigarro' }, { id: 2, codigo: 'GOMITA', nombre: 'Gomita' }, { id: 3, codigo: 'UNIDAD', nombre: 'Unidad' }, { id: 4, codigo: 'BOLSA', nombre: 'Bolsa' }], categorias_gasto: catGasto, presentaciones, productos, motivos_movimiento: motivos,
      tipos_comprobante: [{ id: 1, codigo_sunat: '00', nombre: 'Sin comprobante' }, { id: 2, codigo_sunat: '01', nombre: 'Factura' }, { id: 3, codigo_sunat: '03', nombre: 'Boleta de venta' }, { id: 4, codigo_sunat: '12', nombre: 'Ticket' }],
      v_precios_vigentes: presentaciones.map(p => ({ presentacion_id: p.id, producto_id: p.producto_id, producto: p.productos.nombre, presentacion: p.nombre, factor: p.factor, precio: precio[p.id], vigente_desde: diaMenos(30) })),
      precios_venta: presentaciones.map(p => ({ id: 'pv-' + p.id, presentacion_id: p.id, precio: precio[p.id], vigente_desde: diaMenos(30) })),
      v_existencias: productos.map(p => { const s = st[p.id]; return { producto_id: p.id, producto: p.nombre, sku: p.sku, cantidad: s.q, stock_minimo: p.stock_minimo, costo_promedio: +s.cp.toFixed(6),
        valor_total: r2(s.q * s.cp), requiere_reposicion: s.q <= p.stock_minimo, activo: true, almacen: 'Principal' }; }),
      existencias: productos.map(p => ({ producto_id: p.id, almacen_id: 'a1', cantidad: st[p.id].q, costo_promedio: st[p.id].cp })),
      boletas_emitidas: boletas, boleta_ventas: boletaVentas,
      v_ventas_comprobante: vtot.map(v => { const l = boletaVentas.find(x => x.venta_id === v.venta_id), b = l && boletas.find(x => x.id === l.boleta_id && x.estado === 'EMITIDA');
        return { venta_id: v.venta_id, fecha: v.fecha, dia: fechaLima(Date.parse(v.fecha)), estado: v.estado, total: v.total, boleta_id: b?.id || null, serie: b?.serie || null, numero: b?.numero || null, consolidada: b ? b.consolidada : null }; }),
      ventas, venta_detalles: vdet, v_ventas_totales: vtot.slice().reverse(), v_lineas_rentabilidad: lineasRent, v_resultados_diarios: resultados,
      v_cuentas_por_cobrar: cxc, movimientos_financieros: movFin, gastos: gastosV,
      compras: compras.map(c => ({ id: c.id, proveedor_id: c.proveedor_id, fecha_emision: c.dia, serie: c.serie, numero: c.numero, estado: 'REGISTRADA' })),
      compra_detalles: compDet, v_compras_totales: compTot.slice().reverse(),
      v_cuentas_por_pagar: compTot.filter(c => c.saldo > 0).map(c => ({ origen: 'COMPRA', documento_id: c.compra_id, proveedor: c.proveedor, fecha: c.fecha_emision, total: c.total, saldo: c.saldo, fecha_vencimiento: c.fecha_vencimiento, dias_vencido: 0 })),
      v_kardex: kardex, caja_sesiones: [sesion], v_caja_sesiones: sesiones,
      v_saldos_cuentas: cuentas.map(c => ({ cuenta_id: c.id, nombre: c.nombre, tipo: c.tipo, saldo: c.id === 'cf1' ? r2(sesion.monto_apertura + sesion.entradas + sesion.salidas) : saldoDe(c.id) })),
      v_flujo_caja_diario: [], alias_compra: MARCAS.map(m => ({ proveedor_id: m[9] === 'k2' ? 'pv3' : 'pv1', texto: '#' + m[11], presentacion_id: m[0] + 'c' })), periodos_contables: [], series_documento: [], almacenes: [{ id: 'a1', nombre: 'Principal' }],
      producto_proveedores: [], compra_costos_adicionales: [], devoluciones_compra: [], devolucion_compra_detalles: [], devoluciones_venta: [], devolucion_venta_detalles: [],
      movimientos_inventario: [{ id: 'mi1', fecha: iso(enLima(diaMenos(5), 21, 30)), observacion: 'Conteo físico ' + diaMenos(5), motivo_id: 6, tipo: 'AJUSTE_NEGATIVO',
        movimiento_detalles: [{ cantidad_base: -3, costo_total: -r2(3 * costoBase.p2) }] }],
      movimiento_detalles: [], auditoria: [], config_telegram: [],
    });
  }
  derivar();

  // ---------- 6. Consultas: imita el cliente de Supabase ----------
  const valor = (fila, ruta) => ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), fila);
  const comparar = (a, b) => {
    const fa = typeof a === 'string' && /^\d{4}-\d\d-\d\d/.test(a), fb = typeof b === 'string' && /^\d{4}-\d\d-\d\d/.test(b);
    if (fa && fb && (a.includes('T') || b.includes('T'))) {
      const pa = Date.parse(a.length === 10 ? a + 'T00:00:00-05:00' : a), pb = Date.parse(b.length === 10 ? b + 'T00:00:00-05:00' : b);
      return pa - pb;
    }
    if (typeof a === 'number' || typeof b === 'number') return Number(a) - Number(b);
    return String(a).localeCompare(String(b));
  };
  function consulta(tabla) {
    const filtros = []; let orden = [], desde = 0, hasta = Infinity, unico = 0, contar = false, cambio = null;
    const b = {
      select(_c, o) { if (o?.count) contar = true; return b; },
      eq(k, v) { filtros.push(f => valor(f, k) == v); return b; },
      neq(k, v) { filtros.push(f => valor(f, k) != v); return b; },
      gte(k, v) { filtros.push(f => valor(f, k) != null && comparar(valor(f, k), v) >= 0); return b; },
      gt(k, v) { filtros.push(f => valor(f, k) != null && comparar(valor(f, k), v) > 0); return b; },
      lte(k, v) { filtros.push(f => valor(f, k) != null && comparar(valor(f, k), v) <= 0); return b; },
      lt(k, v) { filtros.push(f => valor(f, k) != null && comparar(valor(f, k), v) < 0); return b; },
      in(k, vs) { filtros.push(f => vs.includes(valor(f, k))); return b; },
      ilike(k, v) { const t = String(v).replaceAll('%', '').toLowerCase(); filtros.push(f => String(valor(f, k) ?? '').toLowerCase().includes(t)); return b; },
      is(k, v) { filtros.push(f => (valor(f, k) ?? null) === v); return b; },
      not() { return b; }, or() { return b; },
      order(k, o) { orden.push([k, o?.ascending !== false]); return b; },
      limit(n) { hasta = Math.min(hasta, desde + n - 1); return b; },
      range(a, z) { desde = a; hasta = z; return b; },
      single() { unico = 1; return b; }, maybeSingle() { unico = 2; return b; },
      insert(r) { cambio = ['insert', r]; return b; }, update(r) { cambio = ['update', r]; return b; }, upsert(r) { cambio = ['upsert', r]; return b; }, delete() { cambio = ['delete']; return b; },
      then(ok, mal) {
        return Promise.resolve().then(() => {
          let filas = (D[tabla] || []).filter(f => filtros.every(t => t(f)));
          if (cambio) {
            const [tipo, r] = cambio;
            if (tipo === 'update') {
              filas.forEach(f => Object.assign(f, r));
              // Otras tablas y vistas guardan una copia del nombre del producto: se mantiene al día
              if (tabla === 'productos' && 'nombre' in r) filas.forEach(f => {
                presentaciones.forEach(pr => { if (pr.producto_id === f.id && pr.productos) pr.productos.nombre = r.nombre; });
                ['v_precios_vigentes', 'v_existencias'].forEach(v => (D[v] || []).forEach(x => { if (x.producto_id === f.id) x.producto = r.nombre; }));
              });
            }
            if (tipo === 'insert' || tipo === 'upsert') { const nuevas = (Array.isArray(r) ? r : [r]).map(x => ({ id: uid(tabla.slice(0, 3)), activo: true, ...x })); (D[tabla] ??= []).push(...nuevas); filas = nuevas; }
            if (tipo === 'delete') { D[tabla] = (D[tabla] || []).filter(f => !filas.includes(f)); }
          }
          for (const [k, asc] of orden.slice().reverse()) filas = filas.slice().sort((x, y) => { const a = valor(x, k), z = valor(y, k); return (a == null) - (z == null) || (asc ? 1 : -1) * comparar(a, z); });
          const total = filas.length;
          filas = filas.slice(desde, hasta === Infinity ? undefined : hasta + 1);
          if (unico) {
            if (!filas.length && unico === 1) return { data: null, error: { message: 'No se encontró el registro', code: 'PGRST116' } };
            return { data: filas[0] ?? null, error: null };
          }
          return { data: JSON.parse(JSON.stringify(filas)), error: null, count: contar ? total : null };
        }).then(ok, mal);
      },
    };
    return b;
  }

  // ---------- 7. Funciones (RPC) ----------
  const RPC = {
    mis_sesiones() { const h = Date.now(); return [
      { id: 'ses-1', creada: new Date(h - 864e5 * 3).toISOString(), ultima_actividad: new Date(h).toISOString(), dispositivo: navigator.userAgent, ip: '190.42.10.8', es_esta: true },
      { id: 'ses-2', creada: new Date(h - 864e5 * 9).toISOString(), ultima_actividad: new Date(h - 864e5).toISOString(), dispositivo: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', ip: '190.42.11.3', es_esta: false }]; },
    cerrar_sesion_dispositivo() { return true; },
    registrar_venta({ p }) {
      ventasRaw.push({ ms: Date.parse(p.fecha || new Date().toISOString()), lineas: p.lineas.map(l => ({ ...l })), medio: p.pagos?.[0]?.metodo_pago_id ?? null,
        cliente: p.cliente_id || 'cl0', condicion: p.condicion || 'CONTADO', vence: p.fecha_vencimiento, obs: p.observaciones });
      derivar(); return ventasRaw[ventasRaw.length - 1].id;
    },
    registrar_boleta({ p_serie, p_numero, p_fecha, p_ventas, p_consolidada }) {
      const serie = String(p_serie || '').trim().toUpperCase(), numero = String(Number(p_numero));
      if (!/^[A-Z0-9]{4}$/.test(serie) || !/^\d{1,8}$/.test(numero)) throw new Error('Serie o número no válidos');
      if (boletas.some(b => b.estado === 'EMITIDA' && b.serie === serie && b.numero === numero)) throw new Error(`La boleta ${serie}-${numero} ya está registrada`);
      const vs = D.v_ventas_comprobante.filter(v => p_ventas.includes(v.venta_id));
      if (vs.some(v => v.boleta_id)) throw new Error('Una de esas ventas ya tiene boleta');
      if (p_consolidada && vs.some(v => v.total > 5)) throw new Error('Una venta supera S/ 5: necesita su propia boleta');
      const id = uid('bo');
      boletas.push({ id, serie, numero, fecha: p_fecha, importe: r2(vs.reduce((a, v) => a + v.total, 0)), consolidada: !!p_consolidada, estado: 'EMITIDA' });
      p_ventas.forEach(v => boletaVentas.push({ boleta_id: id, venta_id: v }));
      derivar(); return id;
    },
    anular_boleta({ p_boleta, p_motivo }) { const b = boletas.find(x => x.id === p_boleta); if (b) { b.estado = 'ANULADA'; b.motivo_anulacion = p_motivo; } for (let i = boletaVentas.length - 1; i >= 0; i--) if (boletaVentas[i].boleta_id === p_boleta) boletaVentas.splice(i, 1); derivar(); return null; },
    telegram_estado: () => ({ vinculado: false, activo: false, hora_envio: 21, tiene_token: false }),
  };
  const soloLectura = new Set(['telegram_estado']);
  window.__demoAviso = () => {};
  const rpc = (fn, args) => Promise.resolve().then(() => {
    if (RPC[fn]) { try { return { data: RPC[fn](args || {}), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } }
    if (!soloLectura.has(fn)) window.__demoAviso(fn);
    return { data: null, error: null };
  });

  // ---------- 8. Cliente falso ----------
  const usuario = { id: 'demo', email: 'demo@caja.app' };
  const factor = { id: 'f-demo', factor_type: 'totp', status: 'verified', friendly_name: 'Mi celular', created_at: '2026-11-01T12:00:00Z' };
  window.supabase = {
    createClient: () => ({
      from: consulta, rpc,
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: usuario } }, error: null }),
        getUser: () => Promise.resolve({ data: { user: usuario }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInWithPassword: () => Promise.resolve({ data: { session: { user: usuario } }, error: null }),
        signOut: () => { location.reload(); return Promise.resolve({ error: null }); },
        resetPasswordForEmail: () => Promise.resolve({ error: null }),
        updateUser: () => Promise.resolve({ data: { user: usuario }, error: null }),
        mfa: {
          listFactors: () => Promise.resolve({ data: { all: [factor], totp: [factor] }, error: null }),
          getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }),
          enroll: () => Promise.resolve({ data: null, error: { message: 'En la demostración no se puede configurar la verificación en dos pasos.' } }),
          challengeAndVerify: () => Promise.resolve({ data: {}, error: null }),
          unenroll: () => Promise.resolve({ data: null, error: { message: 'No disponible en la demostración.' } }),
        },
      },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
    }),
  };
})();
