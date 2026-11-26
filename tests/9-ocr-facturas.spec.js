const { test, expect, abrirDemo, irA } = require('./ayuda');

const fotoTranscrita = `DISTRIBUCIONES WILLPERU S.A.C.
Cant. U.M. P.Unit. Dscto Importe
001355 GOMAS FINI BANANA (CJX12UN)
UNX80GR
4 UND 1.98 - 7.92
001285 GOMAS FINI BESOS DE FRESA
BOLSA (CJX12UN) UNX80G
4 UND 1.98 - 7.92
001287 GOMAS FINI BURGUERS
(CJX12UN) UNX80G
4 UND 1.98 - 7.92
001288 GOMAS FINI GUSANOS
(CJX12UN) UNX80GR
2 UND 1.98 - 3.96
001286 GOMAS FINI DENTADURAS
(CJX12UN) UNX80GR
2 UND 1.98 - 3.97
001295 GOMAS FINI OCEANITOS
(CJX12UN) UNX80G
2 UND 1.98 - 3.96
001292 GOMAS FINI OSITOS (CJX12UN)
UNX80G
2 UND 1.98 - 3.96
001293 GOMAS FINI PULPOS (CJX12UN)
UNX80G
2 UND 1.98 - 3.96
001304 MARSHMALLOW FINI CORAZON
(CJX12UN) UNX80G
2 UND 1.98 - 3.96
001534 BONIF.GOMAS FINI SAPOS
UNX80G
4 UND 0.00 - *Bonif*
10 items
InAF./Exo. S/ 47.53
Importe Total S/ 47.53`;

test('separa presentación comercial de cantidad e importe en el comprobante de referencia', async ({ page, errores }) => {
  await abrirDemo(page);
  const lectura = await page.evaluate(texto => {
    const lineas = extraerLineas(texto);
    const { nombre, marca, variante } = leerDescripcion(lineas[0].texto);
    return { lineas, nombre, marca, variante, total: totalFacturaOCR(texto), suma: r2(lineas.reduce((n, l) => n + l.importe, 0)) };
  }, fotoTranscrita);
  expect(lectura.lineas).toHaveLength(10);
  expect(lectura.lineas[0]).toMatchObject({ codigo: '001355', factor: 1, unidadesCaja: 12, pesoGramos: 80, cantidad: 4, unidadMedida: 'UND', costo: 1.98, importe: 7.92, bonif: false });
  expect(lectura).toMatchObject({ nombre: 'Gomas Fini Banana 80 g', marca: 'Fini', variante: 'Banana', total: 47.53, suma: 47.53 });
  expect(lectura.lineas[4]).toMatchObject({ costo: 1.98, importe: 3.97, cuadra: true });
  expect(lectura.lineas[9]).toMatchObject({ codigo: '001534', cantidad: 4, factor: 1, importe: 0, bonif: true });
});

test('interpreta cajas y muestra importes OCR en Compras sin un QR', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'compras');
  const otro = await page.evaluate(() => extraerLineas('AB-004 GALLETAS MARCA VAINILLA CJX6UN\n2 CJA 12,50 25,00\nTOTAL S/ 25,00'));
  expect(otro[0]).toMatchObject({ codigo: 'AB-004', factor: 6, cantidad: 2, importe: 25 });
  await page.evaluate(async texto => {
    cargarLibreria = async () => {};
    interpretarQR = () => null;
    leerQR = () => null;
    leerTexto = async () => texto;
    const bytes = Uint8Array.from(atob('R0lGODlhAQABAAAAACwAAAAAAQABAAA='), c => c.charCodeAt(0));
    await escanearFactura(new File([bytes], 'factura.gif', { type: 'image/gif' }));
  }, fotoTranscrita);
  await expect(page.locator('#escaneo .cuadre.ok')).toContainText('47.53');
  await expect(page.locator('#escaneo pre')).toHaveText(fotoTranscrita);
  await page.locator('#escFiltro').click();
  await expect(page.locator('#escaneo [data-cant]').first()).toHaveValue('4');
  await expect(page.locator('#escaneo [data-imp]').nth(4)).toHaveValue('3.97');
});

test('muestra solo excepciones y actualiza el resumen antes de preparar la compra', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'compras');
  const lectura = `Cant. U.M. P.Unit. Dscto Importe
001292 GOMAS FINI OSITOS (CJX12UN) UNX80G
2 UND 1.98 - 3.96
001292 BONIF.GOMAS FINI OSITOS UNX80G
3 UND 0.00 - *Bonif*
009999 AZUCAR PRUEBA ESPECIAL UNX80G
4 UND 1.98 - 7.92
Importe Total S/ 11.88`;
  await page.evaluate(async texto => {
    cargarLibreria = async () => {};
    interpretarQR = () => null;
    leerQR = () => null;
    leerTexto = async () => texto;
    const bytes = Uint8Array.from(atob('R0lGODlhAQABAAAAACwAAAAAAQABAAA='), c => c.charCodeAt(0));
    await escanearFactura(new File([bytes], 'factura.gif', { type: 'image/gif' }));
  }, lectura);

  await expect(page.locator('#escConteo')).toHaveText('2 líneas listas · 1 por revisar');
  await expect(page.locator('[data-revision-linea]')).toHaveCount(1);
  await expect(page.locator('[data-revision-linea="2"]')).toContainText('Elige el producto');
  await expect(page.locator('#escEntradas')).toHaveText('5 unidades');
  await expect(page.locator('#escRegalos')).toHaveText('3 unidades');
  await expect(page.locator('#escImporteCompra')).toContainText('3.96');

  await page.locator('#escFiltro').click();
  await expect(page.locator('[data-revision-linea]')).toHaveCount(3);
  await page.locator('#escFiltro').click();
  const producto = await page.evaluate(() => C.presentaciones.find(p => p.productos.codigo_factura === '001292' && num(p.factor) === 1).id);
  await page.locator('[data-pres="2"]').selectOption(producto);
  await expect(page.locator('[data-revision-linea]')).toHaveCount(0);
  await expect(page.locator('#escConteo')).toHaveText('3 líneas listas · 0 por revisar');
  await expect(page.locator('#escEntradas')).toHaveText('9 unidades');
  await expect(page.locator('#escImporteCompra')).toContainText('11.88');

  const proveedor = await page.locator('#escProvSel option').nth(1).getAttribute('value');
  await page.locator('#escProvSel').selectOption(proveedor);
  await expect(page.locator('#escProvSel')).toHaveCount(0);
  await page.evaluate(() => {
    const rpc = sb.rpc.bind(sb);
    sb.rpc = (fn, args) => {
      if (fn === 'registrar_compra') throw new Error('La revisión no debe registrar la compra');
      return rpc(fn, args);
    };
  });
  await page.locator('#escUsar').click();
  await expect(page.locator('#tLineas .cl-item')).toHaveCount(3);
  await expect(page.locator('#totC')).toContainText('11.88');
});
