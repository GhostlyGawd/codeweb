#!/usr/bin/env node
// Render completed daily npm downloads as a self-contained SVG for the README.
// The input contains aggregate public counters only. It contains no user-level data.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DEFAULT_OUTPUT = resolve(ROOT, 'assets', 'metrics', 'npm-downloads.svg');
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function parseAcquisitionLedger(text, { limit = 13 } = {}) {
  const bySnapshot = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const downloads = Number(row.npmWeeklyDownloads);
      if (!ISO_DAY.test(row.at) || !Number.isFinite(downloads) || downloads < 0) continue;
      const periodStart = ISO_DAY.test(row.npmPeriodStart) ? row.npmPeriodStart : null;
      const periodEnd = ISO_DAY.test(row.npmPeriodEnd) ? row.npmPeriodEnd : null;
      bySnapshot.set(row.at, {
        at: row.at,
        downloads,
        periodStart,
        periodEnd,
      });
    } catch {
      // A torn workflow write must not prevent the next complete row from rendering.
    }
  }
  return [...bySnapshot.values()]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-Math.max(1, limit));
}

export function parseNpmDownloadsRange(text, { limit = 60 } = {}) {
  let payload;
  try {
    payload = JSON.parse(String(text));
  } catch {
    return [];
  }

  const byDay = new Map();
  for (const row of Array.isArray(payload?.downloads) ? payload.downloads : []) {
    const downloads = Number(row?.downloads);
    if (!ISO_DAY.test(row?.day) || !Number.isFinite(downloads) || downloads < 0) continue;
    byDay.set(row.day, { day: row.day, downloads });
  }
  return [...byDay.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-Math.max(1, limit));
}

export function renderAcquisitionSvg(rows, { capturedAt = new Date().toISOString().slice(0, 10) } = {}) {
  const safeRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => ISO_DAY.test(row?.day) && Number.isFinite(row?.downloads) && row.downloads >= 0)
    .sort((a, b) => a.day.localeCompare(b.day));
  const width = 840;
  const height = 600;
  const plotX = 74;
  const plotY = 186;
  const plotWidth = 692;
  const plotHeight = 292;
  const plotBottom = plotY + plotHeight;
  const latest = safeRows.at(-1) || null;
  const first = safeRows[0] || null;
  const total = safeRows.reduce((sum, row) => sum + row.downloads, 0);
  const weeklyRows = safeRows.slice(-7);
  const weeklyTotal = weeklyRows.reduce((sum, row) => sum + row.downloads, 0);
  const weeklyValue = weeklyRows.length ? weeklyTotal.toLocaleString('en-US') : '—';
  const weeklyLabel = weeklyRows.length === 7
    ? 'downloads · last 7 completed days'
    : `downloads · ${weeklyRows.length} completed ${weeklyRows.length === 1 ? 'day' : 'days'} available`;
  const max = Math.max(1, ...safeRows.map((row) => row.downloads));
  const yMax = Math.max(50, Math.ceil(max / 50) * 50);
  const points = safeRows.map((row, index) => {
    const x = safeRows.length === 1
      ? plotX + (plotWidth / 2)
      : plotX + ((index / (safeRows.length - 1)) * plotWidth);
    const y = plotBottom - ((row.downloads / yMax) * plotHeight);
    return { ...row, x, y };
  });
  const pointList = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const areaPath = points.length > 1
    ? `M ${points[0].x.toFixed(1)} ${plotBottom} L ${pointList.replaceAll(' ', ' L ')} L ${points.at(-1).x.toFixed(1)} ${plotBottom} Z`
    : '';
  const markers = points.map((point) => {
    const size = point === points.at(-1) ? 14 : 10;
    return `<g><title>${xml(point.day)}: ${point.downloads.toLocaleString('en-US')} downloads</title><rect x="${(point.x - (size / 2)).toFixed(1)}" y="${(point.y - (size / 2)).toFixed(1)}" width="${size}" height="${size}" fill="#C6F24E"/></g>`;
  }).join('\n  ');
  const grid = [0, 1, 2].map((step) => {
    const y = plotY + ((step / 2) * plotHeight);
    const value = Math.round(yMax * (1 - (step / 2)));
    return `<line x1="${plotX}" y1="${y.toFixed(1)}" x2="${plotX + plotWidth}" y2="${y.toFixed(1)}" stroke="#26242C" stroke-dasharray="${step === 2 ? '0' : '5 8'}"/>
  <text x="${plotX - 16}" y="${(y + 6).toFixed(1)}" text-anchor="end" fill="#8A8794" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="16">${value.toLocaleString('en-US')}</text>`;
  }).join('\n  ');
  const description = latest
    ? `Daily npm package downloads from ${first.day} through ${latest.day}. The latest seven completed days have ${weeklyValue} downloads, and the displayed range has ${total.toLocaleString('en-US')} downloads.`
    : 'No completed daily npm package-download data is available yet.';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="title desc">
  <title id="title">Weekly npm download total and daily trend for @ghostlygawd/codeweb</title>
  <desc id="desc">${xml(description)}</desc>
  <metadata>Generated by scripts/render-acquisition.mjs from npm's public downloads range API. Captured ${xml(capturedAt)}. Data period: ${xml(first?.day || 'not available')} to ${xml(latest?.day || 'not available')}. Aggregate package-download counts only; no user-level data.</metadata>
  <rect width="${width}" height="${height}" fill="#060608"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#26242C"/>
  <text x="52" y="50" fill="#8A8794" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="17" font-weight="700" letter-spacing="3">PUBLIC NPM SIGNAL</text>
  <text x="52" y="102" fill="#E8E7EE" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="42" font-weight="800">weekly downloads</text>
  <text x="52" y="138" fill="#8A8794" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="20">@ghostlygawd/codeweb · daily trend</text>
  <text x="${width - 52}" y="92" text-anchor="end" fill="#C6F24E" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="58" font-weight="800">${xml(weeklyValue)}</text>
  <text x="${width - 52}" y="128" text-anchor="end" fill="#8A8794" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="17">${xml(weeklyLabel)}</text>
  ${grid}
  ${areaPath ? `<path d="${areaPath}" fill="#C6F24E" fill-opacity="0.10"/>` : ''}
  ${pointList ? `<polyline points="${pointList}" fill="none" stroke="#C6F24E" stroke-width="7" stroke-linejoin="bevel" stroke-linecap="square"/>` : `<text x="${plotX + (plotWidth / 2)}" y="${plotY + (plotHeight / 2)}" text-anchor="middle" fill="#8A8794" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="22">Waiting for completed daily data</text>`}
  ${markers}
  ${first ? `<text x="${plotX}" y="${plotBottom + 34}" fill="#8A8794" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="18">${xml(first.day)}</text>` : ''}
  ${latest ? `<text x="${plotX + plotWidth}" y="${plotBottom + 34}" text-anchor="end" fill="#E8E7EE" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="18" font-weight="700">${xml(latest.day)}</text>` : ''}
  <text x="52" y="552" fill="#E8E7EE" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="22" font-weight="700">${total.toLocaleString('en-US')} downloads across ${safeRows.length} completed ${safeRows.length === 1 ? 'day' : 'days'} shown</text>
  <text x="52" y="582" fill="#8A8794" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="16">through ${xml(latest?.day || '—')} · public npm API · package retrievals, not users · refreshed weekly</text>
</svg>
`;
}

export function writeAcquisitionSvg(input, output = DEFAULT_OUTPUT) {
  if (!input) throw new Error('usage: node scripts/render-acquisition.mjs <npm-range.json> [output.svg]');
  const rows = parseNpmDownloadsRange(readFileSync(resolve(input), 'utf8'));
  if (!rows.length) throw new Error('npm range input contains no valid daily downloads');
  const svg = renderAcquisitionSvg(rows);
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(resolve(output), svg);
  return { output: resolve(output), days: rows.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = writeAcquisitionSvg(process.argv[2], process.argv[3]);
  process.stdout.write(`render-acquisition: wrote ${result.output} from ${result.days} completed day(s)\n`);
}
