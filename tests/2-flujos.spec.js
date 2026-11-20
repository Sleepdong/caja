// Flujos principales del negocio, usados como lo haría Luis (en laptop y en celular)
const { test, expect, abrirDemo, irA, aceptarDialogo } = require('./ayuda');

const PAGINAS = ['panel', 'vender', 'ventas', 'caja', 'compras', 'stock', 'gastos', 'catalogo', 'reportes', 'boletas', 'cuenta'];

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
  await irA(page, 'panel');
  const card = page.locator('.boletas');
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
