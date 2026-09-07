import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startServer, root } from '../tools/serve.mjs';
import { launchBrowser, browserName } from '../tools/browser.mjs';

let server, browser, browserVersion, startedAt, initialHashes, launchError;
const evidence = [];
const output = join(root, 'test-results', browserName);
async function testedHashes() {
  return Object.fromEntries(await Promise.all(['demo/index.html', 'tests/planner.test.mjs', 'tools/browser.mjs'].map(async name =>
    [name, createHash('sha256').update(await readFile(join(root, name))).digest('hex')])));
}
const fixture = name => join(root, 'tests', 'fixtures', name);
const planned = page => page.locator('#grid .tile:not(.locked)');
const library = page => page.locator('#railitems .bitem');
const order = page => planned(page).evaluateAll(nodes => nodes.map(node => node.dataset.id));
const libraryIds = page => library(page).evaluateAll(nodes => nodes.map(node => node.dataset.id));
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('gridsmith.v3')));
async function until(fn, message) {
  const deadline = Date.now() + 15000;
  do { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 50)); } while (Date.now() < deadline);
  assert.fail(message);
}
async function count(locator, expected) { await until(async () => await locator.count() === expected, `Expected ${expected} elements; got ${await locator.count()}`); }
async function textIncludes(locator, expected) { await until(async () => (await locator.textContent() || '').includes(expected), `Expected text: ${expected}`); }
async function renderedImageSizes(locator, limit) {
  return locator.evaluateAll(async (images, limit) => {
    const inspected = limit === undefined ? images : images.slice(0, limit);
    // Firefox rejects decode() for offscreen images still deferred by lazy
    // loading. Request their bytes before checking dimensions; decode failures
    // remain failures, including missing or corrupt image data.
    inspected.forEach(image => { image.loading = 'eager'; });
    await Promise.all(inspected.map(image => image.decode()));
    if (inspected.some(image => !image.isConnected)) throw new Error('Image nodes changed during decoding; inspect the current rendered images.');
    return inspected.map(image => [image.naturalWidth, image.naturalHeight]);
  }, limit);
}
async function review(page, names = ['grid-4x4.png']) {
  await page.locator('#fileinput').setInputFiles(names.map(fixture));
  await page.locator('#import-review').waitFor({ state: 'visible' });
  await until(async () => await page.locator('.import-confirm').isEnabled(), 'Import review never became ready');
}
async function confirm(page, expected) {
  await page.locator('.import-confirm').click();
  await page.locator('#import-review').waitFor({ state: 'hidden' });
  await count(library(page), expected);
}
async function download(page, selector) {
  const pending = page.waitForEvent('download'); await page.locator(selector).click();
  const file = await pending;
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}
async function assertNativePixels(page, imageSources, fixtureName, boxes) {
  const source = 'data:image/png;base64,' + (await readFile(fixture(fixtureName))).toString('base64');
  const comparisons = await page.evaluate(async ({source, imageSources, boxes}) => {
    async function pixels(src, box) {
      const image = new Image(); image.src = src; await image.decode();
      const [x,y,width,height] = box || [0,0,image.naturalWidth,image.naturalHeight];
      const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
      const context=canvas.getContext('2d'); context.drawImage(image,x,y,width,height,0,0,width,height);
      return context.getImageData(0,0,width,height).data;
    }
    return Promise.all(imageSources.map(async (src,index) => {
      const expected=await pixels(source,boxes[index]), actual=await pixels(src);
      return actual.length===expected.length && actual.every((value,i)=>value===expected[i]);
    }));
  }, {source,imageSources,boxes});
  assert.deepEqual(comparisons, boxes.map(()=>true), 'Imported pixels must equal independently specified source regions');
}
async function databaseRows(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('gridsmith', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result; const rows = db.transaction('added').objectStore('added').getAll(); rows.onsuccess = () => { db.close(); resolve(rows.result); }; rows.onerror = () => reject(rows.error); };
  }));
}
async function scenario(t, run, options = {}) {
  const { standalone = false, ...browserOptions } = options;
  // Firefox cannot emulate the mobile viewport meta tag. It still runs each
  // narrow-viewport scenario with touch enabled; no feature case is skipped.
  const limitations = [];
  if (browserName === 'firefox' && browserOptions.isMobile) {
    delete browserOptions.isMobile;
    limitations.push('Firefox uses a narrow viewport with touch; Playwright does not support isMobile for Firefox.');
  }
  const contextOptions = { viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...browserOptions };
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = [], network = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && (standalone || request.resourceType() !== 'document' || request.url() !== new URL(server.url).href)) network.push(request.url());
  });
  let passed = false, failure, offlineEnforcement;
  try {
    let entry = server.url;
    if (standalone) {
      const portable = join(output, 'gridsmith-demo.html');
      await writeFile(portable, await readFile(join(root, 'demo', 'index.html')));
      entry = pathToFileURL(portable).href;
      // WebKit's Windows offline emulation rejects even a local file URL before
      // executing the app. Deny every HTTP(S) route for the entire file session
      // instead, including reloads; attempted network requests still fail below.
      if (browserName === 'webkit') {
        await context.route(/^https?:\/\//, route => route.abort('internetdisconnected'));
        offlineEnforcement = 'All HTTP(S) routes aborted before file navigation and throughout the session; offline emulation disabled because it rejects local files in this engine.';
      } else {
        await context.setOffline(true);
        offlineEnforcement = 'Browser context offline before file navigation and throughout the session.';
      }
    }
    await page.goto(entry); await count(planned(page), 12); await count(library(page), 6);
    await run(page, context);
    assert.deepEqual(errors, [], 'No uncaught browser or console errors');
    assert.deepEqual(network, [], 'The app must not request HTTP assets or remote services');
    passed = true;
  } catch (error) {
    failure = error.message;
    const name = t.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    await page.screenshot({ path: join(output, `${name}.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    evidence.push({ test: t.name, passed, standalone, offlineEnforcement, contextOptions, limitations, failure, errors, network });
    await context.close();
  }
}

before(async () => {
  await mkdir(output, { recursive: true }); startedAt = new Date().toISOString(); initialHashes = await testedHashes();
  server = await startServer();
  try { browser = await launchBrowser(); browserVersion = browser.version(); }
  catch (error) { launchError = error.message; throw error; }
});
after(async () => {
  const engine = browser?.browserType().name() || browserName;
  if (browser) await browser.close(); if (server) await server.close();
  const finalHashes = await testedHashes();
  const artifactStable = JSON.stringify(initialHashes) === JSON.stringify(finalHashes);
  await writeFile(join(output, 'results.json'), JSON.stringify({ browser: engine, browserVersion, launchError, startedAt, finishedAt: new Date().toISOString(),
    platform: process.platform, nodeVersion: process.version, initialHashes, finalHashes, artifactStable,
    coverageLimits: ['Desktop browser engines and simulated viewports only; no real mobile devices were tested.',
      ...(engine === 'webkit' ? ['Playwright WebKit is an engine build, not the Safari application. Safari and real-device Safari remain unverified.'] : [])],
    tests: evidence }, null, 2) + '\n');
  assert.equal(artifactStable, true, 'Tested files changed during this run; repeat the suite against a stable artifact');
});

test('sample workspace starts with 12 planned, 6 library and 3 posted cards', t => scenario(t, async page => {
  await count(page.locator('#grid .tile.locked'), 3);
  assert.equal(await page.title(), 'Gridsmith | Feed planner');
  assert.equal(await page.locator('#undo').isDisabled(), true);
  assert.equal(await page.locator('#redo').isDisabled(), true);
  const sizes = await renderedImageSizes(page.locator('#grid img, #railitems img'));
  assert.deepEqual(sizes, Array.from({ length: 21 }, () => [300, 400]));
}));

for (const [name, total] of [['grid-4x4.png', 16], ['grid-6x5.png', 30]]) {
  test(`${total}-photo review supports select none, individual choices, crop preview and cancel`, t => scenario(t, async page => {
    const initial = await libraryIds(page); const initialOrder = await order(page);
    await review(page, [name]); await count(page.locator('.import-tile'), total);
    await textIncludes(page.locator('#import-selected-count'), `${total} of ${total}`);
    await page.getByRole('button', { name: 'Select none', exact: true }).click();
    assert.equal(await page.locator('.import-confirm').isDisabled(), true);
    await page.locator('.import-tile input').nth(0).check();
    await page.locator('.import-tile input').nth(total - 1).check();
    await textIncludes(page.locator('#import-selected-count'), `2 of ${total}`);
    await page.getByRole('button', { name: 'View photo 1 crop', exact: true }).click();
    await page.locator('#import-crop-view').waitFor({ state: 'visible' });
    await textIncludes(page.locator('.import-crop-size'), '100 × 100');
    await page.getByRole('button', { name: 'Close crop preview' }).click();
    await page.locator('.import-cancel').click();
    await page.locator('#import-review').waitFor({ state: 'hidden' });
    assert.deepEqual(await libraryIds(page), initial); assert.deepEqual(await order(page), initialOrder);
    assert.deepEqual(await databaseRows(page), []);
    assert.equal(await page.locator('#undo').isDisabled(), true);
  }));
}

test('manual correction requires apply and imports selected native-size crops', t => scenario(t, async page => {
  await review(page); await page.getByRole('button', { name: 'Adjust grid', exact: true }).click();
  await page.locator('.import-rows').fill('2'); await page.locator('.import-columns').fill('2');
  await page.locator('.import-gutter').fill('3');
  assert.equal(await page.locator('.import-confirm').isDisabled(), true);
  await page.getByRole('button', { name: 'Apply grid', exact: true }).click();
  await count(page.locator('.import-tile'), 4);
  await page.locator('.import-rows').fill('0'); await page.getByRole('button', { name: 'Apply grid', exact: true }).click();
  await textIncludes(page.locator('.import-grid-error'), '1 to 12');
  assert.equal(await page.locator('.import-confirm').isDisabled(), true);
  await page.locator('.import-rows').fill('2'); await page.getByRole('button', { name: 'Apply grid', exact: true }).click();
  await page.locator('.import-tile input').nth(1).uncheck(); await confirm(page, 9);
  const dimensions = await renderedImageSizes(library(page).locator('img'), 3);
  assert.deepEqual(dimensions, [[203, 203], [203, 203], [203, 203]]);
  const sources=await library(page).locator('img').evaluateAll(images=>images.slice(0,3).map(image=>image.src));
  await assertNativePixels(page,sources,'grid-4x4.png',[[0,0,203,203],[0,206,203,203],[206,206,203,203]]);
}));

test('original mode imports one image and preserves its exact PNG bytes', t => scenario(t, async page => {
  await review(page, ['grid-6x5.png']);
  await page.getByRole('combobox', { name: 'Import mode for grid-6x5.png' }).selectOption('original');
  await count(page.locator('.import-tile'), 1); await confirm(page, 7);
  const rows = await databaseRows(page); assert.equal(rows.length, 1);
  assert.deepEqual(Buffer.from(rows[0].src.split(',')[1], 'base64'), await readFile(fixture('grid-6x5.png')));
  await page.reload(); await count(library(page), 7);
  assert.deepEqual(await renderedImageSizes(library(page).first().locator('img')), [[615, 512]]);
}));

test('16 and 30 photos import as one durable batch with undo and redo', t => scenario(t, async page => {
  await review(page, ['grid-4x4.png', 'grid-6x5.png']); await count(page.locator('.import-tile'), 46);
  await confirm(page, 52); const imported = await libraryIds(page);
  assert.equal((await databaseRows(page)).length, 46);
  await page.locator('#undo').click(); await count(library(page), 6);
  await until(async () => (await databaseRows(page)).length === 0, 'Undo must delete all imported image records');
  await page.locator('#redo').click(); await count(library(page), 52);
  await until(async () => (await databaseRows(page)).length === 46, 'Redo must restore all imported image records');
  await page.reload(); await count(library(page), 52);
  assert.deepEqual(await libraryIds(page), imported);
  const sizes = await renderedImageSizes(library(page).locator('img'), 46);
  assert.equal(sizes.every(([width, height]) => width === 100 && height === 100), true);
  const sources = await library(page).locator('img').evaluateAll(images => images.slice(0, 46).map(image => image.src));
  const gridBoxes = (rows, columns) => Array.from({ length: rows * columns }, (_, index) =>
    [(index % columns) * 103, Math.floor(index / columns) * 103, 100, 100]);
  await assertNativePixels(page, sources.slice(0, 16), 'grid-4x4.png', gridBoxes(4, 4));
  await assertNativePixels(page, sources.slice(16), 'grid-6x5.png', gridBoxes(5, 6));
}));

test('draft save, load, delete and undo restore the named arrangement', t => scenario(t, async page => {
  const initial = await order(page);
  await page.locator('#drafts-toggle').click(); await page.locator('#draft-name').fill('Sample launch');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.keyboard.press('Escape');
  await library(page).first().click(); await count(planned(page), 13);
  await page.locator('#drafts-toggle').click(); await page.getByRole('button', { name: 'Load Sample launch', exact: true }).click();
  assert.deepEqual(await order(page), initial); await count(library(page), 6);
  await page.reload(); await page.locator('#drafts-toggle').click();
  await page.getByRole('button', { name: 'Delete Sample launch', exact: true }).click();
  await count(page.locator('.draft-row'), 0);
  await page.getByRole('button', { name: 'Undo delete', exact: true }).click(); await count(page.locator('.draft-row'), 1);
}));

test('closed import hints do not swallow editor Escape and visible hints dismiss first', t => scenario(t, async page => {
  await review(page);
  await page.locator('#import-review .guide-help').focus();
  assert.equal(await page.locator('#guide-hint').evaluate(node => node.matches(':popover-open')), true);
  await page.locator('.import-cancel').click();
  await planned(page).first().click();
  await page.getByLabel('Planned date', { exact: true }).fill('2026-10-12');
  await page.keyboard.press('Escape');
  await page.locator('.lightbox.on').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#guide-hint').evaluate(node => node.matches(':popover-open')), false);
  await planned(page).first().click();
  await page.locator('.lbmeta .guide-help').focus();
  assert.equal(await page.locator('#guide-hint').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#guide-hint').isVisible(), false);
  assert.equal(await page.locator('.lightbox.on').isVisible(), true);
  await page.keyboard.press('Escape');
  await page.locator('.lightbox.on').waitFor({ state: 'hidden' });
}));

test('layout backup restores imported photos, captions, dates and named drafts', t => scenario(t, async (page, context) => {
  await review(page); await page.locator('.import-mode select').selectOption('original'); await confirm(page, 7);
  await library(page).first().click(); await count(planned(page), 13);
  const id = (await order(page))[0]; await planned(page).first().click();
  await page.getByLabel('Caption', { exact: true }).fill('Sample caption <still text>');
  await page.getByLabel('Planned date', { exact: true }).fill('2026-10-12'); await page.keyboard.press('Escape');
  await page.locator('#drafts-toggle').click(); await page.locator('#draft-name').fill('Backup sample');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await page.keyboard.press('Escape');
  const backup = await download(page, '#savelayout'); assert.equal(backup.name, 'gridsmith-layout.json');
  const saved = JSON.parse(backup.bytes); assert.equal(saved.added.length, 1);
  assert.deepEqual(saved.meta[id], { c: 'Sample caption <still text>', d: '2026-10-12' });
  await context.clearCookies();
  await page.evaluate(async () => { localStorage.clear(); await new Promise((resolve, reject) => { const request = indexedDB.open('gridsmith', 1); request.onsuccess = () => { const db = request.result; const tx = db.transaction('added', 'readwrite'); tx.objectStore('added').clear(); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; }); });
  await page.reload(); await count(planned(page), 12);
  await page.locator('#fileinput').setInputFiles({ name: backup.name, mimeType: 'application/json', buffer: backup.bytes });
  await count(planned(page), 13); await page.reload(); await count(planned(page), 13);
  assert.deepEqual(await order(page), saved.order); assert.deepEqual((await state(page)).meta[id], saved.meta[id]);
  await page.locator('#drafts-toggle').click(); await count(page.getByRole('button', { name: 'Load Backup sample', exact: true }), 1);
}));

function unzipStored(bytes) {
  const files = new Map(); let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(offset + 8), 0, 'ZIP files use stored mode');
    const size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.toString('utf8', offset + 30, offset + 30 + nameLength), start = offset + 30 + nameLength + extra;
    files.set(name, bytes.subarray(start, start + size)); offset = start + size;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50, 'ZIP must contain a central directory');
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50, 'ZIP must have an end record');
  assert.equal(bytes.readUInt16LE(bytes.length - 12), files.size, 'Directory entry count must match');
  return files;
}

test('ZIP export includes ordered JPEGs and truthful metadata while protecting CSV captions', t => scenario(t, async page => {
  const ids = await order(page);
  await planned(page).first().click(); await page.getByLabel('Caption', { exact: true }).fill('=SUM(1,2)'); await page.keyboard.press('Escape');
  const archive = await download(page, '#exportposts'); assert.match(archive.name, /^gridsmith-posts-\d{4}-\d{2}-\d{2}\.zip$/);
  const files = unzipStored(archive.bytes); assert.equal(files.size, 18);
  const manifest = JSON.parse(files.get('manifest.json'));
  assert.equal(manifest.imageCount, 15); assert.equal(manifest.previewCount, 15);
  assert.deepEqual(manifest.images.slice(0, 12).map(image => image.id), ids);
  assert.equal(manifest.images.filter(image => image.status === 'posted').length, 3);
  assert.equal(manifest.images[0].caption, '=SUM(1,2)');
  assert.match(files.get('captions.csv').toString(), /"'=SUM\(1,2\)"/);
  for (const image of manifest.images) {
    const jpeg = files.get(image.filename); assert.ok(jpeg); assert.deepEqual([...jpeg.subarray(0, 3)], [255, 216, 255]);
    const actual = await page.evaluate(async bytes => { const image = await createImageBitmap(new Blob([new Uint8Array(bytes)])); const size = [image.width, image.height]; image.close(); return size; }, [...jpeg]);
    assert.deepEqual(actual, [image.width, image.height]); assert.deepEqual(actual, [300, 400]);
  }
  assert.equal(await page.locator('#exportposts').isEnabled(), true);
}));

test('all four themes persist on reload without changing the arrangement', t => scenario(t, async page => {
  const initial = await order(page); const colors = new Set();
  for (const theme of ['charcoal', 'violet', 'amber', 'light']) {
    await page.locator('.more-menu summary').click(); await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    colors.add(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()));
    await page.reload(); await count(planned(page), 12);
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme); assert.deepEqual(await order(page), initial);
  }
  assert.equal(colors.size, 4, 'Each theme must have a distinct canvas color');
}));

test('keyboard opens and closes details, reorders posts, and undoes the move', t => scenario(t, async page => {
  const initial = await order(page); const first = planned(page).first(); await first.focus();
  await page.keyboard.press('Enter'); await page.getByRole('dialog', { name: 'Post preview and details' }).waitFor({ state: 'visible' });
  await page.keyboard.press('Escape'); assert.equal(await first.evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Alt+ArrowRight'); assert.deepEqual((await order(page)).slice(0, 2), [initial[1], initial[0]]);
  await page.keyboard.press('Control+z'); assert.deepEqual(await order(page), initial);
  await page.keyboard.press('Control+Shift+z'); assert.deepEqual((await order(page)).slice(0, 2), [initial[1], initial[0]]);
  await planned(page).first().focus(); await page.keyboard.press('Space'); await count(page.locator('#grid .tile.selected'), 1);
  await page.keyboard.press('Escape'); await count(page.locator('#grid .tile.selected'), 0);
}));

test('column controls and preview preserve the content order', t => scenario(t, async page => {
  const initial = await order(page);
  for (const columns of [4, 5, 3]) { await page.locator(`#colsw button[data-c="${columns}"]`).click(); assert.equal((await state(page)).cols, columns); }
  await page.locator('#feedpreview').click(); assert.equal(await page.locator('#feedpreview').getAttribute('aria-pressed'), 'true');
  await page.locator('#planview').click(); assert.equal(await page.locator('#planview').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await order(page), initial); assert.equal(await page.locator('#undo').isDisabled(), true);
}));

for (const width of [390, 320]) {
  test(`${width}px mobile keeps feed and import actions inside the viewport`, t => scenario(t, async page => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#drafts-toggle').tap(); await page.locator('#draft-name').waitFor({ state: 'visible' }); await page.keyboard.press('Escape');
    await page.locator('#helpbutton').tap(); await page.locator('#help-dialog').waitFor({ state: 'visible' }); await page.getByRole('button', { name: 'Close help', exact: true }).tap();
    await planned(page).first().tap(); await page.getByLabel('Caption', { exact: true }).fill('Mobile sample');
    await page.getByRole('button', { name: 'Close post preview' }).tap();
    await review(page, ['grid-6x5.png']); await count(page.locator('.import-tile'), 30);
    const bounds = await page.locator('.import-confirm').boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= 844);
    await page.getByRole('button', { name: 'Select none', exact: true }).tap();
    await page.locator('.import-tile input').first().check(); await confirm(page, 7);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.reload(); await count(library(page), 7);
  }, { viewport: { width, height: 844 }, isMobile: true, hasTouch: true }));
}

test('blocked layout storage warns and still permits a downloadable backup', t => scenario(t, async page => {
  await page.evaluate(() => { Storage.prototype.setItem = function() { throw new DOMException('Synthetic quota test', 'QuotaExceededError'); }; });
  await library(page).first().click(); await count(planned(page), 13);
  await textIncludes(page.locator('#toast'), 'Use Save layout');
  await textIncludes(page.locator('.local-note'), 'Unsaved changes');
  const backup = JSON.parse((await download(page, '#savelayout')).bytes);
  assert.equal(backup.order.length, 13); assert.equal(backup.backlog.length, 5);
}));

test('failed storage aborts an import without partial photos or an undo entry', t => scenario(t, async page => {
  const initial = await libraryIds(page); await review(page);
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === 'gridsmith.v3') throw new DOMException('Synthetic quota test', 'QuotaExceededError'); return original.call(this, key, value); }; });
  await page.locator('.import-confirm').click(); await textIncludes(page.locator('.import-errors'), 'Nothing was imported');
  assert.deepEqual(await libraryIds(page), initial); assert.deepEqual(await databaseRows(page), []);
  assert.equal(await page.locator('#undo').isDisabled(), true); assert.equal(await page.locator('.import-confirm').isEnabled(), true);
  await page.locator('.import-cancel').click(); await page.reload(); await count(library(page), 6);
}));

for (const width of [1440, 320]) {
  test(`${width}px guided demo completes through real controls without automatic imports or downloads`, t => scenario(t, async page => {
    const downloads = []; page.on('download', file => downloads.push(file.suggestedFilename()));
    const initial = await order(page);
    await page.locator('#guide-start').click();
    await until(async () => await page.locator('#guide-card').getAttribute('data-step') === '1', 'Tour must start at step one');
    await page.locator('#guide-speed').selectOption('8000');
    for (let step = 2; step <= 17; step++) {
      await page.locator('#guide-next').click();
      await until(async () => await page.locator('#guide-card').getAttribute('data-step') === String(step), `Guide did not reach step ${step}`);
      const box = await page.locator('#guide-card').boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= 1001, `Guide step ${step} stays inside the viewport`);
      if (step === 8) await count(page.locator('.import-tile'), 16);
      if (step === 12) {
        assert.equal(await page.locator('#guide-card').getAttribute('data-status'), 'waiting');
        await count(library(page), 6); assert.deepEqual(await databaseRows(page), []);
        assert.equal(await page.locator('.import-confirm').isEnabled(), true);
      }
    }
    await page.locator('#guide-next').click();
    assert.equal(await page.locator('#guide-card').getAttribute('data-status'), 'complete');
    assert.deepEqual(downloads, []); await count(library(page), 6); assert.deepEqual(await databaseRows(page), []);
    assert.deepEqual((await order(page)).slice(0, 2), [initial[1], initial[0]], 'Guide uses the actual move shortcut');
    assert.equal((await state(page)).meta[initial[0]].c.startsWith('Sample post'), true);
    const finalOrder = await order(page); await page.locator('#guide-restart').click();
    await until(async () => await page.locator('#guide-card').getAttribute('data-step') === '1', 'Restart must return the guide to step one');
    assert.deepEqual(await order(page), finalOrder, 'Restart must preserve the arrangement');
    await page.locator('#guide-end').click(); assert.equal(await page.locator('#guide-start').isVisible(), true);
  }, { viewport: { width, height: 1000 } }));
}

test('guide preserves existing text and pauses when the user takes control', t => scenario(t, async page => {
  const originalId = (await order(page))[0];
  await planned(page).first().click(); await page.getByLabel('Caption', { exact: true }).fill('My existing sample caption');
  await page.getByLabel('Planned date', { exact: true }).fill('2026-11-03'); await page.keyboard.press('Escape');
  await page.locator('#guide-start').click(); await page.locator('#guide-speed').selectOption('8000');
  for (let step = 2; step <= 4; step++) { await page.locator('#guide-next').click(); await until(async () => await page.locator('#guide-card').getAttribute('data-step') === String(step), `Guide did not reach step ${step}`); }
  assert.equal(await page.locator('.lbcaption').inputValue(), 'My existing sample caption');
  assert.equal(await page.locator('.lbdate').inputValue(), '2026-11-03');
  await page.locator('.lbcaption').click(); await page.locator('.lbcaption').fill('My manual edit during the guide');
  assert.equal(await page.locator('#guide-card').getAttribute('data-status'), 'paused');
  await page.locator('#guide-pause').click(); await textIncludes(page.locator('#guide-note'), 'Your view or inputs changed');
  assert.equal(await page.locator('#guide-card').getAttribute('data-status'), 'paused');
  await page.locator('#guide-end').click();
  assert.equal(await page.locator('.lbcaption').inputValue(), 'My manual edit during the guide');
  await page.getByRole('button', { name: 'Close post preview' }).click(); await page.reload();
  assert.equal((await state(page)).meta[originalId].c, 'My manual edit during the guide');
}));

for (const viewport of [{ width: 320, height: 720 }, { width: 720, height: 500 }]) {
  test(`${viewport.width}x${viewport.height} guide allows actual caption takeover without changing the clicked surface`, t => scenario(t, async page => {
    await page.locator('#guide-start').click();
    await page.locator('#guide-speed').selectOption('8000');
    for (let step = 2; step <= 4; step++) {
      await page.locator('#guide-next').click();
      await until(async () => await page.locator('#guide-card').getAttribute('data-step') === String(step), 'Guide must reach caption editing');
    }
    const caption = page.getByLabel('Caption', { exact: true });
    await caption.click();
    await caption.fill('Manual caption remains reachable');
    assert.equal(await caption.isVisible(), true);
    assert.equal(await caption.inputValue(), 'Manual caption remains reachable');
    assert.equal(await page.locator('#guide-card').getAttribute('data-status'), 'paused');
    assert.equal(await page.locator('#guide-card').getAttribute('data-step'), '4');
    await page.locator('#guide-end').click();
    assert.equal(await caption.inputValue(), 'Manual caption remains reachable');
  }, { viewport }));
}

test('copied standalone HTML works offline through the guide, import, reload, backup restore and ZIP export', t => scenario(t, async page => {
  const automaticDownloads = [];
  const recordDownload = item => automaticDownloads.push(item.suggestedFilename());
  page.on('download', recordDownload);
  const initial = await order(page);
  await page.locator('#guide-start').click();
  await page.locator('#guide-speed').selectOption('8000');
  for (let step = 2; step <= 17; step++) {
    await page.locator('#guide-next').click();
    await until(async () => await page.locator('#guide-card').getAttribute('data-step') === String(step), `Offline guide step ${step}`);
  }
  assert.deepEqual(automaticDownloads, []);
  assert.deepEqual(await databaseRows(page), []);
  const guidedOrder = await order(page);
  await page.locator('#guide-restart').click();
  await until(async () => await page.locator('#guide-card').getAttribute('data-step') === '1', 'Offline restart');
  assert.deepEqual(await order(page), guidedOrder);
  await page.locator('#guide-end').click();
  page.off('download', recordDownload);
  await review(page);
  await page.getByRole('button', { name: 'Select none', exact: true }).click();
  await page.locator('.import-tile input').first().check();
  await confirm(page, 7);
  const rows = await databaseRows(page);
  assert.equal(rows.length, 1);
  await page.reload(); await count(library(page), 7);
  assert.equal((await databaseRows(page))[0].src, rows[0].src);
  await page.locator('#drafts-toggle').click(); await page.locator('#draft-name').fill('Offline arrangement');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await page.keyboard.press('Escape');
  const backup = await download(page, '#savelayout');
  const saved = JSON.parse(backup.bytes);
  assert.equal(saved.added.length, 1);
  assert.deepEqual(saved.order.slice(0, 2), [initial[1], initial[0]]);
  // Restore into an empty store so a no-op restore cannot pass this offline case.
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve,reject)=>{const request=indexedDB.open('gridsmith',1);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('added','readwrite');tx.objectStore('added').clear();tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};request.onerror=()=>reject(request.error);});
  });
  await page.reload(); await count(library(page),6); assert.deepEqual(await databaseRows(page),[]);
  await page.locator('#fileinput').setInputFiles({ name: backup.name, mimeType: 'application/json', buffer: backup.bytes });
  await count(library(page), 7);
  await until(async()=>(await databaseRows(page)).length===1,'Offline restoration must recreate the image record');
  assert.deepEqual(await order(page),saved.order);
  assert.equal((await databaseRows(page))[0].src,saved.added[0].src);
  assert.deepEqual((await state(page)).meta, saved.meta);
  assert.deepEqual((await state(page)).drafts, saved.drafts);
  await page.reload(); await count(library(page),7);
  assert.deepEqual(await order(page),saved.order);
  assert.deepEqual((await state(page)).meta,saved.meta);
  assert.deepEqual((await state(page)).drafts,saved.drafts);
  assert.equal((await databaseRows(page))[0].src, rows[0].src, 'Restored image bytes must survive reload');
  const archive = await download(page, '#exportposts');
  const files = unzipStored(archive.bytes);
  assert.equal(JSON.parse(files.get('manifest.json')).imageCount, 15);
  assert.match(page.url(), /^file:/);
}, { standalone: true }));
