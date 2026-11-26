// Gastos: registrar rápido y ver a dónde se va la plata
const { test, expect, abrirDemo, irA } = require('./ayuda');

test('gastos: registrar con monto, categoría y medio a toques', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'gastos');
  await page.evaluate(() => { local.guardar('alertaCierre', false); document.getElementById('alertaCierreBar')?.remove(); });
  await page.locator('#gMonto').fill('3.50');
  await expect(page.locator('#btnGasto')).toContainText('S/ 3.50');
  await page.locator('[data-gcat]').first().click();
  await expect(page.locator('[data-gcat]').first()).toHaveClass(/on/);
  await page.locator('#gDesc').fill('Mototaxi prueba');
  await page.locator('[data-gmed]').filter({ hasText: /yape/i }).first().click();
  await page.locator('#btnGasto').click();
  await expect(page.locator('body')).toContainText('Gasto registrado');
  await expect(page.locator('#gLista')).toContainText('Mototaxi prueba');
});

test('gastos: sin monto no registra y la dona filtra los movimientos', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'gastos');
  await page.locator('#btnGasto').click();
  await expect(page.locator('#gMonto')).toBeFocused();
  const leyenda = page.locator('.gs-ley-f');
  test.skip(!(await leyenda.count()), 'La demo no tiene gastos este mes');
  const nombre = (await leyenda.first().locator('b').first().textContent()).trim();
  await leyenda.first().click();
  await expect(page.locator('#gFiltro')).toContainText(nombre);
  for (const t of await page.locator('#gLista .gs-mov-n small').allTextContents()) expect(t).toContain(nombre);
  await page.locator('#gSinFiltro').click();
  await expect(page.locator('#gFiltro')).toBeEmpty();
  // Mes pasado
  await page.locator('[data-gper="ant"]').click();
  await expect(page.locator('[data-gper="ant"]')).toHaveClass(/on/);
});
