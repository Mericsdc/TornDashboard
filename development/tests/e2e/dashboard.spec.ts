import { test, expect, chromium } from '@playwright/test';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { defaultState, type PublicState } from '@tcd/shared';

test('preview recovers after SPA replacement and falls back below content on narrow screens', async ({ page }) => {
  await page.goto('/'); const host = page.locator('#tcd-dashboard');
  await expect(host).toHaveAttribute('data-placement', 'gutters');
  await expect(host.locator('.panel')).toHaveCount(2);
  await page.getByRole('button', { name: 'Simulate SPA navigation' }).click();
  await expect(host).toHaveCount(1); await expect(host.locator('.widget-card')).toHaveCount(6);
  await page.setViewportSize({ width: 760, height: 900 }); await expect(host).toHaveAttribute('data-placement', 'inline');
  const main = await page.locator('main').boundingBox(); const dashboard = await host.boundingBox();
  expect(dashboard!.y).toBeGreaterThanOrEqual(main!.y + main!.height);
  await page.setViewportSize({ width: 1920, height: 1080 }); await expect(host).toHaveAttribute('data-placement', 'gutters');
  await host.getByLabel('Panel settings').click(); await host.getByLabel('theme', { exact: true }).selectOption('slate');
  await expect(host.locator('.dashboard')).toHaveAttribute('data-theme', 'slate');
  await page.reload(); await expect(host.locator('.dashboard')).toHaveAttribute('data-theme', 'slate');
});

test('updating the installed folder retains extension identity, BOSBOT pairing and user preferences', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium');
  const extensionPath = resolve('..');
  const profile = testInfo.outputPath('update-profile');
  const launch = () => chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
  const staging = await mkdtemp(join(tmpdir(), 'torndashboard-update-e2e-'));
  const scriptUrl = new URL('../../scripts/extension-runtime.mjs', import.meta.url).href;
  const { readRuntime, promoteExtension } = await import(/* @vite-ignore */ scriptUrl);
  const original = await readRuntime(extensionPath);
  let context = await launch();
  try {
    let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).hostname;
    const state = defaultState(); state.settings.theme = 'slate'; state.settings.gap = 14;
    const bosbotDevice = { origin: 'http://127.0.0.1:4318', token: 'TEST_ONLY_UPDATE_DEVICE_TOKEN_000000000000', deviceId: 'test_update_device_000000000000', expiresAt: Date.now() + 86400000 };
    await worker.evaluate(async data => { await chrome.storage.local.set(data); }, { state, bosbotDevice, bosbotOnlyV3: true });
    await context.close();
    for (const [name, contents] of original.files) await writeFile(join(staging, name), contents);
    const updatedManifest = { ...original.manifest, version: '0.3.2' };
    await writeFile(join(staging, 'manifest.json'), JSON.stringify(updatedManifest));
    await promoteExtension(staging, extensionPath);
    context = await launch(); worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    expect(new URL(worker.url()).hostname).toBe(id);
    expect(await worker.evaluate(() => chrome.runtime.getManifest().name)).toBe('TornDashboard');
    expect(await worker.evaluate(() => chrome.runtime.getManifest().version)).toBe('0.3.2');
    const retained = await worker.evaluate(async () => chrome.storage.local.get<{ state: PublicState; bosbotDevice: unknown }>(['state', 'bosbotDevice']));
    expect(retained.bosbotDevice).toEqual(bosbotDevice);
    expect(retained.state.settings.theme).toBe('slate'); expect(retained.state.settings.gap).toBe(14);
  } finally {
    await context.close();
    for (const [name, contents] of original.files) await writeFile(join(staging, name), contents);
    await promoteExtension(staging, extensionPath); await rm(staging, { recursive: true, force: true });
  }
});

test('legacy state migrates to BOSBOT only while preserving drag positions and blocking private storage', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium');
  const extensionPath = resolve('..');
  const context = await chromium.launchPersistentContext(testInfo.outputPath('legacy-profile'), { channel: 'chromium', headless: true, viewport: { width: 1920, height: 1080 }, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker'), id = new URL(worker.url()).hostname;
    const legacy = defaultState(); legacy.settings.dataSource = 'mock'; legacy.settings.autoSwitching = false; legacy.settings.theme = 'torn-dark';
    await worker.evaluate(async state => { await chrome.storage.local.clear(); await chrome.storage.local.set({ state }); }, legacy);
    const fixture = (await readFile('packages/extension/demo/index.html', 'utf8')).replace('<script type="module" src="demo.js"></script>', '');
    await context.route('https://www.torn.com/**', route => route.fulfill({ body: fixture, contentType: 'text/html' }));
    const page = await context.newPage(); await page.goto('https://www.torn.com/index.php'); const host = page.locator('#tcd-dashboard');
    await expect(host.locator('.source-badge')).toHaveText('NO DATA'); await expect(host.locator('.dashboard')).toHaveAttribute('data-theme', 'liquid-glass');
    const options = await context.newPage(); await options.goto(`chrome-extension://${id}/options.html`); await expect(options.locator('#status')).toHaveText('Ready');
    await expect(options.locator('[name="dataSource"]')).toHaveCount(0); await expect(options.locator('[name="tornKey"]')).toHaveCount(0);
    await host.getByLabel('Dashboard preset').selectOption('WAR');
    const left = host.locator('.widget-list[data-side="left"]'), right = host.locator('.widget-list[data-side="right"]');
    const handle = await left.getByLabel('Drag Recommended Targets', { exact: true }).boundingBox(), destination = await right.boundingBox();
    await page.mouse.move(handle!.x + handle!.width/2, handle!.y + handle!.height/2); await page.mouse.down();
    await page.mouse.move(handle!.x + handle!.width/2+15, handle!.y + handle!.height/2, { steps: 4 });
    await page.mouse.move(destination!.x + destination!.width/2, destination!.y + destination!.height-10, { steps: 30 }); await page.mouse.up();
    await expect(right.locator('[data-widget-id="recommended-targets"]')).toHaveCount(1);
    await page.reload(); await expect(right.locator('[data-widget-id="recommended-targets"]')).toHaveCount(1);
    const migrated = await worker.evaluate(async () => (await chrome.storage.local.get<{ state: PublicState }>('state')).state); expect(migrated.settings.dataSource).toBe('bosbot');
    await expect(host.locator('[data-widget-id="travel-profit"]')).toHaveCount(0);
    await expect(host.locator('[data-widget-id="company-addiction"]')).toHaveCount(0);
    const cdp = await context.newCDPSession(page); let isolated = 0;
    cdp.on('Runtime.executionContextCreated', event => { if (event.context.auxData?.type === 'isolated' && !event.context.name.startsWith('__playwright')) isolated = event.context.id; });
    await cdp.send('Runtime.enable'); await expect.poll(() => isolated).toBeGreaterThan(0);
    const denied = await cdp.send('Runtime.evaluate', { contextId: isolated, expression: `chrome.runtime.sendMessage({type:'BOSBOT_CONNECT'})`, awaitPromise: true, returnByValue: true }); expect(denied.result.value).toMatchObject({ ok: false });
    const inaccessible = await cdp.send('Runtime.evaluate', { contextId: isolated, expression: `(async()=>{try{await chrome.storage.local.get('bosbotDevice');return false}catch{return true}})()`, awaitPromise: true, returnByValue: true }); expect(inaccessible.result.value).toBe(true);
  } finally { await context.close(); }
});

test('BOSBOT pairing, live widgets, restart persistence and revocation keep device credentials private', async ({ browserName }, testInfo) => {
  test.setTimeout(90000);
  expect(browserName).toBe('chromium');
  const { default: Fastify } = await import('fastify');
  const server = Fastify();
  const token = 'TEST_ONLY_BOSBOT_DEVICE_TOKEN_000000000000000000000';
  let approved = false; let revoked = false; let pairingRequests = 0; let snapshotRequests = 0;
  const source = {
    source: 'live', provider: 'bosbot', generatedAt: Date.now(), issues: {},
    war: { active: true, opponent: 'BOSBOT opponent', score: 500, enemyScore: 400, targetScore: 1000, endsAt: null, observedAt: Date.now() },
    chain: { count: 49, goal: 50, expiresAt: Date.now() + 120000, observedAt: Date.now() },
    travel: { active: false, origin: 'Torn', destination: 'Japan', arrivesAt: Date.now() + 600000, observedAt: Date.now() }, player: { level: 40 },
    targets: [
      { id: 123, name: 'BOSBOT recommendation', level: 20, status: 'Okay', activity: 'online', observedAt: Date.now(), hospitalUntil: null, wins: null, losses: null, battleStats: null, statsSource: null, recommendation: { score: 777, reasons: ['Assigned by BOSBOT'], confidence: 'low', label: 'BOSBOT availability' } },
      { id: 124, name: 'BOSBOT hospitalized', level: 25, status: 'Hospital', activity: 'offline', observedAt: Date.now(), hospitalUntil: Date.now() + 120000, wins: null, losses: null, battleStats: null, recommendation: { score: 0, reasons: ['Hospitalized'], confidence: 'low', label: 'BOSBOT availability' } }
    ],
    company: { isDirector: false, name: '', observedAt: null, employees: [] } as { isDirector: boolean; name: string; observedAt: number | null; employees: { id: number; name: string; addictionEffect: number | null }[] },
    stocks: [{ itemId: 206, name: 'Xanax', country: 'Switzerland', stock: 50, cost: 100, tornValue: 400, priceObservedAt: Date.now(), observedAt: Date.now(), restock: { kind: 'estimated', earliest: Date.now() + 100000, latest: Date.now() + 300000, confidence: 'low', samples: 3, lastSeenRestock: Date.now() - 500000, intervalHistory: [600000, 610000] } }],
    favorites: [{ itemId: 206, name: 'Xanax', country: 'Switzerland', minimumStock: 7, alert: true }]
  };
  server.post('/api/extension/pair/start', async () => {
    pairingRequests++; return { pairingId: 'test_pairing_id_000000000000', pollingSecret: 'TEST_ONLY_POLL_SECRET_000000000000', expiresAt: Date.now() + 300000, verificationUrl: 'http://127.0.0.1:4318/extension/connect?pairingId=test_pairing_id_000000000000' };
  });
  server.get('/extension/connect', async (_, reply) => reply.type('text/html').send('<h1>Fixture approval page</h1>'));
  server.post('/api/extension/pair/poll', async () => approved ? { status: 'approved', token, deviceId: 'test_device_000000000000', expiresAt: Date.now() + 86400000 } : { status: 'pending' });
  server.get('/api/extension/snapshot', async (request, reply) => {
    snapshotRequests++;
    if (revoked || request.headers.authorization !== `Bearer ${token}`) return reply.code(401).send({ error: 'Revoked' });
    return { ...source, generatedAt: Date.now() };
  });
  server.delete('/api/extension/device', async () => { revoked = true; return { revoked: true }; });
  await server.listen({ host: '127.0.0.1', port: 4318 });
  const extensionPath = resolve('..'); const profile = testInfo.outputPath('bosbot-profile');
  const launch = () => chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1920, height: 1080 }, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
  let context = await launch();
  const fixture = (await readFile('packages/extension/demo/index.html', 'utf8')).replace('<script type="module" src="demo.js"></script>', '');
  try {
    let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).hostname;
    await context.route('https://www.torn.com/**', route => route.fulfill({ body: fixture, contentType: 'text/html' }));
    await worker.evaluate(async state => { await chrome.storage.local.set({ state }); }, { ...defaultState(), settings: { ...defaultState().settings, bosbotUrl: 'http://127.0.0.1:4318', autoSwitching: true } });
    const page = await context.newPage(); await page.goto('https://www.torn.com/index.php');
    const host = page.locator('#tcd-dashboard'); await expect(host.locator('.source-badge')).toHaveText('NO DATA');
    const options = await context.newPage(); await options.goto(`chrome-extension://${id}/options.html`); await expect(options.locator('#status')).toHaveText('Ready');
    await options.getByRole('button', { name: 'Connect BOSBOT account', exact: true }).click();
    await expect(options.locator('#bosbot-status')).toContainText('Waiting for approval'); approved = true;
    await expect(options.locator('#bosbot-status')).toContainText('live feed verified');
    await expect(host.locator('.source-badge')).toHaveText('BOSBOT'); await expect(host.getByLabel('Dashboard preset')).toHaveValue('WAR');
    await expect(host.locator('[data-widget-id="war-status"]')).toContainText('BOSBOT opponent');
    await expect(host.locator('[data-widget-id="chain"]')).toContainText('49 / 50');
    await expect(host.locator('[data-widget-id="hospital-timers"]')).toContainText('BOSBOT hospitalized');
    await expect(host.locator('[data-widget-id="recommended-targets"]')).toContainText('777');
    await expect(host.locator('[data-widget-id="recommended-targets"]')).toContainText('Stats: unknown');
    await expect(host.locator('[data-widget-id="travel-favorites"]')).toContainText('IN STOCK');
    await expect(host.locator('[data-widget-id="restock"]')).toContainText('ESTIMATED WINDOW');
    const secondTornTab = await context.newPage(); await secondTornTab.goto('https://www.torn.com/profiles.php?XID=123');
    await expect(secondTornTab.locator('#tcd-dashboard .source-badge')).toHaveText('BOSBOT'); expect(snapshotRequests).toBe(1);
    await options.getByRole('button', { name: 'Import BOSBOT favorites', exact: true }).click();
    await expect(options.getByLabel('Minimum stock for Xanax in Switzerland')).toHaveValue('7');
    expect(await host.textContent()).not.toContain(token);
    const publicReply = await options.evaluate(async () => chrome.runtime.sendMessage({ type: 'READ_STATE' }));
    expect(JSON.stringify(publicReply)).not.toContain(token);
    const cdp = await context.newCDPSession(page); let isolated = 0;
    cdp.on('Runtime.executionContextCreated', event => { if (event.context.auxData?.type === 'isolated' && !event.context.name.startsWith('__playwright')) isolated = event.context.id; });
    await cdp.send('Runtime.enable'); await expect.poll(() => isolated).toBeGreaterThan(0);
    const denied = await cdp.send('Runtime.evaluate', { contextId: isolated, expression: `chrome.runtime.sendMessage({type:'BOSBOT_STATUS'})`, awaitPromise: true, returnByValue: true });
    expect(denied.result.value).toMatchObject({ ok: false });
    const deniedStorage = await cdp.send('Runtime.evaluate', { contextId: isolated, expression: `(async()=>{try{await chrome.storage.local.get('bosbotDevice');return false}catch{return true}})()`, awaitPromise: true, returnByValue: true });
    expect(deniedStorage.result.value).toBe(true);
    // Test the actual offscreen document and bundled audio, rather than mocking playback.
    await options.getByRole('button', { name: 'Test warning sound', exact: true }).click();
    await expect(options.locator('#status')).toContainText('Warning sound played');
    const offscreen = await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })); expect(offscreen.length).toBe(1);
    source.travel.active = true;
    source.stocks.push({ itemId: 268, name: 'Cherry Blossom', country: 'Japan', stock: 25, cost: 500, tornValue: 20000, priceObservedAt: Date.now(), observedAt: Date.now(), restock: { kind: 'estimated', earliest: Date.now()+100000, latest: Date.now()+300000, confidence: 'low', samples: 3, lastSeenRestock: Date.now()-500000, intervalHistory: [600000,610000] } });
    source.stocks.push({ ...source.stocks[1]!, itemId: 269, name: 'Monkey Plushie', stock: 0, tornValue: 40000 });
    await options.getByRole('button', { name: 'Refresh BOSBOT data', exact: true }).click();
    await expect(host.getByLabel('Dashboard preset')).toHaveValue('TRAVEL');
    const market = host.locator('[data-widget-id="travel-market"]'); await expect(market).toContainText('Automatically detected: Japan');
    await expect(market.locator('.profit-hero')).toContainText('Cherry Blossom');
    await expect(market.locator('.market-product')).toHaveCount(2);
    await market.getByLabel('In stock only', { exact: true }).check(); await expect(market.locator('.market-product')).toHaveCount(1);
    await market.getByLabel('In stock only', { exact: true }).uncheck(); await market.getByLabel('Search products').fill('monkey'); await expect(market.locator('.market-product')).toHaveCount(1); await expect(market.locator('.market-product')).toContainText('Monkey Plushie');
    await market.getByLabel('Search products').fill(''); await market.getByLabel('Watch Cherry Blossom in Japan', { exact: true }).click();
    const calculator = host.locator('[data-widget-id="travel-profit"]'); await expect(calculator).toHaveCount(1);
    await calculator.getByLabel('Quantity', { exact: true }).fill('10'); await expect(calculator).toContainText('$195,000');
    await page.screenshot({ path: resolve('docs/bosbot-travel-preview.png'), fullPage: true });
    source.travel.active = false; source.war.active = false; source.company = { isDirector: true, name: 'BOSBOT Company', observedAt: Date.now(), employees: [{ id: 111, name: 'Employee A', addictionEffect: -8 }] };
    await options.getByRole('button', { name: 'Refresh BOSBOT data', exact: true }).click();
    await expect(host.getByLabel('Dashboard preset')).toHaveValue('NORMAL'); await expect(host.locator('[data-widget-id="travel-profit"]')).toHaveCount(0);
    await expect(host.locator('[data-widget-id="company-addiction"]')).toContainText('Employee A');
    source.chain.expiresAt = Date.now()+30000; source.chain.observedAt = Date.now();
    await options.getByRole('button', { name: 'Refresh BOSBOT data', exact: true }).click();
    await expect(host.locator('[data-widget-id="chain"] .chain-warning')).toBeVisible();
    await expect.poll(async () => (await worker.evaluate(async () => (await chrome.storage.local.get<{ alertState: { memory: { seen: string[] } } }>('alertState')).alertState.memory.seen)).filter((key: string) => key.startsWith('chain:')).length).toBe(1);
    await expect.poll(async () => await worker.evaluate(async () => (await chrome.storage.local.get<{ alertDelivery: { failed: boolean } }>('alertDelivery')).alertDelivery.failed)).toBe(false);
    source.stocks[1]!.stock = 0; source.stocks[1]!.observedAt = Date.now();
    await options.getByRole('button', { name: 'Refresh BOSBOT data', exact: true }).click();
    await expect(host.locator('[data-widget-id="travel-favorites"]')).toContainText('OUT OF STOCK');
    source.stocks[1]!.stock = 10; source.stocks[1]!.observedAt = Date.now();
    await options.getByRole('button', { name: 'Refresh BOSBOT data', exact: true }).click();
    await expect.poll(async () => (await worker.evaluate(async () => (await chrome.storage.local.get<{ alertState: { memory: { seen: string[] } } }>('alertState')).alertState.memory.seen)).filter((key: string) => key.startsWith('stock:')).length).toBe(1);
    await page.screenshot({ path: resolve('docs/bosbot-preview.png'), fullPage: true });
    await context.close(); context = await launch();
    worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await context.route('https://www.torn.com/**', route => route.fulfill({ body: fixture, contentType: 'text/html' }));
    const reopened = await context.newPage(); await reopened.goto('https://www.torn.com/index.php');
    await expect(reopened.locator('#tcd-dashboard .source-badge')).toHaveText('BOSBOT'); expect(pairingRequests).toBe(1);
    const reopenedOptions = await context.newPage(); await reopenedOptions.goto(`chrome-extension://${id}/options.html`);
    await expect(reopenedOptions.locator('#bosbot-status')).toContainText('live feed verified');
    await reopenedOptions.getByRole('button', { name: 'Disconnect BOSBOT', exact: true }).click();
    await expect(reopenedOptions.locator('#bosbot-status')).toContainText('No BOSBOT account connected');
    await reopened.reload(); await expect(reopened.locator('#tcd-dashboard .source-badge')).toHaveText('NO DATA');
    expect(revoked).toBe(true);
  } finally { await context.close(); await server.close(); }
});
