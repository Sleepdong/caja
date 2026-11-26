// Crear productos: cómo te llegan del proveedor (en caja, sueltos o de las dos formas)
const { test, expect, abrirDemo, irA, aceptarDialogo } = require('./ayuda');

async function abrirAsistente(page, marca) {
  await abrirDemo(page);
  await irA(page, 'catalogo');
  await page.locator('#btnNuevoProd').click();
  const asis = page.locator('.asis[role="dialog"]');
  await asis.locator('[data-cat]').filter({ hasText: 'Gomas' }).click();
  await asis.locator('#aMarca').fill(marca);
  await asis.locator('[data-a="sig"]').click();
  await expect(asis).toContainText('¿Cómo te llega del proveedor?');
  return asis;
}

// Fila del catálogo con el producto y sus presentaciones
const filasDe = (page, nombre) => page.locator('table tr').filter({ has: page.locator('b', { hasText: nombre }) });

test('gomitas que llegan sueltas: se compran por bolsa, sin caja', async ({ page, errores }) => {
  const asis = await abrirAsistente(page, 'Suelta Prueba');
  // La categoría Gomas viene en caja: se elige "Por bolsa"
  await expect(asis.locator('[data-compra="paq"]')).toHaveClass(/on/);
  await asis.locator('[data-compra="uni"]').click();
  await expect(asis.locator('#aPk')).toHaveCount(0);
  await asis.locator('#aCostoU').fill('0.50');
  await expect(asis.locator('[data-a="sug"]')).toBeVisible();
  await asis.locator('#aPu').fill('1');
  await expect(asis.locator('.consejo-claro')).toContainText('por bolsa suelta');
  await asis.locator('[data-a="crear"]').click();
  await expect(asis).toBeHidden();
  const fila = filasDe(page, 'Suelta Prueba');
  await expect(fila).toContainText('se compra así');
  await expect(fila).not.toContainText('Caja x');
});

test('de las dos formas: se puede comprar la caja y la bolsa suelta', async ({ page, errores }) => {
  const asis = await abrirAsistente(page, 'Ambas Prueba');
  await asis.locator('[data-compra="ambos"]').click();
  await asis.locator('#aPkF').fill('12');
  await asis.locator('#aCosto').fill('6');
  await asis.locator('#aCostoU').fill('0.60');
  await asis.locator('#aPu').fill('1');
  await expect(asis.locator('.consejo-claro')).toContainText('caja x 12 o por bolsa suelta');
  await expect(asis.locator('.consejo-claro')).toContainText('más por bolsa que en caja');
  await asis.locator('[data-a="crear"]').click();
  await expect(asis).toBeHidden();
  const comprables = await page.evaluate(() => C.presentaciones.filter(p => p.productos?.nombre === 'Ambas Prueba' && p.se_compra).map(p => p.nombre).sort());
  expect(comprables).toEqual(['Caja x 12', 'Unidad']);
});

test('en caja sin decir cuántas trae no deja crear', async ({ page, errores }) => {
  const asis = await abrirAsistente(page, 'Sin Factor');
  await asis.locator('#aPkF').fill('');
  await asis.locator('#aPu').fill('1');
  await asis.locator('[data-a="crear"]').click();
  await expect(asis).toBeVisible();
  await expect(page.locator('body')).toContainText('cuántas bolsas trae');
});

test('editar un producto: pasar de solo caja a las dos formas', async ({ page, errores }) => {
  const asis = await abrirAsistente(page, 'Editar Prueba');
  await asis.locator('#aPkF').fill('12');
  await asis.locator('#aPu').fill('1');
  await asis.locator('[data-a="crear"]').click();
  await expect(asis).toBeHidden();
  await filasDe(page, 'Editar Prueba').locator('[data-editar]').click();
  const form = page.locator('form.dialogo');
  await form.locator('select').last().selectOption('ambos');
  await aceptarDialogo(page);
  await expect(page.locator('body')).toContainText('Producto actualizado');
  const comprables = await page.evaluate(() => C.presentaciones.filter(p => p.productos?.nombre === 'Editar Prueba' && p.se_compra).length);
  expect(comprables).toBe(2);
});
