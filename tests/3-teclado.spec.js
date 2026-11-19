// Atajos de teclado de Vender (solo laptop)
const { test, expect, abrirDemo, irA } = require('./ayuda');

test.beforeEach(() => test.skip(test.info().project.name !== 'laptop', 'Los atajos son para laptop'));

test('buscar, Enter agrega, Retroceso quita 1, Supr quita la línea', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'vender');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.type('marlboro');
  await expect(page.locator('#buscar')).toHaveValue('marlboro');
  await page.keyboard.press('Enter');
  await expect(page.locator('#buscar'), 'Después de agregar, la búsqueda se limpia').toHaveValue('');
  await page.keyboard.type('marlboro');
  await page.keyboard.press('Enter');
  const linea = page.locator('#ticket .linea[data-linea]');
  await expect(linea).toHaveCount(1);
  await expect(page.locator('#ticket .cab small')).toHaveText('2 artículos');

  await page.keyboard.press('Backspace');
  await expect(page.locator('#ticket .cab small')).toHaveText('1 artículo');
  await page.keyboard.press('Delete');
  await expect(linea).toHaveCount(0);
});

test('F2 cobra la venta', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'vender');
  await page.locator('#estante .opc').first().click();
  await page.keyboard.press('F2');
  await expect(page.locator('#ticket')).toContainText('Cobrado con');
});
