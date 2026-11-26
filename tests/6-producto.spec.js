// Nuevo producto: una sola pantalla con tres preguntas
const { test, expect, abrirDemo, irA, aceptarDialogo } = require('./ayuda');

async function abrir(page, marca) {
  await abrirDemo(page);
  await irA(page, 'catalogo');
  await page.locator('#btnNuevoProd').click();
  const np = page.locator('.asis.np');
  await np.locator('[data-cat]').filter({ hasText: 'Gomas' }).click();
  await np.locator('#aMarca').fill(marca);
  return np;
}
const comprables = (page, nombre) => page.evaluate(n => C.presentaciones.filter(p => p.productos?.nombre === n && p.se_compra).map(p => p.nombre).sort(), nombre);

test('gomitas por caja: muestra la ganancia y se puede comprar en caja o suelto', async ({ page, errores }) => {
  const np = await abrir(page, 'Caja Prueba');
  await expect(np.locator('[data-modo="caja"]')).toHaveClass(/on/);
  await expect(np.locator('#aPkF')).toHaveValue('12');
  await np.locator('#aCosto').fill('7.20');
  await expect(np.locator('#npMet')).toContainText('S/ 0.60');
  await expect(np.locator('#npChips [data-precio]').first()).toBeVisible();
  await np.locator('#aPu').fill('1');
  await expect(np.locator('#npPie')).toContainText('Ganas S/ 0.40 por bolsa');
  await expect(np.locator('#npMet')).toContainText('S/ 4.80');
  await expect(np.locator('#npTile')).toContainText('Caja Prueba');
  await np.locator('[data-a="crear"]').click();
  await expect(np).toContainText('Producto guardado');
  expect(await comprables(page, 'Caja Prueba')).toEqual(['Caja x 12', 'Unidad']);
  // Registrar su stock: abre Compras con la caja ya puesta y su costo
  await np.locator('[data-a="stock"]').click();
  await expect(np).toBeHidden();
  await expect(page.locator('#tLineas .cl-item').first()).toContainText('Caja Prueba');
  await expect(page.locator('#tLineas [data-lu]').first()).toHaveValue('7.2');
});

test('gomitas que llegan sueltas: solo por bolsa', async ({ page, errores }) => {
  const np = await abrir(page, 'Suelta Prueba');
  await np.locator('[data-modo="unidad"]').click();
  await expect(np.locator('#aPkF')).toHaveCount(0);
  await np.locator('#aCosto').fill('0.70');
  await np.locator('#npChips [data-precio]').first().click();
  await expect(np.locator('#aPu')).not.toHaveValue('');
  await expect(np.locator('#npPie')).toContainText('Ganas');
  await np.locator('[data-a="crear"]').click();
  await expect(np).toContainText('Producto guardado');
  expect(await comprables(page, 'Suelta Prueba')).toEqual(['Unidad']);
  // Crear otro de la misma categoría: el formulario vuelve limpio
  await np.locator('[data-a="otro"]').click();
  await expect(np.locator('#aMarca')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(np).toBeHidden();
  await expect(page.locator('table tr').filter({ hasText: 'Suelta Prueba' }).first()).toBeVisible();
});

test('avisa si pierdes plata y no deja guardar sin precio', async ({ page, errores }) => {
  const np = await abrir(page, 'Sin Precio');
  await np.locator('#aCosto').fill('12');
  await np.locator('#aPu').fill('0.50');
  await expect(np.locator('#npPie')).toContainText('Pierdes');
  await np.locator('#aPu').fill('');
  await np.locator('[data-a="crear"]').click();
  await expect(np.locator('[data-campo="pu"]')).toHaveClass(/err/);
  await expect(np.locator('[data-campo="pu"] .np-err')).toContainText('a cuánto vendes cada bolsa');
  await np.locator('#aPu').fill('1');
  await expect(np.locator('[data-campo="pu"]')).not.toHaveClass(/err/);
});

test('los botones − y + cambian cuántas trae la caja', async ({ page, errores }) => {
  const np = await abrir(page, 'Pasos');
  await np.locator('[data-paso="1"]').click();
  await expect(np.locator('#aPkF')).toHaveValue('13');
  await np.locator('#aPkF').fill('2');
  await np.locator('[data-paso="-1"]').click();
  await expect(np.locator('#aPkF')).toHaveValue('2');
});

test('editar un producto antiguo: pasar de solo caja a las dos formas', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'catalogo');
  const id = await page.evaluate(() => { const p = C.presentaciones.find(x => num(x.factor) > 1 && x.se_compra && !C.presentaciones.find(y => y.producto_id === x.producto_id && num(y.factor) === 1)?.se_compra); return p?.producto_id; });
  test.skip(!id, 'La demo no tiene productos solo por caja');
  await page.locator(`[data-editar="${id}"]`).click();
  await page.locator('form.dialogo select').last().selectOption('ambos');
  await aceptarDialogo(page);
  await expect(page.locator('body')).toContainText('Producto actualizado');
  expect(await page.evaluate(i => C.presentaciones.filter(p => p.producto_id === i && p.se_compra).length, id)).toBe(2);
});

test('compras: al elegir proveedor salen primero sus productos y lo demás queda guardado', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'compras');
  const prov = await page.evaluate(async () => {
    const h = await historialCostos();
    const cats = {}; h.forEach(x => { const c = C.presentaciones.find(p => p.producto_id === x.producto_id)?.productos?.categoria_id; (cats[x.proveedor_id] ??= new Set()).add(c); });
    return Object.entries(cats).find(([, s]) => s.size === 1)?.[0];
  });
  test.skip(!prov, 'La demo no tiene un proveedor de una sola categoría');
  await page.locator(`#cpProvs [data-provc="${prov}"]`).click();
  await expect(page.locator('#prov')).toHaveValue(prov);
  await expect(page.locator('#cpGrid .cp-gt').first()).toContainText('Lo que le compras a');
  await expect(page.locator('#cpGrid details.cp-otros')).not.toHaveAttribute('open', '');
});

test('compras: tocar productos, costo anterior, caja o unidad y registrar', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'compras');
  await expect(page.locator('.cl-vacio')).toBeVisible();
  await page.locator('#cpProvs [data-provc]').first().click();
  // Tocar un producto que ya compraste: entra con el último costo
  const nombre = await page.evaluate(async () => { const h = await historialCostos(); return h.length ? C.presentaciones.find(p => p.id === h[h.length - 1].presentacion_id).productos.nombre : null; });
  test.skip(!nombre, 'La demo no tiene compras');
  await page.locator('#cpBusca').fill(nombre);
  await page.locator('#cpBusca').press('Enter');
  const item = page.locator('#tLineas .cl-item').first();
  await expect(item).toContainText(nombre);
  await expect(item.locator('[data-lu]')).not.toHaveValue('');
  await expect(item).toContainText('último costo');
  // Tocarlo otra vez suma uno, no crea otra línea
  await page.locator('#cpGrid [data-addp]').filter({ hasText: nombre }).first().click();
  await expect(page.locator('#tLineas .cl-item')).toHaveCount(1);
  await expect(item.locator('[data-lc]')).toHaveValue('2');
  // Cambiar entre caja y unidad recalcula el costo
  const pres = item.locator('[data-lpres]');
  if (await pres.count() > 1) {
    const antes = Number(await item.locator('[data-lu]').inputValue());
    await pres.locator('nth=-1').click();
    await expect(item.locator('[data-lu]')).not.toHaveValue(String(antes));
  }
  await expect(page.locator('#totC')).not.toHaveText('S/ 0.00');
  await page.locator('#btnComprar').click();
  await expect(page.locator('body')).toContainText('Compra registrada');
  await expect(page.locator('.cl-vacio')).toBeVisible();
});

test('compras: sin costo marca el campo', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'compras');
  await page.locator('#cpProvs [data-provc]').first().click();
  await page.locator('#cpGrid [data-addp]').first().click();
  await page.locator('#tLineas [data-lu]').first().fill('');
  await page.locator('#btnComprar').click();
  await expect(page.locator('#tLineas [data-lu]').first()).toBeFocused();
});
