// Pruebas automáticas de Caja.
// Corren contra la DEMO (/demo), que usa datos falsos en memoria: nunca tocan tu base de datos real.
// Uso:  cd tests && npm install && npx playwright install chromium && npm test
const { defineConfig, devices } = require('@playwright/test');

const PUERTO = 8799;

module.exports = defineConfig({
  testDir: '.',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PUERTO}/`,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1300, height: 900 } } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `python3 -m http.server ${PUERTO} --directory ..`,
    port: PUERTO,
    reuseExistingServer: !process.env.CI,
  },
});
