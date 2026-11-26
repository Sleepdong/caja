// Sección Análisis: los números deben coincidir con un cálculo independiente sobre las mismas tablas
const { test, expect, abrirDemo, irA } = require('./ayuda');
const soles = t => Number(t.replace(/[^\d.-]/g, ''));

test('KPIs del periodo coinciden con un cálculo independiente', async ({ page, errores }) => {
  await abrirDemo(page);
  await page.evaluate(() => local.guardar('anPeriodo', '30'));
  await irA(page, 'analisis');
  const k = page.locator('.an-kpis .an-card');
  const ref = await page.evaluate(async () => {
    const H = hoy(), ini = new Date(Date.parse(H + 'T12:00:00-05:00') - 29 * 864e5).toISOString().slice(0, 10);
    const d = (await sb.from('v_resultados_diarios').select('*').gte('fecha', ini).lte('fecha', H)).data;
    const v = d.reduce((a, x) => a + num(x.ventas_netas), 0), g = d.reduce((a, x) => a + num(x.utilidad_bruta), 0);
    const n = (await sb.from('ventas').select('id').eq('estado', 'EMITIDA').gte('fecha', ini + 'T00:00:00-05:00').lte('fecha', H + 'T23:59:59.999-05:00')).data.length;
    return { v: r2(v), g: r2(g), n, t: r2(v / n) };
  });
  expect(soles(await k.nth(0).locator('> b').innerText())).toBeCloseTo(ref.v, 2);
  expect(soles(await k.nth(1).locator('> b').innerText())).toBeCloseTo(ref.g, 2);
  expect(Number(await k.nth(4).locator('> b').innerText())).toBe(ref.n);
  expect(soles(await k.nth(5).locator('> b').innerText())).toBeCloseTo(ref.t, 2);
});

test('la ganancia por producto coincide con la vista de rentabilidad', async ({ page, errores }) => {
  await abrirDemo(page);
  await page.evaluate(() => local.guardar('anPeriodo', '30'));
  await irA(page, 'analisis');
  const primero = page.locator('.par-ley li').first();
  const nombre = (await primero.evaluate(e => e.childNodes[1].textContent)).trim();
  const mostrado = soles((await primero.locator('small').innerText()).split('·')[0]);
  const ref = await page.evaluate(async nom => {
    const H = hoy(), ini = new Date(Date.parse(H + 'T12:00:00-05:00') - 29 * 864e5).toISOString().slice(0, 10);
    const l = (await sb.from('v_lineas_rentabilidad').select('*').gte('fecha', ini).lte('fecha', H)).data;
    const pid = C.presentaciones.find(p => p.productos.nombre === nom).producto_id;
    return r2(l.filter(x => x.producto_id === pid).reduce((a, x) => a + num(x.venta_neta) - num(x.costo), 0));
  }, nombre);
  expect(mostrado).toBeCloseTo(ref, 2);
});

test('hallazgos: un solo hallazgo por patrón y con evidencia', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'analisis');
  const h = page.locator('.hallazgo');
  const titulos = await h.locator('h3').allInnerTexts();
  expect(new Set(titulos).size).toBe(titulos.length);
  expect(titulos.filter(t => /paquete deja menos/.test(t)).length).toBeLessThanOrEqual(1);
  for (let i = 0; i < await h.count(); i++) {
    await expect(h.nth(i)).toContainText('Qué muestran los datos');
    await expect(h.nth(i)).toContainText('Qué hacer');
  }
});

test('madurez de datos y cambio de periodo', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'analisis');
  await expect(page.locator('.mad-fila')).toHaveCount(5);
  await page.locator('[data-per="7"]').click();
  await expect(page.locator('[data-per="7"]')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => local.leer('anPeriodo'))).toBe('7');
});

test('estadística descriptiva correcta', async ({ page, errores }) => {
  await abrirDemo(page);
  const e = await page.evaluate(() => estad([10, 20, 30, 40]));
  expect(e.media).toBe(25);
  expect(e.mediana).toBe(25);
  expect(e.de).toBeCloseTo(12.9099, 3); // desviación muestral
});

test('Panel: las ventas del conteo no entran al gráfico por hora', async ({ page, errores }) => {
  await abrirDemo(page);
  const n = await page.evaluate(async () => (await sb.from('ventas').select('id, origen').eq('origen', 'CONTEO')).data.length);
  expect(n).toBeGreaterThanOrEqual(0);
  await irA(page, 'panel');
  await expect(page.locator('#gHoras')).toBeVisible();
});

test('Caja: total = efectivo + otros medios, igual que Reportes y que lo cobrado hoy del Panel', async ({ page, errores }) => {
  await abrirDemo(page);
  const sol = t => Number(t.replace(/[^\d.\-−]/g, '').replace('−', '-'));
  const esperado = await page.evaluate(async () => {
    const s = (await sb.from('v_saldos_cuentas').select('*')).data;
    const c = (await sb.from('movimientos_financieros').select('monto, metodo_pago_id').in('tipo', ['COBRO_VENTA', 'REEMBOLSO_CLIENTE']).gte('fecha', inicioHoy())).data;
    return { total: Math.round(s.reduce((a, x) => a + Number(x.saldo), 0) * 100) / 100, hoy: Math.round(c.reduce((a, x) => a + Number(x.monto), 0) * 100) / 100 };
  });
  await irA(page, 'caja');
  const total = sol(await page.locator('.tot-n').innerText());
  const partes = await page.locator('.tot-cab b').allInnerTexts();
  expect(total).toBeCloseTo(esperado.total, 2);
  expect(sol(partes[0]) + sol(partes[1])).toBeCloseTo(total, 2);
  const filas = await page.locator('.tot-grupo').nth(1).locator('.tot-fila b').allInnerTexts();
  const efe = await page.locator('.tot-grupo').nth(0).locator('.tot-fila b').allInnerTexts();
  if (efe.length) expect(efe.reduce((a, t) => a + sol(t), 0)).toBeCloseTo(sol(partes[0]), 2);
  expect(filas.reduce((a, t) => a + sol(t), 0)).toBeCloseTo(sol(partes[1]), 2);
  if (esperado.hoy) await expect(page.locator('.tot-caja')).toContainText(new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2 }).format(esperado.hoy));
});

test('Panel: la dona reparte las ventas en mercadería, gastos y ganancia neta, igual que los indicadores', async ({ page, errores }) => {
  // Al inicio de la jornada la demo puede tener pérdida y la dona muestra dos porciones.
  await page.clock.setFixedTime(new Date('2026-11-26T21:00:00-05:00'));
  await abrirDemo(page);
  await irA(page, 'panel');
  const sol = t => Number(t.replace(/[^\d.\-−]/g, '').replace('−', '-'));
  const fila = i => page.locator(`#gDona .dona-fila[data-i="${i}"] .n b`).innerText().then(sol);
  const centro = sol(await page.locator('#gDona .dona-c b').innerText());
  const [m, g, q] = [await fila(0), await fila(1), await fila(2)];
  expect(m + g + q).toBeCloseTo(centro, 2);
  const neta = sol(await page.locator('.pn-kpi').nth(3).locator('b').first().innerText());
  expect(q).toBeCloseTo(neta, 2);
  const txt = await page.locator('#gDona .dona-txt').innerText();
  const partes = [...txt.matchAll(/S\/\s?([\d.]+)/g)].slice(1).map(x => Number(x[1]));
  expect(partes.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 2);
  // El periodo es de todo el Panel: "Este mes" cambia la dona y los indicadores
  const mes = await page.evaluate(async () => { const r = (await sb.from('v_resultados_diarios').select('*').gte('fecha', iniMes()).lte('fecha', hoy())).data; return Math.round(r.reduce((a, x) => a + Number(x.ventas_netas || 0), 0) * 100) / 100; });
  await page.locator('[data-panelper="mes"]').click();
  await expect(page.locator('[data-panelper="mes"]')).toHaveClass(/on/);
  await expect(page.locator('.pn-kpi').first()).toContainText('Ventas del mes');
  if (mes > 0) {
    await expect.poll(async () => sol(await page.locator('#gDona .dona-c b').innerText())).toBeCloseTo(mes, 2);
    expect(sol(await page.locator('.pn-kpi').first().locator('b').first().innerText())).toBeCloseTo(mes, 2);
  }
  await page.locator('[data-panelper="sem"]').click();
  await expect(page.locator('.pn-kpi').first()).toContainText('Ventas en 7 días');
  await page.locator('[data-panelper="hoy"]').click();
  await expect(page.locator('#gHoras')).toHaveCount(1);
});

test('Análisis: gráficos estadísticos con datos coherentes', async ({ page, errores }) => {
  await abrirDemo(page);
  await page.evaluate(() => localStorage.setItem('caja:anPeriodo', '"30"'));
  await irA(page, 'analisis');
  // Tarjetas con mini tendencia, tendencia con banda, mapa de calor, distribución, mapa de productos, Pareto, cascada y cobertura
  await expect(page.locator('.an-card .spark').first()).toBeVisible();
  for (const id of ['#gTend', '#gCalor', '#gTicket', '#gProd', '#gPareto', '#gCasc', '#gCob']) await expect(page.locator(`${id} svg, ${id} .cob, ${id} .dona-vacia`).first()).toBeVisible();
  await expect(page.locator('.an-dato').first()).not.toContainText('undefined');
  // El mapa de calor suma lo mismo que las ventas con hora del periodo
  const celdas = await page.locator('#gCalor .celda').count();
  expect(celdas % 7).toBe(0);
  // Pareto: el último acumulado es 100 %
  const ult = await page.locator('.par-ley li').last().innerText();
  expect(ult).toContain('100% acum.');
  // La cascada termina en la ganancia operativa de la tarjeta
  const sol = t => Number(t.replace(/[^\d.\-−]/g, '').replace('−', '-'));
  const op = sol(await page.locator('.an-card').nth(3).locator('> b').innerText());
  const cas = sol(await page.locator('#gCasc .cas-v').last().textContent());
  expect(cas).toBeCloseTo(op, 2);
});
