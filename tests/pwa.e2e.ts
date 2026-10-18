import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ baseURL: process.env.VIEWER_BASE_URL || `http://127.0.0.1:${process.env.PWA_TEST_PORT || 4179}` });

test('app installs an offline shell and cold-starts without storing or uploading documents', async ({ page, context, baseURL }) => {
  const requests: string[] = [];
  context.on('request', request => requests.push(request.url()));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#offline-status')).toHaveText('Ready for offline reading.');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const sentinel = 'PRIVATE-MARKDOWN-CONTENT-7e36e9';
  await page.locator('#file-input').setInputFiles({ name: 'Private.md', mimeType: 'text/markdown', buffer: Buffer.from('# ' + sentinel + '\n\n![Remote](https://example.com/private-leak.png)\n\n```mermaid\nflowchart LR\n A[Local] --> B[Read]\n```') });
  await expect(page.locator('#preview')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.diagram-light')).toHaveCount(1);
  await expect(page.locator('#preview h1')).toHaveText(sentinel);
  const storage = await page.evaluate(async () => {
    const cachesFound = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const request of await cache.keys()) {
        const response = (await cache.match(request))!;
        cachesFound.push({ key, url: request.url, body: await response.text() });
      }
    }
    return { cachesFound, local: { ...localStorage }, session: { ...sessionStorage }, databases: await indexedDB.databases() };
  });
  expect(JSON.stringify(storage)).not.toContain(sentinel);
  expect(storage.databases).toEqual([]);
  expect(Object.keys(storage.local).sort()).toEqual(['md-reader-theme', 'md-reader-wide']);
  expect(storage.session).toEqual({});
  expect(storage.cachesFound).toHaveLength(6);
  const networkRequests = requests.filter(url => /^https?:/.test(url));
  expect(networkRequests.filter(url => !url.startsWith(new URL(baseURL!).origin + '/'))).toEqual([]);
  expect(requests.join('\n')).not.toContain(sentinel);

  // Calibration: this request must fail; a privacy gate that cannot fail is useless.
  expect(await page.evaluate(async () => {
    try { await fetch('/privacy-probe', { method: 'POST', body: 'must-not-send' }); return 'sent'; }
    catch { return 'blocked'; }
  })).toBe('blocked');

  await page.screenshot({ path: 'test-results/pwa-reader-desktop.png' });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await context.setOffline(true);
  await page.close();
  const offline = await context.newPage();
  await offline.goto(baseURL!);
  await expect(offline.locator('#empty')).toBeVisible();
  await offline.locator('#file-input').setInputFiles({ name: 'Offline.md', mimeType: 'text/markdown', buffer: Buffer.from('# Opened offline') });
  await expect(offline.locator('#preview h1')).toHaveText('Opened offline');
  expect(errors).toEqual([]);
});

test('Finder launch queue opens multiple files and handles later launches', async ({ page }) => {
  // Browser integration is exercised here; actual macOS association is verified separately.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'launchQueue', { configurable: true, value: {
      setConsumer(consumer: unknown) { Reflect.set(window, 'finderConsumer', consumer); },
    } });
  });
  await page.goto('/');
  await page.evaluate(() => {
    const consumer = Reflect.get(window, 'finderConsumer');
    consumer({ files: [
      { getFile: async () => new File(['# First Finder file'], 'First.md') },
      { getFile: async () => new File(['# Second Finder file'], 'Second.markdown') },
    ] });
    consumer({ files: [{ getFile: async () => new File(['# Later Finder file'], 'Later.mdown') }] });
  });
  await expect(page.locator('#files .file-row')).toHaveCount(3);
  await expect(page.locator('#preview h1')).toHaveText('Later Finder file');
  await page.getByRole('button', { name: 'First.md', exact: true }).click();
  await expect(page.locator('#preview h1')).toHaveText('First Finder file');
  await page.evaluate(() => Reflect.get(window, 'finderConsumer')({ files: [{ getFile: async () => { throw new Error('permission revoked'); } }] }));
  await expect(page.locator('#notice')).toContainText('could not be read');
  await expect(page.locator('#preview h1')).toHaveText('First Finder file');
});

test('manifest and install help explain Mac opening and fit small screens', async ({ page, request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.file_handlers[0].accept['text/markdown']).toEqual(['.md', '.markdown', '.mdown', '.mkd']);
  expect(manifest.launch_handler.client_mode).toBe('focus-existing');
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  await page.goto('/');
  await page.locator('#file-input').setInputFiles('examples/team-handbook.md');
  await expect(page.locator('#preview h1')).toHaveText('Team handbook');
  await page.screenshot({ path: 'test-results/pwa-handbook.png' });
  await page.locator('#app-help').click();
  await expect(page.getByRole('dialog')).toContainText('Open With → Markdown Viewer');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'test-results/pwa-install-help.png' });
  await page.locator('#close-app-help').click();
  await expect(page.locator('#app-help')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#menu').click();
  await page.screenshot({ path: 'test-results/pwa-mobile.png' });
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.viewport);
});

test('an available update waits without reloading open documents', async ({ page, request }) => {
  test.skip(!!process.env.VIEWER_BASE_URL, 'Update trigger is confined to the local test server.');
  await page.goto('/');
  await expect(page.locator('#offline-status')).toHaveText('Ready for offline reading.');
  await page.locator('#example').click();
  await request.post('/__test-update');
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
  await expect(page.locator('#offline-status')).toContainText('Update ready.');
  await expect(page.locator('#preview h1')).toHaveText('A clearer view');
  expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())!.waiting)).toBe(true);
});
