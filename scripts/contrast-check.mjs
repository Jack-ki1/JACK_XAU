#!/usr/bin/env node
// scripts/contrast-check.mjs — WCAG 2.1 AA gate for design tokens.
// Parses apps/web/src/styles/tokens.css, checks every required
// foreground/background pair for each theme >= 4.5:1 (and >= 3:1 for
// large-text pairs). Fails the build (CI) on any violation.
// Run: npm run check:contrast
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
  // resolve var() indirection (e.g. --chart-bg: var(--bg-panel))
  for (let i = 0; i < 3; i++)
    for (const [k, v] of Object.entries(vars)) {
      const r = v.match(/^var\((--[\w-]+)\)$/);
      if (r && vars[r[1]]) vars[k] = vars[r[1]];
    }
  return vars;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
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

// [foreground, background, minRatio, purpose]
const PAIRS = [
  ['--text-1', '--bg-app', 4.5, 'body text on app bg'],
  ['--text-1', '--bg-panel', 4.5, 'body text on panel'],
  ['--text-1', '--bg-raised', 4.5, 'body text on raised'],
  ['--text-2', '--bg-panel', 4.5, 'secondary text on panel'],
  ['--text-2', '--bg-app', 4.5, 'secondary text on app bg'],
  ['--text-3', '--bg-panel', 3, 'decorative/meta text on panel (min 3:1)'],
  ['--bull', '--bg-panel', 4.5, 'bull colour on panel'],
  ['--bear', '--bg-panel', 4.5, 'bear colour on panel'],
  ['--warn', '--bg-panel', 4.5, 'warn colour on panel'],
  ['--info', '--bg-panel', 4.5, 'info colour on panel'],
  ['--accent-blue', '--bg-panel', 4.5, 'accent-blue on panel'],
  ['--accent-gold', '--bg-panel', 4.5, 'accent-gold on panel'],
  ['--gold-fg', '--accent-gold', 4.5, 'gold button text on gold bg'],
  ['--on-accent', '--accent-blue-solid', 4.5, 'primary button text on solid accent'],
];

let failures = 0;
for (const theme of ['midnight', 'graphite', 'daylight']) {
  const vars = parseTheme(theme);
  for (const [fgKey, bgKey, min, purpose] of PAIRS) {
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
    const ok = r >= min;
    if (!ok) {
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
