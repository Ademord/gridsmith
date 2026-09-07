import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { launchBrowser } from '../tools/browser.mjs';
import { startServer } from '../tools/serve.mjs';

// Bounds are fixture inputs, fixed before running the detector. All pixels are
// synthetic; no user photographs, saved workspaces or browser profiles are read.
export const layouts = [
  { id: 'unequal-columns-border', width: 540, height: 390, boxes: [[20,20,120,160],[145,20,325,160],[350,20,520,160],[20,190,120,370],[145,190,325,370],[350,190,520,370]] },
  { id: 'mixed-aspects-row-layout', width: 620, height: 420, boxes: [[16,16,186,166],[210,16,604,166],[16,190,136,404],[160,190,380,404],[404,190,604,404]] },
  { id: 'large-gutters', width: 570, height: 450, boxes: [[10,10,210,180],[360,10,560,180],[10,270,210,440],[360,270,560,440]] },
  { id: 'incomplete-last-row', width: 560, height: 420, boxes: [[12,12,172,132],[200,12,360,132],[388,12,548,132],[12,160,172,280],[200,160,360,280],[388,160,548,280],[12,308,172,408],[200,308,360,408]] },
  { id: 'native-large-source', width: 2160, height: 1560, boxes: [[80,80,480,640],[580,80,1300,640],[1400,80,2080,640],[80,760,480,1480],[580,760,1300,1480],[1400,760,2080,1480]], tolerance: 2 },
];

function pixels(fixture) {
  const data = new Uint8ClampedArray(fixture.width * fixture.height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([244, 241, 235, 255], i);
  fixture.boxes.forEach(([left, top, right, bottom], tile) => {
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const dx = (x - left) / (right - left), dy = (y - top) / (bottom - top);
      const i = (y * fixture.width + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = 55 + ((tile * 47 + c * 63) % 110) + 24 * Math.sin(dx * (13 + tile * 2) + dy * (5 + c * 3) + tile) + 17 * Math.cos(dy * (17 + tile) + dx * 4 + c);
    }
  });
  return { width: fixture.width, height: fixture.height, data };
}

// Only canvas drawing/resampling is emulated. The production detector itself is
// executed unchanged. Real-browser integration remains a separate release gate.
class RasterCanvas {
  width = 0; height = 0; data;
  getContext() {
    return {
      drawImage: (source, ...args) => {
        const [dx, dy, width, height] = args;
        assert.equal(dx, 0); assert.equal(dy, 0);
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const sx = Math.min(source.width - 1, Math.floor((x + .5) * source.width / width));
          const sy = Math.min(source.height - 1, Math.floor((y + .5) * source.height / height));
          this.data.set(source.data.subarray((sy * source.width + sx) * 4, (sy * source.width + sx) * 4 + 4), (y * this.width + x) * 4);
        }
      },
      getImageData: (left, top, width, height) => {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) data.set(this.data.subarray(((top + y) * this.width + left) * 4, ((top + y) * this.width + left + width) * 4), y * width * 4);
        return { data };
      },
    };
  }
}
const source = await readFile(new URL('../planner_src/detection.js', import.meta.url), 'utf8');
const context = vm.createContext({ document: { createElement: () => new RasterCanvas() }, detectRegions: null });
vm.runInContext(source, context);
const detect = fixture => context.detectRegions(pixels(fixture), true);
const plain = value => JSON.parse(JSON.stringify(value));

for (const fixture of layouts) test(`${fixture.id}: every proposed crop matches independently declared source bounds`, () => {
  const result = detect(fixture);
  assert.deepEqual([result.canvas.width, result.canvas.height], [fixture.width, fixture.height], 'Keep the native raster');
  assert.equal(result.boxes.length, fixture.boxes.length, 'Never invent missing last-row tiles or merge unequal photos');
  result.boxes.forEach((box, index) => box.forEach((value, edge) => assert.ok(Math.abs(value - fixture.boxes[index][edge]) <= (fixture.tolerance || 0), `${fixture.id} crop ${index + 1} edge ${edge}: expected ${fixture.boxes[index][edge]}, got ${value}`)));
});

for (const [columns, rows] of [[4,4],[6,5]]) test(`regular ${columns * rows} tile regression`, () => {
  const fixture = { width: columns * 100 + (columns - 1) * 3, height: rows * 100 + (rows - 1) * 3, boxes: [] };
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) fixture.boxes.push([x * 103, y * 103, x * 103 + 100, y * 103 + 100]);
  assert.deepEqual(plain(detect(fixture).boxes), fixture.boxes);
});

test('a solo image retains every source pixel', () => {
  const fixture = { width: 700, height: 430, boxes: [[0,0,700,430]] };
  assert.deepEqual(plain(detect(fixture).boxes), fixture.boxes);
});

test('an unsupported overlapping mosaic retains the complete original', () => {
  const fixture = { width: 600, height: 500, boxes: [[20,20,240,220],[265,20,580,220],[20,250,350,480],[300,280,580,480]] };
  const result = detect(fixture);
  assert.deepEqual(plain(result.boxes), [[0,0,600,500]], 'An L-shaped overlapping area is not a rectangular photo crop');
  assert.equal(result.unresolvedLayout, true, 'Tell the review dialog why the original was retained');
});

test('real browser verifies irregular bounds and native raster', async () => {
  const browser = await launchBrowser();
  const browserContext = await browser.newContext();
  try {
    const page = await browserContext.newPage();
    await page.addScriptTag({ content: `var detectRegions;\n${source}` });
    for (const fixture of layouts) {
      const result = await page.evaluate(({fixture, draw}) => {
        const raster = (0, eval)(`(${draw})`)(fixture);
        const canvas = document.createElement('canvas');
        canvas.width = raster.width; canvas.height = raster.height;
        canvas.getContext('2d').putImageData(new ImageData(raster.data, raster.width, raster.height), 0, 0);
        const result = detectRegions(canvas, true);
        return { boxes: result.boxes, size: [result.canvas.width, result.canvas.height] };
      }, { fixture, draw: pixels.toString() });
      assert.deepEqual(result.size, [fixture.width, fixture.height]);
      assert.equal(result.boxes.length, fixture.boxes.length, fixture.id);
      result.boxes.forEach((box, index) => box.forEach((value, edge) => assert.ok(Math.abs(value - fixture.boxes[index][edge]) <= (fixture.tolerance || 0), `${fixture.id} browser crop ${index + 1}, edge ${edge}: ${value}`)));
    }
  } finally {
    await browserContext.close(); await browser.close();
  }
});

test('real browser keeps all approved public sample solo images whole', async () => {
  const browser = await launchBrowser();
  const server = await startServer();
  const browserContext = await browser.newContext();
  try {
    const page = await browserContext.newPage();
    await page.goto(server.url);
    await page.locator('#railitems .bitem').nth(5).waitFor();
    await page.addScriptTag({ content: `var detectRegions;\n${source}` });
    const solos = await page.locator('#grid img, #railitems img').evaluateAll(async images => {
      // Offscreen lazy images are not requested by Firefox until explicitly loaded.
      images.forEach(image => { image.loading = 'eager'; });
      await Promise.all(images.map(image => image.decode()));
      return images.map(image => {
        if (!image.isConnected || !image.naturalWidth || !image.naturalHeight) throw new Error('Sample image is missing or unreadable');
        const result = detectRegions(image, true);
        return { size: [image.naturalWidth, image.naturalHeight], boxes: result.boxes };
      });
    });
    assert.ok(solos.length >= 18, 'Use the approved public sample images as negative controls');
    solos.forEach(({size, boxes}, i) => assert.deepEqual(boxes, [[0,0,...size]], `Public sample ${i + 1} stays whole`));
  } finally {
    await browserContext.close(); await browser.close(); await server.close();
  }
});

test('irregular review remains staged and the original fallback preserves exact bytes', async () => {
  const browser = await launchBrowser();
  const server = await startServer();
  const browserContext = await browser.newContext();
  try {
    const page = await browserContext.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.url);
    await page.locator('#railitems .bitem').nth(5).waitFor();
    const upload = async fixture => {
      const encoded = await page.evaluate(({fixture, draw}) => {
        const raster = (0, eval)(`(${draw})`)(fixture);
        const canvas = document.createElement('canvas'); canvas.width = raster.width; canvas.height = raster.height;
        canvas.getContext('2d').putImageData(new ImageData(raster.data, raster.width, raster.height), 0, 0);
        return canvas.toDataURL('image/png').split(',')[1];
      }, { fixture, draw: pixels.toString() });
      const buffer = Buffer.from(encoded, 'base64');
      await page.locator('#fileinput').setInputFiles({ name: `${fixture.id}.png`, mimeType: 'image/png', buffer });
      await page.locator('.import-confirm:not([disabled])').waitFor();
      return buffer;
    };
    const imported = () => page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('gridsmith', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result; const rows = db.transaction('added').objectStore('added').getAll(); rows.onsuccess = () => { db.close(); resolve(rows.result.map(row => row.src)); }; rows.onerror = () => reject(rows.error); };
    }));
    await upload(layouts[1]);
    assert.equal(await page.locator('.import-tile').count(), 5);
    assert.match(await page.locator('.import-layout-note').innerText(), /unequal crops/);
    assert.deepEqual(await imported(), [], 'Previewing creates no imported records');
    assert.equal(await page.locator('#railitems .bitem').count(), 6);
    assert.equal(await page.locator('#undo').isDisabled(), true);
    await page.locator('.import-adjust-grid').click();
    assert.match(await page.locator('.import-manual').innerText(), /cannot follow unequal tiles/);
    await page.locator('.import-rows').fill('2');
    assert.equal(await page.locator('.import-confirm').isDisabled(), true, 'Unapplied manual changes cannot be imported');
    await page.locator('.import-cancel').click();
    assert.deepEqual(await imported(), []);
    const fixture = { id: 'overlapping-mosaic', width: 600, height: 500, boxes: [[20,20,240,220],[265,20,580,220],[20,250,350,480],[300,280,580,480]] };
    const original = await upload(fixture);
    assert.equal(await page.locator('.import-file select').inputValue(), 'original');
    assert.equal(await page.locator('.import-tile').count(), 1);
    assert.match(await page.locator('.import-layout-note').innerText(), /could not be separated reliably/);
    assert.match(await page.locator('.import-tile-caption').innerText(), /600 × 500/);
    assert.deepEqual(await imported(), [], 'Fallback is staged too');
    await page.locator('.import-confirm').click();
    await page.locator('#import-review').waitFor({ state: 'hidden' });
    const sources = await imported();
    assert.equal(sources.length, 1);
    assert.deepEqual(Buffer.from(sources[0].split(',')[1], 'base64'), original, 'Original mode retains source PNG bytes');
    assert.deepEqual(errors, []);
  } finally {
    await browserContext.close(); await browser.close(); await server.close();
  }
});
