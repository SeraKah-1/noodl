#!/usr/bin/env node
/**
 * Render Mermaid sources + markdown tables from docs/diagrams/src into PNG images.
 *
 * Strategy (no local Chrome required):
 * 1) Kroki.io / mermaid.ink for Mermaid → PNG
 * 2) Optional local mmdc if Chromium is configured
 * 3) Tables: SVG → PNG via ImageMagick
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { deflateSync } from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'out');

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...opts,
  });
}

function encodeDiagram(text) {
  return deflateSync(Buffer.from(text, 'utf8'), { level: 9 })
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function renderMermaidRemote(code, pngPath) {
  const encoded = encodeDiagram(code);
  const urls = [
    `https://kroki.io/mermaid/png/${encoded}`,
    `https://mermaid.ink/img/pako:${encoded}`,
  ];
  let lastErr;
  for (const url of urls) {
    try {
      await sleep(500);
      const res = await fetch(url, { headers: { Accept: 'image/png,*/*' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 400) throw new Error('tiny response');
      await fs.writeFile(pngPath, buf);
      return true;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('remote render failed');
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapText(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function tableToSvg(table) {
  const colCount = table.headers.length;
  const colW = colCount <= 2 ? 420 : colCount === 3 ? 300 : 240;
  const padX = 16;
  const padY = 12;
  const titleH = 48;
  const rowLineH = 18;
  const maxChars = Math.floor((colW - padX * 2) / 7.2);

  const headerLines = table.headers.map((h) => wrapText(h, maxChars));
  const body = table.rows.map((row) => row.map((cell) => wrapText(cell, maxChars)));

  const headerH =
    Math.max(...headerLines.map((l) => l.length), 1) * rowLineH + padY * 2;
  const rowHeights = body.map(
    (row) => Math.max(...row.map((l) => l.length), 1) * rowLineH + padY * 2
  );

  const width = colW * colCount + 2;
  const height =
    titleH + headerH + rowHeights.reduce((a, b) => a + b, 0) + 24;

  let y = titleH;
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#eef2ff"/>
      <stop offset="100%" stop-color="#faf5ff"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <text x="${width / 2}" y="30" text-anchor="middle" font-family="Inter,Segoe UI,system-ui,sans-serif" font-size="18" font-weight="700" fill="#1e293b">${escapeXml(table.title)}</text>
  <text x="${width / 2}" y="46" text-anchor="middle" font-family="Inter,Segoe UI,system-ui,sans-serif" font-size="11" fill="#64748b">Source: ${escapeXml(table.source)} · Noodl</text>
`;

  // header
  for (let c = 0; c < colCount; c++) {
    const x = c * colW;
    svg += `<rect x="${x}" y="${y}" width="${colW}" height="${headerH}" fill="#4f46e5"/>`;
    headerLines[c].forEach((line, i) => {
      svg += `<text x="${x + padX}" y="${y + padY + 14 + i * rowLineH}" font-family="Inter,Segoe UI,system-ui,sans-serif" font-size="13" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`;
    });
  }
  y += headerH;

  body.forEach((row, r) => {
    const h = rowHeights[r];
    const bg = r % 2 === 0 ? '#ffffff' : '#f8fafc';
    for (let c = 0; c < colCount; c++) {
      const x = c * colW;
      svg += `<rect x="${x}" y="${y}" width="${colW}" height="${h}" fill="${bg}" stroke="#e2e8f0"/>`;
      (row[c] || ['']).forEach((line, i) => {
        svg += `<text x="${x + padX}" y="${y + padY + 14 + i * rowLineH}" font-family="Inter,Segoe UI,system-ui,sans-serif" font-size="12" fill="#334155">${escapeXml(line)}</text>`;
      });
    }
    y += h;
  });

  svg += `</svg>`;
  return svg;
}

function svgToPng(svgPath, pngPath) {
  const magick = run('magick', [
    svgPath,
    '-background',
    'white',
    '-alpha',
    'remove',
    '-alpha',
    'off',
    pngPath,
  ]);
  if (magick.status === 0) return true;
  const convert = run('convert', [
    svgPath,
    '-background',
    'white',
    '-alpha',
    'remove',
    pngPath,
  ]);
  return convert.status === 0;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  const files = (await fs.readdir(SRC)).filter((f) => f.endsWith('.mmd')).sort();
  console.log(`Rendering ${files.length} Mermaid diagrams (Kroki / mermaid.ink)…`);

  for (const file of files) {
    const id = file.replace(/\.mmd$/, '');
    const mmdPath = path.join(SRC, file);
    const pngPath = path.join(OUT, `${id}.png`);
    process.stdout.write(`  ${id}… `);
    try {
      const code = await fs.readFile(mmdPath, 'utf8');
      await renderMermaidRemote(code, pngPath);
      console.log('ok');
    } catch (err) {
      console.log('FAIL');
      console.error(String(err.message || err));
      process.exitCode = 1;
    }
  }

  const tables = JSON.parse(
    await fs.readFile(path.join(SRC, 'tables.json'), 'utf8')
  );
  console.log(`Rendering ${tables.length} tables…`);
  for (const table of tables) {
    const svg = tableToSvg(table);
    const svgPath = path.join(OUT, `${table.id}.svg`);
    const pngPath = path.join(OUT, `${table.id}.png`);
    await fs.writeFile(svgPath, svg, 'utf8');
    process.stdout.write(`  ${table.id}… `);
    if (svgToPng(svgPath, pngPath)) {
      console.log('ok (png)');
    } else {
      console.log('svg only (ImageMagick convert failed)');
    }
  }

  const outFiles = await fs.readdir(OUT);
  for (const f of outFiles) {
    if (f.endsWith('.png') || f.endsWith('.svg')) {
      await fs.copyFile(path.join(OUT, f), path.join(ROOT, f));
    }
  }

  console.log('Done. Images written to docs/diagrams/ and docs/diagrams/out/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
