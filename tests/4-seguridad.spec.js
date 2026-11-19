// Seguridad dentro de la app
const { test, expect, abrirDemo, irA } = require('./ayuda');

test('el panel "Tu seguridad" muestra el puntaje y los dispositivos', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'cuenta');
  const seg = page.locator('.seguridad');
  await expect(seg).toContainText('Tu seguridad');
  await expect(seg.locator('.seg-anillo')).toHaveText(/\d\/4/);
  await expect(seg.locator('.vence-item')).toHaveCount(2);
  await expect(seg).toContainText('este equipo');
});

test('el tiempo de cierre automático se guarda', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'cuenta');
  await page.locator('#minInact').selectOption('15');
  expect(await page.evaluate(() => minInactividad())).toBe(15);
});

// La demo guarda todo en memoria y la borra al recargar; por eso se anota en sessionStorage
// qué borró la app justo antes de recargar.
const espiarBorrado = page => page.evaluate(() => {
  sessionStorage.removeItem('borrado');
  const orig = localStorage.removeItem.bind(localStorage);
  localStorage.removeItem = k => { sessionStorage.setItem('borrado', (sessionStorage.getItem('borrado') || '') + k + ','); return orig(k); };
});
const borrado = page => page.evaluate(() => (sessionStorage.getItem('borrado') || '').split(',').filter(Boolean));

test('con poco tiempo sin uso NO cierra la sesión', async ({ page, errores }) => {
  await abrirDemo(page);
  await page.evaluate(() => { local.guardar('minInactividad', 15); ultimaActividad = Date.now() - 10 * 60000; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => typeof ultimaActividad)).toBe('number'); // la página no se recargó
  await expect(page.locator('#app')).toBeVisible();
});

test('al volver a la app después del tiempo sin uso, cierra la sesión y borra los datos', async ({ page, errores }) => {
  await abrirDemo(page);
  await espiarBorrado(page);
  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(() => { local.guardar('minInactividad', 15); ultimaActividad = Date.now() - 16 * 60000; document.dispatchEvent(new Event('visibilitychange')); }),
  ]);
  await expect(page.locator('#aviso')).toContainText(/Cerramos tu sesión por \d+ minutos sin uso/);
  expect(await borrado(page)).toEqual(expect.arrayContaining(['caja:vender', 'caja:catalogos', 'caja:conteo']));
});

test('cerrar sesión borra de este equipo las copias de datos del negocio', async ({ page, errores }) => {
  await abrirDemo(page);
  await espiarBorrado(page);
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => $('#btnSalir').click())]);
  expect(await borrado(page)).toEqual(expect.arrayContaining(['caja:vender', 'caja:catalogos', 'caja:perfil', 'caja:conteo', 'caja:cuentaBilletes']));
});

test('si hay ventas sin subir, avisa antes de cerrar sesión', async ({ page, errores }) => {
  await abrirDemo(page);
  await page.evaluate(() => colaVentas.agregar({ id: 'x1', p: {}, total: 5, medio: 'Efectivo', creada: new Date().toISOString() }));
  await page.evaluate(() => $('#btnSalir').click());
  const d = page.locator('form.dialogo');
  await expect(d).toContainText('ventas sin subir');
  await d.locator('[data-x]').click();
  await expect(page.locator('#app')).toBeVisible();
});

test('un nombre de producto con código malicioso se muestra como texto, sin ejecutarse', async ({ page, errores }) => {
  await abrirDemo(page);
  const malo = '<img src=x onerror="window.__hackeado=1">Producto trampa';
  await page.evaluate(async n => {
    const { data } = await sb.from('productos').select('id').limit(1);
    await sb.from('productos').update({ nombre: n }).eq('id', data[0].id);
    await cargarCatalogosRed();
  }, malo);
  for (const p of ['vender', 'stock', 'catalogo', 'reportes', 'panel']) await irA(page, p);
  await irA(page, 'vender');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__hackeado)).toBeUndefined();
  await expect(page.locator('#estante'), 'El nombre aparece tal cual, como texto').toContainText('<img src=x onerror=');
});
