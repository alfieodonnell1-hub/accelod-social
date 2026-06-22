// Cloud version — uses puppeteer bundled Chromium, no local Chrome path needed
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function screenshot(htmlFile, outFile) {
  const absHtml = path.resolve(htmlFile);
  if (!fs.existsSync(absHtml)) { console.error('File not found:', absHtml); process.exit(1); }
  const out = outFile || absHtml.replace(/\.html$/, '.png');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1800, height: 1400, deviceScaleFactor: 1 });
  await page.goto('file:///' + absHtml.replace(/\\/g, '/'), { waitUntil: 'networkidle2', timeout: 30000 });

  // Force-load every font variant used in posts, then allow a paint buffer
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load('900 1em Outfit'),
      document.fonts.load('700 1em Outfit'),
      document.fonts.load('400 1em Outfit'),
      document.fonts.load('500 1em "DM Sans"'),
      document.fonts.load('400 1em "DM Sans"'),
      document.fonts.load('500 1em "JetBrains Mono"'),
      document.fonts.load('400 1em "JetBrains Mono"'),
    ]);
  });
  await new Promise(r => setTimeout(r, 800));

  const el = await page.$('#post');
  if (!el) { console.error('No #post element found.'); await browser.close(); process.exit(1); }
  await el.screenshot({ path: out, type: 'png' });
  await browser.close();
  console.log('Screenshot saved:', out);
}

screenshot(process.argv[2], process.argv[3]).catch(e => { console.error(e.message); process.exit(1); });
