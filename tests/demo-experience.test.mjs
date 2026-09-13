import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startServer, root } from '../tools/serve.mjs';
import { launchBrowser, browserName } from '../tools/browser.mjs';

let server, browser, initialHash;
const evidence = [];
const output = join(root, 'test-results', 'demo-experience', browserName);
const hash = async () => createHash('sha256').update(await readFile(join(root, 'demo/index.html'))).digest('hex');
const planned = page => page.locator('#grid .tile:not(.locked)');
const library = page => page.locator('#railitems .bitem');
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('gridsmith.v3')));
const selected = page => page.locator('.tile.selected,.bitem.selected').evaluateAll(nodes => nodes.map(node => node.dataset.id));
async function until(check, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 40)); }
  assert.fail(message);
}
const count = (locator, expected) => until(async () => await locator.count() === expected, `Expected ${expected} elements`);
async function scenario(t, run, { width = 1440, height = 1000, offline = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = [], network = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url()) && (offline || request.resourceType() !== 'document')) network.push(request.url()); });
  let passed = false, failure;
  try {
    let entry = server.url;
    if (offline) {
      const portable = join(output, 'copied-demo.html');
      await writeFile(portable, await readFile(join(root, 'demo/index.html')));
      // This remains effective for file URLs in all three desktop engines.
      await context.route(/^https?:\/\//, route => route.abort('internetdisconnected'));
      entry = pathToFileURL(portable).href;
    }
    await page.goto(entry); await count(planned(page), 12); await count(library(page), 6);
    await run(page);
    assert.deepEqual(errors, [], 'The experience must not throw browser errors');
    assert.deepEqual(network, [], 'Manual samples and ZIP export need no HTTP assets');
    passed = true;
  } catch (error) {
    failure = error.message;
    await page.screenshot({ path: join(output, t.name.replace(/[^a-z0-9]+/gi, '-') + '.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    evidence.push({ test: t.name, width, height, offline, passed, failure, errors, network });
    await context.close();
  }
}
before(async () => {
  await mkdir(output, { recursive: true }); initialHash = await hash();
  server = await startServer(); browser = await launchBrowser();
});
after(async () => {
  const version = browser?.version(); await browser?.close(); await server?.close();
  const finalHash = await hash();
  await writeFile(join(output, 'results.json'), JSON.stringify({ engine: browserName, version, initialHash, finalHash,
    artifactStable: initialHash === finalHash,
    limits: ['Desktop engines with simulated viewport widths; no real mobile devices.', 'Copied-file cases abort all HTTP(S) routes before navigation.'],
    tests: evidence }, null, 2) + '\n', 'utf8');
  assert.equal(finalHash, initialHash, 'Repeat tests if the built artifact changes during this run');
});

for (const options of [{ width: 1440 }, { width: 320 }, { width: 390, offline: true }]) {
  test(`manual sample import at ${options.width}px${options.offline ? ' in a copied offline file' : ''} preserves work and requires confirmation`, t => scenario(t, async page => {
    // Establish actual user work through the ordinary editor and draft controls.
    await planned(page).first().click();
    await page.getByLabel('Caption', { exact: true }).fill('A caption to preserve');
    await page.getByLabel('Planned date', { exact: true }).fill('2026-10-17');
    await page.getByRole('button', { name: 'Close post preview', exact: true }).click();
    await page.locator('#drafts-toggle').click(); await page.locator('#draft-name').fill('Keep this draft');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await page.keyboard.press('Escape');
    await planned(page).first().focus(); await page.keyboard.press('Space');
    const before = await stored(page), selection = await selected(page);
    const entry = page.getByRole('button', { name: 'Try a grid import', exact: true });
    const bounds = await entry.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= options.width && bounds.height >= 36, 'The manual entry is visible and usable at this width');
    await entry.focus(); await page.keyboard.press('Enter');
    await page.locator('#import-review').waitFor({ state: 'visible' }); await count(page.locator('.import-tile'), 16);
    await until(async () => await page.locator('.import-confirm').isEnabled(), 'Sample review must become ready');
    assert.equal(await page.locator('.import-file h3').textContent(), 'gridsmith-sample-grid.png');
    assert.equal(await page.locator('#guide-card').evaluate(node => node.matches(':popover-open')), false, 'Manual import must not start the tour');
    assert.deepEqual(await stored(page), before, 'Reviewing does not change saved work');
    await count(library(page), 6); assert.deepEqual(await selected(page), selection);
    await page.getByRole('button', { name: 'View photo 1 crop', exact: true }).click();
    await page.locator('#import-crop-view').waitFor({ state: 'visible' });
    assert.match(await page.locator('.import-crop-size').textContent(), /100 × 100/);
    await page.getByRole('button', { name: 'Close crop preview', exact: true }).click();
    await page.locator('.import-cancel').click(); await page.locator('#import-review').waitFor({ state: 'hidden' });
    assert.equal(await entry.evaluate(node => node === document.activeElement), true, 'Cancel returns keyboard focus to the manual entry');
    assert.deepEqual(await stored(page), before); assert.deepEqual(await selected(page), selection);
    await page.keyboard.press('Enter'); await page.locator('#import-review').waitFor({ state: 'visible' });
    await count(page.locator('.import-tile'), 16);
    await until(async () => await page.locator('.import-confirm').isEnabled(), 'Repeated review must become ready');
    await page.getByRole('button', { name: 'Select none', exact: true }).click();
    assert.equal(await page.locator('.import-confirm').isDisabled(), true);
    await page.locator('.import-tile input').first().check();
    await count(library(page), 6);
    await page.locator('.import-confirm').click(); await page.locator('#import-review').waitFor({ state: 'hidden' });
    await count(library(page), 7);
    const after = await stored(page);
    assert.deepEqual(after.order, before.order); assert.deepEqual(after.meta, before.meta); assert.deepEqual(after.drafts, before.drafts);
    assert.deepEqual(await selected(page), selection);
    assert.equal(await page.locator('#guide-card').evaluate(node => node.matches(':popover-open')), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.reload(); await count(library(page), 7);
    assert.deepEqual((await stored(page)).meta, before.meta);
  }, options));
}

for (const options of [{ width: 1440, height: 1000 }, { width: 320, height: 640 }, { width: 390, height: 844, offline: true }]) {
  test(`demo invitation leaves controls accessible and stays dismissed at ${options.width} by ${options.height}`, t => scenario(t, async page => {
    if (options.width < 760) {
      const toggle = page.locator('#library-collapse');
      const expanded = await toggle.getAttribute('aria-expanded');
      await toggle.click();
      assert.notEqual(await toggle.getAttribute('aria-expanded'), expanded, 'Library must work before dismissing the invitation');
      await toggle.click();
    }
    await planned(page).first().click();
    await page.getByLabel('Caption', { exact: true }).fill('My work stays when I hide the demo');
    await page.getByRole('button', { name: 'Close post preview', exact: true }).click();
    const before = await stored(page);
    await page.getByRole('button', { name: 'Dismiss demo invitation', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.guide-dock').isVisible(), false);
    assert.equal(await page.locator('#grid').evaluate(node => document.activeElement === node), true);
    assert.deepEqual(await stored(page), before, 'Dismissal is separate from the layout');
    await page.reload(); await count(planned(page), 12);
    assert.equal(await page.locator('.guide-dock').isVisible(), false, 'Dismissal persists through reload');
    await planned(page).first().focus(); await page.keyboard.press('Space');
    const selection = await selected(page); assert.equal(selection.length, 1);
    await page.locator('#helpbutton').click(); await page.keyboard.press('Escape');
    await page.locator('#help-dialog').waitFor({ state: 'hidden' });
    assert.deepEqual(await selected(page), selection, 'Escape closes Help without clearing photos underneath');
    await page.locator('#helpbutton').click();
    await page.locator('#guide-help-import').click();
    await count(page.locator('.import-tile'), 16);
    assert.deepEqual(await stored(page), before);
    await page.locator('.import-cancel').click();
    assert.equal(await page.locator('#helpbutton').evaluate(node => document.activeElement === node), true, 'Cancel returns to an available Help control');
    await page.locator('#helpbutton').click();
    await page.locator('#guide-help-start').click();
    await page.locator('#guide-card[data-step="1"]').waitFor();
    await page.locator('#guide-end').click();
    assert.equal(await page.locator('.guide-dock').isVisible(), false, 'Ending the tour respects dismissal');
    assert.equal(await page.locator('#helpbutton').evaluate(node => document.activeElement === node), true);
    assert.deepEqual(await stored(page), before, 'Help and tour exit preserve saved work');
    assert.deepEqual(await selected(page), selection);
    await page.keyboard.press('Escape');
    assert.deepEqual(await selected(page), [], 'Escape still clears selection in the workspace');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }, options));
}

test('blocked preference storage still lets the invitation dismiss for this visit', t => scenario(t, async page => {
  await page.evaluate(() => {
    const savePreference = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'gridsmith.demoDismissed') throw new DOMException('Storage unavailable', 'QuotaExceededError');
      return savePreference.call(this, key, value);
    };
  });
  await page.locator('#guide-dismiss').click();
  await page.locator('#helpbutton').click(); await page.locator('#guide-help-start').click();
  await page.locator('#guide-card[data-step="1"]').waitFor(); await page.locator('#guide-end').click();
  assert.equal(await page.locator('.guide-dock').isVisible(), false);
  await page.reload(); await page.locator('#guide-start').waitFor();
  assert.equal(await page.locator('#guide-start').isVisible(), true, 'Unavailable persistence may show the invitation again next visit');
}, { width: 320, height: 640 }));

function unzipStored(bytes) {
  const files = new Map(); let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(offset + 8), 0);
    const size = bytes.readUInt32LE(offset + 18), length = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.toString('utf8', offset + 30, offset + 30 + length), start = offset + 30 + length + extra;
    files.set(name, bytes.subarray(start, start + size)); offset = start + size;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50); assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  assert.equal(bytes.readUInt16LE(bytes.length - 12), files.size);
  return files;
}
test('copied offline demo ZIP identifies fictional samples and preserves actual 300 by 400 dimensions', t => scenario(t, async page => {
  const order = await planned(page).evaluateAll(nodes => nodes.map(node => node.dataset.id));
  const download = page.waitForEvent('download'); await page.locator('#exportposts').click();
  const archive = await download, files = unzipStored(await readFile(await archive.path()));
  const manifest = JSON.parse(files.get('manifest.json'));
  assert.equal(manifest.imageCount, 15); assert.equal(manifest.sampleCount, 15); assert.equal(manifest.previewCount, 15);
  assert.deepEqual(manifest.images.slice(0, 12).map(row => row.id), order);
  assert.equal(manifest.images.filter(row => row.fictionalReference).length, 3);
  for (const row of manifest.images) {
    assert.equal(row.sample, true); assert.equal(row.source, 'demo-sample-preview');
    assert.equal(row.fictionalReference, row.status === 'posted');
    const jpeg = files.get(row.filename); assert.deepEqual([...jpeg.subarray(0, 3)], [255, 216, 255]);
    const dimensions = await page.evaluate(async src => { const image = new Image(); image.src = src; await image.decode(); return [image.naturalWidth, image.naturalHeight]; }, 'data:image/jpeg;base64,' + jpeg.toString('base64'));
    assert.deepEqual(dimensions, [300, 400], 'Export must not enlarge bundled preview pixels');
    assert.deepEqual([row.width, row.height], dimensions, 'Manifest must report the bytes actually exported');
  }
  const readme = files.get('README.txt').toString('utf8');
  assert.doesNotMatch(readme, /reference tiles are already posted/i);
  assert.match(readme, /not a real posted photo/); assert.match(readme, /300 × 400 pixels/); assert.match(readme, /without enlargement/);
  assert.match(files.get('captions.csv').toString('utf8'), /"sample","fictionalReference"/);
  assert.equal(await page.locator('#exportposts').isEnabled(), true);
}, { offline: true }));
