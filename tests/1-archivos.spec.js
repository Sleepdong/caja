// Revisiones de seguridad sobre los archivos (no abren el navegador)
const { test, expect } = require('@playwright/test');
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const scriptsEnLinea = html => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const hash = txt => "'sha256-" + crypto.createHash('sha256').update(txt, 'utf8').digest('base64') + "'";

test.beforeEach(() => test.skip(test.info().project.name !== 'laptop', 'Basta revisarlo una vez'));

for (const archivo of ['index.html', 'demo/index.html']) {
  test(`${archivo}: la política de seguridad (CSP) autoriza exactamente el código de la app`, () => {
    const html = leer(archivo);
    const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1];
    expect(csp, 'Debe tener una CSP').toBeTruthy();
    expect(csp).not.toContain("'unsafe-inline' 'unsafe-eval'");
    expect(csp).toMatch(/script-src[^;]*'sha256-/);
    expect(csp, 'Todo bloqueado salvo lo autorizado').toMatch(/default-src 'none'/);
    expect(csp).toMatch(/base-uri 'none'/);
    for (const s of scriptsEnLinea(html)) expect(csp, 'Recalcula con: python3 tools/csp.py ' + archivo).toContain(hash(s));
  });

  test(`${archivo}: cada librería externa trae su huella (SRI)`, () => {
    const externos = [...leer(archivo).matchAll(/<script[^>]*src="https:[^"]+"[^>]*>/g)].map(m => m[0]);
    for (const tag of externos) {
      expect(tag, tag).toMatch(/integrity="sha(256|384|512)-/);
      expect(tag, tag).toContain('crossorigin="anonymous"');
    }
  });
}

test('index.html: no usa eval ni new Function', () => {
  const codigo = scriptsEnLinea(leer('index.html')).join('\n');
  expect(codigo).not.toMatch(/\beval\s*\(/);
  expect(codigo).not.toMatch(/new\s+Function\s*\(/);
});

test('index.html: no se filtran claves secretas', () => {
  const html = leer('index.html');
  expect(html, 'Nunca pongas la service_role en la app').not.toMatch(/service_role/);
  expect(html).not.toMatch(/sk_live_|-----BEGIN [A-Z ]*PRIVATE KEY/);
});

test('index.html: no manda la dirección de origen a otras páginas', () => {
  expect(leer('index.html')).toContain('<meta name="referrer" content="no-referrer">');
});

test('la demo está al día con la app', () => {
  // build_demo.py copia el código de index.html a la demo: si cambias la app, regenera la demo
  const app = leer('index.html'), demo = leer('demo/index.html');
  const trozo = s => s.match(/async function cobrar\(\) \{[\s\S]{0,4000}/)[0];
  expect(trozo(demo), 'Ejecuta: python3 tools/build_demo.py').toBe(trozo(app));
});

test('el service worker tiene versión de caché', () => {
  expect(leer('sw.js')).toMatch(/const CACHE_APP = 'caja-app-v\d+'/);
});
