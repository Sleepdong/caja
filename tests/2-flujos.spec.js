// Flujos principales del negocio, usados como lo haría Luis (en laptop y en celular)
const { test, expect, abrirDemo, irA, aceptarDialogo } = require('./ayuda');

const PAGINAS = ['panel', 'analisis', 'vender', 'ventas', 'caja', 'compras', 'stock', 'gastos', 'catalogo', 'reportes', 'boletas', 'cuenta'];

test('todas las pantallas abren sin errores', async ({ page, errores }) => {
  await abrirDemo(page);
  for (const p of PAGINAS) {
    await irA(page, p);
    await expect(page.locator('#vista, main').first(), `Pantalla ${p}`).not.toBeEmpty();
  }
});

test('vender en efectivo descuenta el stock y suma a la caja del día', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'vender');
  const prod = page.locator('#estante .prod').filter({ hasText: 'Pall Mall BOOST' });
  const stockAntes = await prod.locator('.stock').innerText();
  const totalAntes = await page.locator('.resumen-dia div').last().locator('b').innerText();

  await prod.locator('.opc').first().click();
  await expect(page.locator('#ticket')).toContainText('Pall Mall BOOST');
  await page.locator('#btnCobrar').click();
  await expect(page.locator('#ticket')).toContainText('Cobrado con Efectivo');

  await irA(page, 'vender');
  const prod2 = page.locator('#estante .prod').filter({ hasText: 'Pall Mall BOOST' });
  await expect(prod2.locator('.stock')).not.toHaveText(stockAntes);
  await expect(page.locator('.resumen-dia div').last().locator('b')).not.toHaveText(totalAntes);
});

test('un ticket vacío no se puede cobrar', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'vender');
  await expect(page.locator('#btnCobrar')).toBeDisabled();
});

test('quitar un producto del ticket con el botón Quitar', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'vender');
  await page.locator('#estante .opc').first().click();
  await expect(page.locator('#ticket .linea[data-linea]')).toHaveCount(1);
  await page.locator('#ticket [data-q]').first().click();
  await expect(page.locator('#ticket .linea[data-linea]')).toHaveCount(0);
});

test('conteo de inventario: un faltante se registra como venta con "Lo vendí"', async ({ page, errores }) => {
  await abrirDemo(page);
  await page.evaluate(() => localStorage.removeItem('caja:conteo'));
  await irA(page, 'stock');
  await page.locator('#cntEmpezar').click();

  // Contamos 5 sueltos menos de lo que dice el sistema en el primer producto
  const fila = page.locator('.cnt-fila').first();
  const sistema = Number((await fila.locator('.cnt-nom small').innerText()).match(/\((\d+) und\.\)/)[1]);
  expect(sistema).toBeGreaterThan(5);
  if (await fila.locator('[data-cp]').count()) await fila.locator('[data-cp]').fill('0');
  await fila.locator('[data-cs]').fill(String(sistema - 5));
  await expect(fila.locator('.cnt-dif')).toContainText('Faltan 5');

  await fila.locator('[data-vendi]').click();
  await aceptarDialogo(page);
  await expect(fila.locator('.cnt-dif')).toContainText('Cuadra');
  await expect(fila.locator('.cnt-nom small')).toContainText(`(${sistema - 5} und.)`);
});

test('conteo ya registrado: "Fue venta" convierte el faltante en venta', async ({ page, errores }) => {
  await abrirDemo(page);
  await page.evaluate(() => localStorage.removeItem('caja:conteo'));
  await irA(page, 'stock');
  const antes = await page.evaluate(async () => (await sb.from('ventas').select('id, origen').eq('origen', 'CONTEO')).data.length);
  const btn = page.locator('[data-fueventa]').first();
  await expect(btn).toBeVisible();
  await btn.click();
  await aceptarDialogo(page);
  await expect.poll(() => page.evaluate(async () => (await sb.from('ventas').select('id, origen').eq('origen', 'CONTEO')).data.length)).toBe(antes + 1);
});

test('cerrar el día abre el asistente con el conteo de billetes', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'caja');
  await page.locator('#btnCerrarDiaCaja').click();
  const asis = page.locator('.asis[role="dialog"]');
  await expect(asis).toBeVisible();
  await expect(asis).toContainText('Cuenta el efectivo');
});

test('en celular ninguna pantalla se sale de lado', async ({ page, errores }) => {
  test.skip(test.info().project.name !== 'celular', 'Solo aplica al celular');
  await page.setViewportSize({ width: 360, height: 780 });
  await abrirDemo(page);
  for (const p of PAGINAS) {
    await irA(page, p);
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(ancho, `La pantalla ${p} mide ${ancho}px en un celular de 360px`).toBeLessThanOrEqual(360);
  }
});

test('el ticket para el cliente es opcional y lleva el nombre de la empresa', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'vender');
  await page.locator('#estante .prod').filter({ hasText: 'Pall Mall BOOST' }).locator('.opc').first().click();
  await page.locator('#btnCobrar').click();
  await expect(page.locator('#ticket')).toContainText('Cobrado con');
  // No se abre nada solo: el botón espera a que el cliente lo pida
  await expect(page.locator('form.dialogo')).toHaveCount(0);
  await page.locator('#enviarTicket').click();
  const texto = await page.locator('form.dialogo textarea').inputValue();
  expect(texto).toContain('*Oni Cobin S.A.C.*');
  expect(texto).toContain('Pall Mall BOOST');
  expect(texto).toContain('no es comprobante de pago');
  await page.locator('form.dialogo [data-x]').click();
});

test('Para declarar: ventas exoneradas, IGV cero y Renta MYPE al 1 % redondeada', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'reportes');
  const d = page.locator('.declarar');
  await expect(d).toContainText('Para declarar');
  await expect(d).toContainText('Oni Cobin S.A.C.');
  const ventas = Number((await d.locator('.cifra').first().locator('b').innerText()).replace(/[^\d.]/g, ''));
  const renta = Number((await d.locator('.cifra').nth(2).locator('b').innerText()).replace(/[^\d.]/g, ''));
  expect(renta).toBe(Math.round(ventas * 0.01));
  await expect(d.locator('.cifra').nth(1)).toContainText('S/ 0.00');
  // Cambiar el periodo vuelve a calcular sin errores
  await page.locator('#dMes').fill(await page.evaluate(() => hoy().slice(0, 7)));
  await page.locator('#dMes').dispatchEvent('change');
  await expect(page.locator('.declarar')).toContainText('Ventas del mes');
});

test('boletas: registrar la boleta del día quita las ventas pendientes y no acepta números repetidos', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'boletas');
  const card = page.locator('#boletasPanel .boletas');
  await expect(card).toContainText('sin boleta');
  const antes = Number((await card.locator('p.sub b').first().innerText()).match(/\d+/)[0]);
  // Boleta consolidada del primer día pendiente
  const nVentas = Number((await card.locator('[data-bol-dia]').first().locator('xpath=..').innerText()).match(/(\d+) ventas? de hasta/)[1]);
  await card.locator('[data-bol-dia]').first().click();
  const form = page.locator('form.dialogo');
  await expect(form).toContainText('APP Emprender');
  const numero = await form.locator('input').nth(1).inputValue();
  expect(Number(numero)).toBeGreaterThan(0);
  await form.locator('.acc button:not([data-x])').click();
  await expect(page.locator('#aviso')).toContainText(`B001-${Number(numero)} registrada`);
  await expect(card.locator('p.sub b').first()).toContainText(String(antes - nVentas));
  // El mismo número no se puede usar dos veces
  const err = await page.evaluate(async n => { const v = (await sb.from('v_ventas_comprobante').select('*')).data.find(x => !x.boleta_id && x.total <= 5);
    return (await sb.rpc('registrar_boleta', { p_serie: 'B001', p_numero: n, p_fecha: v.dia, p_ventas: [v.venta_id], p_consolidada: true })).error?.message; }, numero);
  expect(err).toContain('ya está registrada');
});

test('boletas: una venta de más de S/ 5 no entra en la boleta consolidada', async ({ page, errores }) => {
  await abrirDemo(page);
  const err = await page.evaluate(async () => { const v = (await sb.from('v_ventas_comprobante').select('*')).data.find(x => !x.boleta_id && x.total > 5);
    return (await sb.rpc('registrar_boleta', { p_serie: 'B001', p_numero: '99999', p_fecha: v.dia, p_ventas: [v.venta_id], p_consolidada: true })).error?.message; });
  expect(err).toContain('supera S/ 5');
});

test('apartado Boletas: anular una boleta devuelve sus ventas a pendientes y libera el número', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'boletas');
  await expect(page.locator('#boletasPanel .boletas')).toContainText('Por emitir');
  const fila = page.locator('table tr', { has: page.locator('[data-anular]') }).first();
  const numero = (await fila.locator('td').nth(1).innerText()).trim();
  const ventas = Number((await fila.locator('td').nth(3).innerText()).match(/\d+/)[0]);
  const antes = Number((await page.locator('#boletasPanel p.sub b').first().innerText()).match(/\d+/)[0]);
  await fila.locator('[data-anular]').click();
  await page.locator('form.dialogo .acc button:not([data-x])').click();
  await expect(page.locator('#aviso')).toContainText(`${numero} anulada`);
  await expect(page.locator('#boletasPanel p.sub b').first()).toContainText(String(antes + ventas));
  await expect(page.locator('tr.anulada', { hasText: numero })).toHaveCount(1);
  await expect(page.locator('.pasos-sunat')).toContainText('APP Emprender');
});

for (const [hora, texto] of [['21:50', 'En 10 min es hora de cerrar caja'], ['22:05', 'Ya son las 10:00 p. m.: cierra tu caja']]) {
  test(`alerta de cierre: a las ${hora} avisa si la caja sigue abierta`, async ({ page, errores }) => {
    await page.clock.setFixedTime(new Date(`2026-11-20T${hora}:00-05:00`));
    await abrirDemo(page);
    const bar = page.locator('#alertaCierreBar');
    await expect(bar).toContainText(texto);
    await bar.locator('[data-x="luego"]').click();
    await expect(bar).toHaveCount(0);
  });
}

test('alerta de cierre: antes de la hora no molesta y se puede cambiar la hora', async ({ page, errores }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T15:00:00-05:00'));
  await abrirDemo(page);
  await page.waitForTimeout(1200);
  await expect(page.locator('#alertaCierreBar')).toHaveCount(0);
  await irA(page, 'caja');
  await page.locator('#horaCierre').selectOption('20');
  expect(await page.evaluate(() => horaCierre())).toBe(20);
  await expect(page.locator('#calCierre')).toHaveAttribute('href', 'recordatorio/cierre-20.ics');
});

test('contar el dinero: detecta un sobrante, avisa de ventas sin subir y guarda el conteo', async ({ page, errores }) => {
  await abrirDemo(page);
  await page.evaluate(() => colaVentas.agregar({ id: 'x1', p: { observaciones: 'sinred:x1' }, total: 26, medio: 'Efectivo', creada: new Date().toISOString(), error: 'La caja estaba cerrada' }));
  await irA(page, 'caja');
  await expect(page.locator('.aviso-barra', { hasText: 'sin internet por S/ 26.00' })).toBeVisible();
  const sistema = await page.evaluate(async () => num((await sb.from('v_saldos_cuentas').select('*')).data.find(x => x.cuenta_id === C.caja.id).saldo));
  await page.locator('#btnContarAhora').click();
  // Contamos el sistema + S/ 26 en monedas de S/ 1 y céntimos
  const objetivo = Math.round((sistema + 26) * 10) / 10, soles = Math.floor(objetivo), cent = Math.round((objetivo - soles) * 10);
  await page.locator('[data-den="1"]').fill(String(soles));
  if (cent) await page.locator('[data-den="0.1"]').fill(String(cent));
  await expect(page.locator('.cuadre-caja')).toContainText('Sobran S/ 26.00');
  await page.locator('[data-a="sig"]').click();
  await expect(page.locator('.asis')).toContainText('que aún no se suben');
  await page.locator('[data-m="ajuste"]').click();
  await page.locator('[data-a="aplicar"]').click();
  await expect(page.locator('.contar-ahora')).toContainText('sobraban S/ 26.00');
});

test('contar el dinero: si cuadra, lo confirma', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'caja');
  const sistema = await page.evaluate(async () => num((await sb.from('v_saldos_cuentas').select('*')).data.find(x => x.cuenta_id === C.caja.id).saldo));
  await page.locator('#btnContarAhora').click();
  const soles = Math.floor(sistema), cent = Math.round((sistema - soles) * 10);
  await page.locator('[data-den="1"]').fill(String(soles));
  if (cent) await page.locator('[data-den="0.1"]').fill(String(cent));
  await page.locator('[data-a="sig"]').click();
  await expect(page.locator('.asis')).toContainText('Tu caja cuadra');
  await page.locator('[data-a="ok"]').click();
  await expect(page.locator('.contar-ahora')).toContainText('cuadró');
});

test('Panel: compara contra ayer a la misma hora, no contra el día completo', async ({ page, errores }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T11:00:00-05:00'));
  await abrirDemo(page);
  await irA(page, 'panel');
  await expect(page.locator('.pn-kpis')).toContainText('ayer a esta hora');
  await expect(page.locator('.pn-kpis')).toContainText('Ganancia bruta');
  await expect(page.locator('.pn-kpis')).not.toContainText('Ganas sobre el costo');
  await expect(page.locator('.pn-kpis')).not.toContainText('%  vs.');
  // El dato comparado es el tramo de ayer hasta las 11:00
  const esperado = await page.evaluate(async () => {
    const vs = (await sb.from('ventas').select('id, fecha, venta_detalles(subtotal, costo_total)').eq('estado', 'EMITIDA').gte('fecha', '2026-11-19T00:00:00-05:00').lte('fecha', new Date(Date.now() - 864e5).toISOString())).data;
    return vs.length;
  });
  await expect(page.locator('.pn-kpis')).toContainText(`ayer a esta hora: ${esperado}`);
});

test('Panel: sin ventas hoy no muestra porcentajes alarmantes', async ({ page, errores }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T07:05:00-05:00'));
  await abrirDemo(page);
  await irA(page, 'panel');
  await expect(page.locator('.pn-kpis')).not.toContainText('100%');
  await expect(page.locator('.pn-kpis .pn-kpi').first()).toContainText('S/ 0.00');
});

test('gastos fijos: se registran solos al pasar fin de mes y nunca dos veces', async ({ page, errores }) => {
  await abrirDemo(page);
  // Un gasto fijo que empezó el mes pasado: su fin de mes ya pasó y no está registrado
  const n = await page.evaluate(async () => {
    const ant = mesAnt(mesDe(hoy()));
    fijos.guardar([{ id: 't1', detalle: 'PRUEBA.FIJA', monto: 12.5, medio: 'TARJETA_DEBITO', cat: null, desde: ant }]);
    const a = await registrarFijosPendientes(), b = await registrarFijosPendientes();
    const g = (await sb.from('gastos').select('fecha, descripcion').eq('descripcion', 'PRUEBA.FIJA')).data;
    return { a, b, n: g.length, fecha: g[0]?.fecha, fin: finMes(ant) };
  });
  expect(n.a).toBe(1);
  expect(n.b).toBe(0);
  expect(n.n).toBe(1);
  expect(n.fecha).toBe(n.fin);
  await irA(page, 'gastos');
  await expect(page.locator('#fijos')).toContainText('PRUEBA.FIJA');
});

test('mover dinero: elegir cuenta, monto rápido y detalle, y registrar', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'caja');
  await page.locator('#btnAporte').click();
  const md = page.locator('.md');
  await expect(md.locator('.acc .btn:not(.claro)')).toBeDisabled();
  await md.locator('[data-sumar="50"]').click();
  await md.locator('[data-det]').first().click();
  await expect(md.locator('.md-prev')).toContainText('→');
  await md.locator('[data-modo="pasar"]').click();
  await expect(md.locator('[data-a]')).toHaveCount(await md.locator('[data-de]').count());
  await md.locator('[data-det]').first().click();
  await md.locator('.acc .btn:not(.claro)').click();
  await expect(md).toBeHidden();
});

test('compras: elegir "A crédito" a la vista, con plazo rápido', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'compras');
  await expect(page.locator('#venceBox')).toBeHidden();
  await page.locator('[data-cond="CREDITO"]').click();
  await expect(page.locator('#venceBox')).toBeVisible();
  await expect(page.locator('#btnComprar')).toHaveText('Registrar compra a crédito');
  await page.locator('[data-plazo="30"]').click();
  await expect(page.locator('#venceTxt')).toContainText('30 días');
  await page.locator('[data-cond="CONTADO"]').click();
  await expect(page.locator('#venceBox')).toBeHidden();
  await expect(page.locator('#cond')).toHaveValue('CONTADO');
});

test('compras: repetir la última compra del proveedor, botones +/− y resumen con el total', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'compras');
  await expect(page.locator('#resFilas')).toContainText('Falta elegir');
  await page.locator('#prov').selectOption({ index: 1 });
  await expect(page.locator('#repetirCompra')).toBeVisible();
  await page.locator('#repetirCompra').click();
  const n = await page.locator('#tLineas [data-lc]').count();
  expect(n).toBeGreaterThan(0);
  const antes = await page.locator('#tLineas [data-lc]').first().inputValue();
  await page.locator('#tLineas [data-mas="0"]').click();
  await expect(page.locator('#tLineas [data-lc]').first()).toHaveValue(String(Number(antes) + 1));
  await page.locator('#tLineas [data-menos="0"]').click();
  await expect(page.locator('#tLineas [data-lc]').first()).toHaveValue(antes);
  await expect(page.locator('#resFilas')).toContainText(`${n} ${n === 1 ? 'línea' : 'líneas'}`);
  await expect(page.locator('#totC')).not.toHaveText('S/ 0.00');
});
