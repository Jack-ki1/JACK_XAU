#!/usr/bin/env node
// scripts/contrast-check.mjs — WCAG 2.1 AA gate for v2 design tokens.
// For each theme (daylight/sunrise/aurora):
//   • every *-text token on --card-solid and --bg-app ≥ 4.5:1
//   • --on-bright on each *-fill ≥ 4.5:1 (bright fills carry navy text)
//   • core text pairs ≥ 4.5:1 (decorative --text-3 ≥ 3:1)
// Fails CI on any violation. Run: npm run check:contrast
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../apps/web/src/styles/tokens.css'), 'utf8');

function parseTheme(name) {
  const m = css.match(new RegExp(`:root\\[data-theme='${name}'\\]\\s*\\{([^}]*)\\}`, 's'));
  if (!m) throw new Error(`theme block not found: ${name}`);
  const vars = {};
  for (const [, k, v] of m[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[k] = v.trim();
  // resolve var() indirection (up to 4 hops)
  for (let i = 0; i < 4; i++)
    for (const [k, v] of Object.entries(vars)) {
      const r = v.match(/^var\((--[\w-]+)\)$/);
      if (r && vars[r[1]]) vars[k] = vars[r[1]];
    }
  return vars;
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(fg, bg) {
  const [f, b] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (f + 0.05) / (b + 0.05);
}

const THEMES = ['daylight', 'sunrise', 'aurora'];

// [foreground, background, minRatio, purpose]
const CORE_PAIRS = [
  ['--text-1', '--bg-app', 4.5, 'body text on app bg'],
  ['--text-1', '--card-solid', 4.5, 'body text on card'],
  ['--text-2', '--card-solid', 4.5, 'secondary text on card'],
  ['--text-2', '--bg-app', 4.5, 'secondary text on app bg'],
  ['--text-3', '--card-solid', 3, 'decorative text on card (min 3:1)'],
];

const TEXT_TOKENS = ['--sky-text', '--orange-text', '--green-text', '--rose-text'];
const FILL_TOKENS = ['--sky-fill', '--orange-fill', '--green-fill', '--rose-fill'];

let failures = 0;
for (const theme of THEMES) {
  const vars = parseTheme(theme);
  const checks = [
    ...CORE_PAIRS,
    ...TEXT_TOKENS.flatMap((t) => [
      [t, '--card-solid', 4.5, `${t} on card`],
      [t, '--bg-app', 4.5, `${t} on app bg`],
    ]),
    ...FILL_TOKENS.map((f) => ['--on-bright', f, 4.5, `--on-bright on ${f}`]),
    ['--bull', '--card-solid', 4.5, 'bull on card'],
    ['--bear', '--card-solid', 4.5, 'bear on card'],
    ['--warn', '--card-solid', 4.5, 'warn on card'],
    ['--info', '--card-solid', 4.5, 'info on card'],
    // --accent-gold is fills/borders/gradients only (never small text on
    // white by design); the meaningful pair is button text ON the fill:
    ['--gold-fg', '--accent-gold', 4.5, 'gold button text on gold bg'],
    ['--on-accent', '--accent-blue-solid', 4.5, 'primary button text on solid accent'],
  ];
  for (const [fgKey, bgKey, min, purpose] of checks) {
    const fgRaw = vars[fgKey];
    const bgRaw = vars[bgKey];
    if (!fgRaw || !bgRaw) {
      console.error(`✗ [${theme}] missing ${!fgRaw ? fgKey : bgKey}`);
      failures++;
      continue;
    }
    const fg = hexToRgb(fgRaw);
    const bg = hexToRgb(bgRaw);
    if (!fg || !bg) {
      console.error(`✗ [${theme}] non-hex token ${!fg ? `${fgKey}=${fgRaw}` : `${bgKey}=${bgRaw}`}`);
      failures++;
      continue;
    }
    const r = ratio(fg, bg);
    if (r < min) {
      console.error(`✗ [${theme}] ${purpose}: ${fgKey} on ${bgKey} = ${r.toFixed(2)}:1 (min ${min}:1)`);
      failures++;
    } else {
      console.log(`✓ [${theme}] ${purpose} = ${r.toFixed(2)}:1`);
    }
  }
}

if (failures) {
  console.error(`\n${failures} contrast violation(s).`);
  process.exit(1);
}
console.log('\nAll token pairs pass WCAG AA.');
