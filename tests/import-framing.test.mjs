import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchBrowser } from '../tools/browser.mjs';

// This fixture contains only deterministic synthetic textures and geometric
// header marks. These source rectangles were fixed before the detector fix.
const expectedBoxes = [
  [30,92,214,292], [219,92,403,292], [408,92,592,292], [597,92,781,292], [786,92,970,292],
  [30,297,214,497], [219,297,403,497], [408,297,592,497], [597,297,781,497], [786,297,970,497],
  [30,502,214,638], [219,502,403,638], [408,502,592,638], [597,502,781,638], [786,502,970,638],
];

function syntheticScreenshot() {
  const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 660;
  const context = canvas.getContext('2d'), data = context.createImageData(1000,660);
  for (let pixel = 0; pixel < data.data.length; pixel += 4) data.data.set([245,245,245,255],pixel);
  for (let row = 0; row < 3; row++) for (let column = 0; column < 5; column++) {
    const index = row * 5 + column, left = 30 + column * 189, top = 92 + row * 205;
    for (let y = top; y < Math.min(top + 200,638); y++) for (let x = left; x < left + 184; x++) {
      const pixel = (y * 1000 + x) * 4;
      data.data[pixel] = Math.round(95 + 65 * Math.sin((x + index * 151) / (19 + index * 7)) + 25 * Math.cos(y / (13 + index * 3)));
      data.data[pixel + 1] = Math.round(112 + 70 * Math.cos((y + index * 173) / (23 + index * 11)) + 20 * Math.sin(x / (17 + index * 2)));
      data.data[pixel + 2] = Math.round(110 + 70 * Math.sin((x - y + index * 97) / (31 + index * 5)));
    }
  }
  context.putImageData(data,0,0);
  // Small disjoint glyph-like marks reproduce a screenshot header without fonts.
  context.fillStyle = '#404040';
  for (const rect of [[450,24,5,28],[468,24,5,28],[450,36,23,4],[487,24,5,28],[487,24,24,5],[487,47,24,5],[529,24,5,28],[546,24,5,28],[529,47,22,5]]) context.fillRect(...rect);
  return canvas;
}

test('framed screenshot header is excluded and partial final-row crops retain native bounds', async () => {
  const source = await readFile(new URL('../planner_src/detection.js', import.meta.url), 'utf8');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: 'var detectRegions;\n' + source });
    const results = await page.evaluate(draw => {
      const canvas = (0,eval)('(' + draw + ')')();
      return [false,true].map(force => {
        const result = detectRegions(canvas,force);
        return { force, boxes: result.boxes, native: [result.canvas.width,result.canvas.height], partialLastRow: result.partialLastRow };
      });
    }, syntheticScreenshot.toString());
    for (const result of results) {
      assert.deepEqual(result.native,[1000,660], 'Detection must retain the native source raster');
      assert.deepEqual(result.boxes,expectedBoxes, 'Header glyphs must not suppress or displace the 15 photo rectangles');
      assert.equal(result.partialLastRow,true, 'A shortened final row must remain flagged for import review');
    }
  } finally { await browser.close(); }
});
