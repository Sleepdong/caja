const { test, expect, abrirDemo, irA } = require('./ayuda');
const XLSX = require('xlsx');

test('Reportes, Análisis y Excel cuadran con más de 1000 ventas, devoluciones y anulaciones', async ({ page, errores }) => {
  await page.route('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', route =>
    route.fulfill({ path: require.resolve('xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript',
      headers: { 'access-control-allow-origin': '*' } }));
  await abrirDemo(page);
  const modelo = await page.evaluate(async () => {
    const fecha = hoy(), hora = fecha + 'T23:59:59.999-05:00';
    const pres = C.presentaciones.find(p => p.productos.nombre === 'Pall Mall BOOST' && num(p.factor) === 1), pid = pres.producto_id;
    const ventas = Array.from({ length: 1207 }, (_, i) => ({
      id: 'prueba-' + i, fecha: hora, estado: 'EMITIDA', origen: 'CAJA',
      venta_detalles: [{ presentacion_id: pres.id, cantidad_base: 1, subtotal: 10, costo_total: 4 }],
    }));
    ventas.push({ id: 'anulada', fecha: hora, estado: 'ANULADA', origen: 'CAJA', venta_detalles: [] });
    const rent = ventas.slice(0, 1207).map(() => ({
      fecha, producto_id: pid, presentacion_id: pres.id, cantidad_base: 1, venta_neta: 10, costo: 4,
    }));
    rent.push({ ...rent[0], cantidad_base: -1, venta_neta: -10, costo: -4 });
    const filas = {
      ventas,
      v_ventas_totales: ventas.map(v => ({ ...v, venta_id: v.id, total: 10 })),
      venta_detalles: ventas.slice(0, 1207).map(v => ({ ...v.venta_detalles[0], venta_id: v.id, linea: 1, cantidad: 1 })),
      v_lineas_rentabilidad: rent,
      v_resultados_diarios: [{ fecha, ventas_brutas: 12070, devoluciones: 10, ventas_netas: 12060,
        costo_mercaderia_vendida: 4824, utilidad_bruta: 7236, gastos_operativos: 36, utilidad_neta_estimada: 7200 }],
    };
    for (const [tabla, registros] of Object.entries(filas)) {
      await q(sb.from(tabla).delete());
      await q(sb.from(tabla).insert(registros));
    }
    const from = sb.from.bind(sb);
    window.paginasRentabilidad = [];
    sb.from = tabla => {
      const consulta = from(tabla), then = consulta.then;
      const range = consulta.range;
      consulta.range = (inicio, fin) => {
        if (tabla === 'v_lineas_rentabilidad') window.paginasRentabilidad.push(inicio);
        return range(inicio, Math.min(fin, inicio + 399));
      };
      consulta.then = (ok, mal) => then(r => ok({ ...r, data: Array.isArray(r.data) ? r.data.slice(0, 400) : r.data }), mal);
      return consulta;
    };
    local.guardar('repRango', { p: 'hoy' });
    local.guardar('anPeriodo', '7');
    return { ganancia: S(7236), ventas: S(12060), cantidad: N(1207), unidadesNetas: N(1206), neta: S(7200) };
  });
  await irA(page, 'reportes');
  await expect(page.locator('.rep-kpi').filter({ hasText: 'Ventas netas' }).locator('b')).toHaveText(modelo.ventas);
  await expect(page.locator('.rep-kpi').filter({ hasText: 'Ventas registradas' }).locator('b')).toHaveText(modelo.cantidad);
  await expect(page.locator('.rep-prod .fila-total td').nth(4)).toHaveText(modelo.ganancia);
  await expect(page.locator('.rep-kpi').filter({ hasText: 'Utilidad neta' }).locator('b')).toHaveText(modelo.neta);
  await expect(page.locator('#rSuelto tr').filter({ hasText: 'Pall Mall BOOST' }).locator('td').last()).toContainText(modelo.unidadesNetas + ' und.');
  expect(await page.evaluate(() => window.paginasRentabilidad)).toEqual([0, 400, 800, 1200]);

  const descarga = page.waitForEvent('download');
  await page.locator('#rExcel').click();
  const archivo = await descarga;
  const libro = XLSX.readFile(await archivo.path());
  const resumen = Object.fromEntries(XLSX.utils.sheet_to_json(libro.Sheets.Resumen, { header: 1 }).filter(f => f.length >= 2));
  const productos = XLSX.utils.sheet_to_json(libro.Sheets['Productos netos']);
  const detalle = XLSX.utils.sheet_to_json(libro.Sheets['Detalle de ventas emitidas']);
  expect(resumen).toMatchObject({ 'Ventas netas': 12060, 'Ganancia bruta': 7236, 'Ganancia neta': 7200, 'Ventas realizadas': 1207 });
  expect(productos[0]).toMatchObject({ 'Ventas netas': 12060, Ganancia: 7236 });
  expect(detalle.filter(f => f.Estado === 'EMITIDA')).toHaveLength(1207);

  await irA(page, 'analisis');
  await expect(page.locator('.an-card').filter({ hasText: 'Ventas netas' }).locator('b')).toHaveText(modelo.ventas);
  await expect(page.locator('.an-card').filter({ hasText: 'Ganancia bruta' }).locator('b')).toHaveText(modelo.ganancia);
  await expect(page.locator('.an-card').filter({ has: page.getByText('Ventas', { exact: true }) }).locator('b')).toHaveText(modelo.cantidad);
});

test('si faltan páginas se avisa y se retira el importe anterior', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'reportes');
  await expect(page.locator('.rep-kpi').first()).toBeVisible();
  await page.evaluate(() => {
    const from = sb.from.bind(sb);
    sb.from = tabla => {
      const consulta = from(tabla), then = consulta.then;
      if (tabla === 'v_lineas_rentabilidad') consulta.then = (ok, mal) => then(r => ok({ ...r, count: 1200, data: [] }), mal);
      return consulta;
    };
  });
  await page.locator('.rep-rap [data-p="semana"]').click();
  await expect(page.locator('#rOut [role="alert"]')).toContainText('El informe no está completo');
  await expect(page.locator('.rep-kpi')).toHaveCount(0);
  await expect(page.locator('#rExcel')).toBeDisabled();
});
