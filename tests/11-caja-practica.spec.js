const { test, expect, abrirDemo, irA, abrirVenta } = require('./ayuda');

async function abrirTicket(page) {
  await page.locator('#estante .opc').first().click();
  await abrirVenta(page);
}

test('busca por código y abre otra venta sin volver a pedir el catálogo', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'vender');
  await page.locator('#buscar').fill('001292');
  await expect(page.locator('#estante .prod')).toHaveCount(1);
  await expect(page.locator('#estante .prod')).toContainText('Fini Ositos');
  await abrirTicket(page);
  await page.locator('#btnCobrar').click();
  await expect(page.locator('#ticket [role=status]')).toHaveText('Confirmada');
  await page.evaluate(() => {
    const desde = sb.from.bind(sb);
    window.consultasCatalogo = 0;
    sb.from = tabla => {
      if (tabla === 'v_precios_vigentes') window.consultasCatalogo++;
      return desde(tabla);
    };
  });
  await page.locator('#nueva').click();
  await expect(page.locator('#estante .prod').first()).toContainText('Reciente');
  expect(await page.evaluate(() => window.consultasCatalogo)).toBe(0);
});

test('al volver la señal confirma una venta guardada sin borrar el ticket nuevo', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'vender');
  await page.context().setOffline(true);
  await abrirTicket(page);
  await page.locator('#btnCobrar').click();
  await expect(page.locator('#ticket [role=status]')).toHaveText('Guardada en este equipo');
  await page.locator('#nueva').click();
  await abrirTicket(page);
  await page.context().setOffline(false);
  await expect(page.locator('#btnPendientes')).toBeHidden();
  await expect(page.locator('#ticket .linea')).toHaveCount(1);
  await expect(page.locator('#btnCobrar')).toBeEnabled();
});

test('si el servidor pierde la respuesta se comprueba el cobro sin reenviarlo', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'vender');
  await abrirTicket(page);
  await page.evaluate(() => {
    const rpc = sb.rpc.bind(sb);
    window.envios = 0;
    sb.rpc = async (fn, datos) => {
      if (fn !== 'registrar_venta') return rpc(fn, datos);
      window.envios++;
      await rpc(fn, datos);
      return { error: { message: 'Bad Gateway' }, status: 502 };
    };
  });
  await page.locator('#btnCobrar').click();
  await expect(page.locator('#ticket [role=status]')).toHaveText('Requiere revisión');
  await page.evaluate(() => subirPendientes(true));
  await expect(page.locator('#ticket [role=status]')).toHaveText('Confirmada');
  expect(await page.evaluate(() => window.envios)).toBe(1);
});

test('el Panel abre pendientes y lleva directamente al conteo', async ({ page, errores }) => {
  await abrirDemo(page);
  await page.evaluate(() => colaVentas.agregar({ id: 'local', p: {}, total: 5, medio: 'Efectivo', creada: new Date().toISOString() }));
  await irA(page, 'panel');
  await expect(page.locator('#accionCobrosPanel')).toContainText('1 venta pendiente');
  await page.locator('#btnRevisarCobrosPanel').click();
  await expect(page.locator('.velo:not(.oculto)')).toContainText('Ventas pendientes');
  await page.locator('.velo:not(.oculto) [data-x]').click();
  await page.locator('.pn-acciones [data-atajo-stock="conteo"]').click();
  await expect(page.locator('[data-stab="conteo"]')).toHaveClass(/\bon\b/);
});

test('con el catálogo lento Vender abre la copia y respeta el ticket en curso', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'vender');
  await irA(page, 'ventas');
  await page.evaluate(() => {
    const desde = sb.from.bind(sb);
    sb.from = tabla => {
      const consulta = desde(tabla), then = consulta.then;
      if (tabla === 'v_precios_vigentes') consulta.then = (ok, mal) => {
        window.liberaPrecios = () => then(ok, mal);
      };
      return consulta;
    };
  });
  await irA(page, 'vender');
  expect(await page.evaluate(() => typeof XLSX)).toBe('undefined');
  await expect(page.locator('#estadoCatalogoVender')).toContainText('copia de este equipo');
  await abrirTicket(page);
  await page.evaluate(() => { window.liberaPrecios(); });
  await expect(page.locator('#actualizarCatalogoVender')).toBeEnabled();
  await expect(page.locator('#ticket .linea')).toHaveCount(1);
});

test('el Panel conserva el acceso a Vender si fallan sus indicadores', async ({ page, errores }) => {
  await abrirDemo(page);
  await irA(page, 'vender');
  await page.evaluate(() => {
    const desde = sb.from.bind(sb);
    sb.from = tabla => {
      const consulta = desde(tabla);
      if (tabla === 'v_resultados_diarios') consulta.then = ok => ok({ error: { message: 'Failed to fetch' } });
      return consulta;
    };
  });
  await irA(page, 'panel');
  await expect(page.locator('#panelCargando [role=alert]')).toContainText('No se pudieron cargar los indicadores');
  await page.locator('.pn-acciones [data-ir="vender"]').click();
  await expect(page.locator('#estante .prod').first()).toBeVisible();
});
