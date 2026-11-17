// Exporta las imágenes de la Chrome Web Store desde design/*.html a store/*.png
// Uso:  npm i -D playwright && npx playwright install chromium
//       node scripts/export-store-images.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = [
  ['promo-440x280', 440, 280],
  ['screenshot-1-hero', 1280, 800],
  ['screenshot-2-result', 1280, 800],
  ['screenshot-3-my-actions', 1280, 800],
  ['screenshot-4-free-private', 1280, 800],
  ['screenshot-5-clean', 1280, 800],
];

await mkdir(path.join(root, 'store'), { recursive: true });
const browser = await chromium.launch();
for (const [name, width, height] of assets) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(root, 'design', `${name}.html`));
  await page.evaluate(() => document.fonts.ready); // espera a Space Grotesk / Inter
  // PNG de 24 bits sin transparencia, como pide la tienda
  await page.screenshot({ path: path.join(root, 'store', `${name}.png`), omitBackground: false });
  await page.close();
  console.log('ok', name, `${width}x${height}`);
}
await browser.close();
