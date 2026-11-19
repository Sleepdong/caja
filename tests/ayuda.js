// Herramientas comunes para las pruebas
const { test: base, expect } = require('@playwright/test');

// Cada prueba falla si la app lanza un error de JavaScript
const test = base.extend({
  errores: async ({ page }, usar) => {
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    await usar(errores);
    expect(errores, 'La app no debe lanzar errores de JavaScript').toEqual([]);
  },
});

async function abrirDemo(page) {
  await page.goto('demo/');
  await page.waitForFunction(() => typeof ir === 'function' && !document.querySelector('#app')?.classList.contains('oculto'));
}

async function irA(page, pagina) {
  await page.evaluate(p => ir(p), pagina);
  await page.waitForLoadState('networkidle');
}

// Responde el diálogo abierto (dialogo() de la app) con el botón principal
async function aceptarDialogo(page) {
  const form = page.locator('.velo:not(.oculto) form.dialogo').last();
  await expect(form).toBeVisible();
  await form.locator('.acc button:not([data-x])').click();
  await expect(form).toBeHidden();
}

module.exports = { test, expect, abrirDemo, irA, aceptarDialogo };
