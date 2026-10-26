#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Draws a built page's diagrams ahead: a page `luccet build` wrote goes in,
// and comes out with each mermaid, dot and graphviz fence drawn, as the
// browser would draw it, so a reader's browser loads no Mermaid and no
// Graphviz. (Until Luccet 2.0 this was `luccet build --diagrams`.)
//
//   npx luccet build note.html -o page.html
//   node tools/diagrams.js page.html [-o OUT] [--json] [--timeout=MS]
//
// Without -o the page goes to stdout; OUT may be the page itself. The page
// is opened in a headless Chromium through Playwright, which must be there
// (npm install playwright && npx playwright install chromium), beside the
// luccet.js and the add-ons it loads (mermaid.js, graphviz.js), as a reader
// would open it. Each add-on's library is handed to the page from its
// `?base=` folder, from its npm package (mermaid, @viz-js/viz), or from the
// copy tools/mermaid.js or tools/graphviz.js keeps; failing those the page
// fetches it from jsDelivr, as it would for a reader. The add-ons draw, so
// the palettes, the print copies and the ids are their own. The page is
// read in the light scheme and in the dark one, and each fence gets a copy
// per palette that differs, with the print copy, in its add-on's wrapper,
// the fence hidden inside. On the page each add-on adopts its drawings and
// asks for its library only for a palette that has no copy. A fence that
// cannot be drawn stays a fence, with a diagram.error warning at its note
// line.
//
// As a module: drawInto(r, file) draws into r.html, a built page's text
// ({html, use, nonce, toFile}), opening `file`.
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const escAttr = (s) => String(s).replace(/[&"<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]);
const ADDONS = path.join(__dirname, '..');
const pinned = (file) => {
  const m = /version: '([\d.]+)'/.exec(fs.readFileSync(path.join(ADDONS, file), 'utf8'));
  return m ? m[1] : null;
};

// What each add-on's styles do, for a page read with scripts off, and the
// rules that pick a copy before the add-on does: the light copy in a light
// scheme, the dark in a dark one, the print copy in print.
const styleOf = (cls, own) =>
  [
    ...own,
    `.${cls} > svg { display: block; margin-inline: auto; max-inline-size: 100%; height: auto; }`,
    `.${cls} > .${cls}-print, .${cls} > .${cls}-alt { display: none; }`,
    `@media (prefers-color-scheme: dark) { .${cls} > .${cls}-light { display: none; } }`,
    `@media (prefers-color-scheme: light) { .${cls} > .${cls}-dark { display: none; } }`,
    `@media print { .${cls} > .${cls}-print { display: block; } .${cls}:has(> .${cls}-print) > .${cls}-screen { display: none; } }`,
  ].join('\n');

// A library for the page: {file, from} to hand to it, {url, from} for it to
// fetch, or a warning when a named folder has none. `fromPackage` finds the
// file in an installed package, or throws.
function finder({ title, lib, pkg, cacheFolder, fromPackage, addon }) {
  return (dir, entry) => {
    const version = pinned(addon);
    if (entry.base) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(entry.base) || entry.base.startsWith('//')) return { url: `${entry.base.replace(/\/+$/, '')}/${lib}`, from: `the add-on's base, ${entry.base}` };
      const file = path.resolve(dir, entry.base, lib);
      if (fs.existsSync(file)) return { file, from: `the add-on's base folder, ${entry.base}` };
      return { warning: `the add-on's base folder ${entry.base} has no ${lib} (resolved from the note's folder); ${title} is looked for elsewhere` };
    }
    for (const paths of [undefined, [dir, process.cwd()]]) {
      try {
        const file = fromPackage(paths);
        let v = '';
        try {
          v = ` ${JSON.parse(fs.readFileSync(path.join(path.dirname(file), '..', 'package.json'), 'utf8')).version}`;
        } catch {}
        return { file, from: `the ${pkg} package${v}` };
      } catch {}
    }
    if (version) {
      const file = path.join(require('./npm').CACHE, cacheFolder(version), 'dist', lib);
      if (fs.existsSync(file)) return { file, from: `the cached ${pkg} ${version}` };
    }
    return { url: null, from: `jsDelivr (${pkg} ${version || ''}, as the page loads it)` };
  };
}

// The kit's languages. keys: the colour properties the add-on's palette
// reads; the colours they resolve to tell whether the dark scheme changes
// its palette at all (a system colour, luccet.css's default, is written the
// same in both).
const lang = (L) => ({
  ...L,
  styleId: `luccet-${L.name}-style`,
  // A fence as the emitter writes it: the pre's attributes, the code's class, the code.
  FENCE: new RegExp(`<pre\\b([^>]*)><code class="(language-(?:${L.fence})(?:\\s[^"]*)?)">([\\s\\S]*?)<\\/code><\\/pre>`, 'gi'),
  re: `(?:^|\\s)language-(?:${L.fence})(?:\\s|$)`,
});
const LANGS = [
  lang({
    name: 'mermaid',
    title: 'Mermaid',
    addon: 'mermaid.js',
    cls: 't-mermaid',
    fence: 'mermaid',
    cannot: 'Mermaid cannot draw this diagram',
    nouns: 'diagrams',
    loadFailed: /Mermaid did not load/,
    keys: ['bg', 'fg', 'muted', 'line', 'line-strong', 'soft', 'link', 'mark', 'error', 'error-bg', 'warn', 'code-comment', 'code-keyword', 'code-string', 'code-number', 'code-function', 'code-type', 'code-variable', 'code-meta', 'code-inserted', 'code-deleted'],
    style: styleOf('t-mermaid', ['.t-mermaid { font-family: var(--t-sans); font-size: 16px; line-height: 1.5; }', '.luccet .t-mermaid { margin-block: 0 1rem; }']),
    find: finder({ title: 'Mermaid', lib: 'mermaid.min.js', pkg: 'mermaid', addon: 'mermaid.js', cacheFolder: (v) => `mermaid-${v}`, fromPackage: (paths) => require.resolve('mermaid/dist/mermaid.min.js', paths && { paths }) }),
  }),
  lang({
    name: 'graphviz',
    title: 'Graphviz',
    addon: 'graphviz.js',
    cls: 't-graphviz',
    fence: 'dot|graphviz',
    cannot: 'Graphviz cannot draw this graph',
    nouns: 'graphs',
    loadFailed: /Graphviz did not (?:load|start)/,
    keys: ['bg', 'fg', 'muted', 'line', 'soft'],
    style: styleOf('t-graphviz', ['.luccet .t-graphviz { margin-block: 0 1rem; }']),
    // The package exports only its modules: viz-global.js is beside its main.
    find: finder({ title: 'Graphviz', lib: 'viz-global.js', pkg: '@viz-js/viz', addon: 'graphviz.js', cacheFolder: (v) => `viz-${v}`, fromPackage: (paths) => path.join(path.dirname(require.resolve('@viz-js/viz', paths && { paths })), 'viz-global.js') }),
  }),
];
const styleTag = (L, nonce) => `<style id="${L.styleId}"${nonce ? ` nonce="${escAttr(nonce)}"` : ''}>\n${L.style}</style>`;

// ---------------------------------------------------------------- what is needed

// Playwright, from the CLI's own resolution (and NODE_PATH), then from the
// note's folder and the working folder: {pw, name} or null.
function requirePlaywright(dir) {
  for (const name of ['playwright', 'playwright-core']) {
    for (const resolve of [() => require.resolve(name), () => require.resolve(name, { paths: [dir, process.cwd()] })]) {
      try {
        const pw = require(resolve());
        if (pw && pw.chromium && typeof pw.chromium.launch === 'function') return { pw, name };
      } catch {}
    }
  }
  return null;
}

// The add-on's entry in the note's add-ons, and its ?base=.
function addonEntry(use, addon) {
  const name = addon.replace(/\.js$/, '');
  for (const u of use) {
    const clean = u.replace(/#.*$/, '');
    if (!new RegExp(`(?:^|/)${name}(?:\\.min)?\\.js(?:\\?|$)`, 'i').test(clean)) continue;
    const q = clean.indexOf('?');
    const params = new URLSearchParams(q < 0 ? '' : clean.slice(q + 1));
    return { url: u, base: (params.get('base') || '').trim() };
  }
  return null;
}

// ---------------------------------------------------------------- in the page

// Every fence of the languages asked for, in document order, as it stands:
// drawn (the screen copy and its palette key, the print copy), failed (the
// add-on's error after the fence), or pending.
function state(langs) {
  const main = document.querySelector('main.luccet');
  const all = {};
  for (const L of langs) {
    const out = (all[L.name] = []);
    if (!main) continue;
    const lang = new RegExp(L.re, 'i');
    for (const el of main.querySelectorAll(`.${L.cls}, pre`)) {
      if (el.localName === 'pre') {
        const code = el.querySelector(':scope > code');
        if (!code || !lang.test(code.className) || el.parentElement.classList.contains(L.cls)) continue;
        const next = el.nextElementSibling;
        out.push(next && next.classList.contains(`${L.cls}-error`) ? { error: next.textContent.replace(`${L.cannot}: `, '') } : { pending: true });
        continue;
      }
      if (el.classList.contains(`${L.cls}-box`)) continue;
      const screen = el.querySelector(`:scope > svg.${L.cls}-screen`);
      const print = el.querySelector(`:scope > svg.${L.cls}-print`);
      out.push(screen ? { screen: screen.outerHTML, key: screen.getAttribute('data-palette') || '', print: print ? print.outerHTML : null } : { pending: true });
    }
  }
  return all;
}
// The colours a language's palette resolves to, and the font.
function signature(keys) {
  const cs = getComputedStyle(document.querySelector('main.luccet') || document.documentElement);
  const probe = document.createElement('span');
  probe.hidden = true;
  probe.style.colorScheme = cs.colorScheme || 'normal';
  document.documentElement.appendChild(probe);
  const colours = keys.map((k) => {
    probe.style.color = cs.getPropertyValue(`--t-${k}`).trim();
    return getComputedStyle(probe).color;
  });
  probe.remove();
  return `${colours.join('|')}|${cs.getPropertyValue('--t-sans').trim()}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Waits until `done(state)` holds, then until the state has not changed for
// a moment (the print copies come after the screen ones). Returns the state.
async function settle(page, langs, done, timeout) {
  const t0 = Date.now();
  const read = () => page.evaluate(state, langs);
  let s = await read();
  while (!done(s) && Date.now() - t0 < timeout) {
    await sleep(100);
    s = await read();
  }
  let last = JSON.stringify(s);
  let quiet = 0;
  while (quiet < 600 && Date.now() - t0 < timeout + 10000) {
    await sleep(150);
    quiet += 150;
    s = await read();
    const now = JSON.stringify(s);
    if (now !== last) (last = now), (quiet = 0);
  }
  return s;
}

// Opens the note and reads its diagrams in both schemes: per language, per
// fence, {copies: [{html, key, scheme}], print} | {error} | {pending: true}.
async function read(pw, file, jobs, { timeout }) {
  const browser = await pw.chromium.launch();
  try {
    const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1000, height: 800 } });
    const page = await context.newPage();
    for (const j of jobs) if (j.source.file) await page.addInitScript({ path: j.source.file });
    const console = [];
    page.on('console', (m) => (m.type() === 'warning' || m.type() === 'error') && console.push(m.text()));
    await page.goto(pathToFileURL(path.resolve(file)).href, { waitUntil: 'load', timeout });
    try {
      await page.waitForFunction(() => window.luccet && window.luccet.ready, null, { timeout });
    } catch {
      throw new Error("luccet.js did not run in the browser: is the tag's src right from the note's folder?");
    }
    await page.evaluate(() => window.luccet.ready);
    const langs = jobs.map((j) => ({ name: j.L.name, cls: j.L.cls, re: j.L.re, cannot: j.L.cannot }));
    const settled = (s) => langs.every((L) => s[L.name].every((x) => !x.pending));
    const light = await settle(page, langs, settled, timeout);
    const sigs = async () => Promise.all(jobs.map((j) => page.evaluate(signature, j.L.keys)));
    const sigLight = await sigs();
    await page.emulateMedia({ colorScheme: 'dark' });
    const sigDark = await sigs();
    // Only a language whose palette the dark scheme changes is drawn again.
    const changed = new Set(jobs.filter((_, i) => sigDark[i] !== sigLight[i]).map((j) => j.L.name));
    let dark = light;
    if (changed.size) {
      // The add-ons redraw what the palette change left stale.
      dark = await settle(page, langs, (s) => langs.every((L) => s[L.name].every((x, i) => !x.pending && (!changed.has(L.name) || x.error || x.key !== light[L.name][i].key || !light[L.name][i].screen))), timeout);
    }
    const out = {};
    for (const L of langs) {
      out[L.name] = light[L.name].map((l, i) => {
        const d = (changed.has(L.name) && dark[L.name][i]) || l;
        if (l.pending && d.pending) return { pending: true };
        if (l.error && (d.error || d.pending)) return { error: l.error };
        if (!l.screen && !d.screen) return { error: l.error || d.error };
        const copies = [];
        if (l.screen) copies.push({ html: l.screen, key: l.key, scheme: 'light' });
        if (d.screen && d.key !== l.key) copies.push({ html: d.screen, key: d.key, scheme: 'dark' });
        if (copies.length === 1) copies[0].scheme = null;
        return { copies, print: l.print || d.print || null };
      });
    }
    return { fences: out, console };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- into the page

// The wrapper the add-on makes, around the fence as emitted: the copies,
// the print copy, the fence hidden; the fence's id moves to the wrapper, so
// links land, and data-pos is copied.
function wrapper(L, attrs, codeClass, code, result, nonce) {
  const id = /\sid="([^"]*)"/.exec(attrs);
  const pos = /\sdata-pos="([^"]*)"/.exec(attrs);
  const preAttrs = attrs.replace(/\sid="[^"]*"/, '');
  const inner = (html) => (nonce ? html.replace(/<style\b/g, `<style nonce="${escAttr(nonce)}"`) : html);
  const svg = (html, c) => inner(html.replace(/^<svg\b[^>]*?\sclass="[^"]*"/, (m) => m.replace(/\sclass="[^"]*"/, ` class="${c}"`)));
  const copies = result.copies.map((c) => svg(c.html, c.scheme ? `${L.cls}-screen ${L.cls}-${c.scheme}` : `${L.cls}-screen`));
  if (result.print) copies.push(svg(result.print, `${L.cls}-print`));
  return `<div class="${L.cls}"${id ? ` id="${id[1]}"` : ''}${pos ? ` data-pos="${pos[1]}"` : ''}>${copies.join('')}<pre${preAttrs} hidden><code class="${codeClass}">${code}</code></pre></div>`;
}

// Draws the diagrams of a built page in place: r is build()'s result (its
// html, use, nonce and toFile). Returns {total, drawn, from, languages,
// warnings, failures}: languages per name {total, drawn, from}; failures are
// diagram.error diagnostics with file positions. A language that drew gets
// its stylesheet from styleTag (the command puts it before the luccet.js tag).
async function drawInto(r, file, { timeout = 60000 } = {}) {
  const warnings = [];
  const failures = [];
  const languages = {};
  for (const L of LANGS) {
    r.html = r.html.replace(new RegExp(`<style id="${L.styleId}"[^>]*>[\\s\\S]*?</style>\\n?`), '');
    languages[L.name] = { total: [...r.html.matchAll(L.FENCE)].length, drawn: 0, from: null };
  }
  const result = { total: 0, drawn: 0, from: null, languages, warnings, failures };
  for (const L of LANGS) result.total += languages[L.name].total;
  if (!result.total) return result;
  const dir = path.dirname(path.resolve(file));
  const jobs = [];
  for (const L of LANGS) {
    if (!languages[L.name].total) continue;
    const entry = addonEntry(r.use || [], L.addon);
    if (!entry) {
      warnings.push(`the page does not load ${L.addon}, so its ${L.nouns} are not drawn`);
      continue;
    }
    const found = L.find(dir, entry);
    if (found.warning) warnings.push(found.warning);
    const source = found.file || found.url !== undefined ? found : L.find(dir, { base: '' });
    languages[L.name].from = source.from;
    jobs.push({ L, source });
  }
  if (!jobs.length) return result;
  const playwright = requirePlaywright(dir);
  if (!playwright) {
    warnings.push('playwright cannot be required (npm install playwright && npx playwright install chromium); diagrams are left to the page');
    return result;
  }
  let read_;
  try {
    read_ = await read(playwright.pw, file, jobs, { timeout });
  } catch (e) {
    warnings.push(`the diagrams could not be drawn: ${String((e && e.message) || e).split('\n')[0]}; they are left to the page`);
    return result;
  }
  const position = (attrs) => {
    const m = /\sdata-pos="(\d+):(\d+)"/.exec(attrs);
    const p = m ? { line: Number(m[1]), column: Number(m[2]) } : { line: 1, column: 1 };
    return r.toFile({ start: p, end: p });
  };
  for (const { L } of jobs) {
    const states = read_.fences[L.name];
    const lang = languages[L.name];
    if (states.length !== lang.total) {
      warnings.push(`the browser shows ${states.length} ${L.name} fence(s) where the page has ${lang.total}; they are left to the page`);
      continue;
    }
    let i = 0;
    r.html = r.html.replace(L.FENCE, (all, attrs, codeClass, code) => {
      const s = states[i++];
      if (s.copies) {
        lang.drawn++;
        return wrapper(L, attrs, codeClass, code, s, r.nonce);
      }
      failures.push({ severity: 'warning', code: 'diagram.error', message: s.error ? `${L.cannot}, so the page keeps the fence: ${s.error}` : `this ${L.nouns.replace(/s$/, '')} was not drawn in time, so the page keeps the fence`, filePosition: position(attrs) });
      return all;
    });
    if (!lang.drawn) {
      const failed = read_.console.find((t) => L.loadFailed.test(t));
      if (failed) warnings.push(`${failed.replace(/^Luccet [a-z]+\.js: /, '')}; ${L.nouns} are left to the page`);
    }
    result.drawn += lang.drawn;
  }
  failures.sort((a, b) => a.filePosition.start.line - b.filePosition.start.line);
  result.from = jobs.filter((j) => languages[j.L.name].drawn).map((j) => languages[j.L.name].from).join('; ') || null;
  return result;
}

module.exports = { drawInto, LANGS, styleTag, requirePlaywright };

// ---------------------------------------------------------------- the command

const USAGE = 'usage: node tools/diagrams.js PAGE [-o OUT] [--json] [--timeout=MS]';
const shown = (f) => path.relative(process.cwd(), path.resolve(f)).split(path.sep).join('/') || '.';
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : null;
};

async function main(argv) {
  const { parseArgs } = require('util');
  let o;
  let pages;
  try {
    ({ values: o, positionals: pages } = parseArgs({ args: argv, options: { output: { type: 'string', short: 'o' }, json: { type: 'boolean' }, timeout: { type: 'string' }, help: { type: 'boolean', short: 'h' } }, allowPositionals: true }));
  } catch (e) {
    return usage(e.message);
  }
  if (o.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (pages.length !== 1) return usage('give one PAGE');
  const timeout = o.timeout === undefined ? 60000 : Number(o.timeout);
  if (!(timeout > 0)) return usage('--timeout is a number of milliseconds');
  const file = pages[0];
  let html;
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return usage(`cannot read ${file}: ${e.code === 'ENOENT' ? 'no such file' : e.message}`);
  }
  const tag = (/<script\b[^>]*\sdata-built\b[^>]*>/i.exec(html) || [])[0];
  if (!tag) return usage(`${file} is not a page luccet build wrote; build it first: npx luccet build ${file} -o page.html`);
  if (LANGS.some((L) => html.includes(`id="${L.styleId}"`))) return usage(`${file}'s diagrams are drawn already; build the page again to draw them afresh`);
  const nonce = attr(tag, 'data-nonce') || attr(tag, 'nonce');
  const r = { html, use: (attr(tag, 'data-use') || '').split(/\s+/).filter(Boolean), nonce, toFile: (p) => p };
  const result = await drawInto(r, file, { timeout });
  const styles = LANGS.filter((L) => result.languages[L.name].drawn).map((L) => styleTag(L, nonce));
  if (styles.length) r.html = r.html.replace(tag, `${styles.join('\n')}\n${tag}`);
  for (const w of result.warnings) process.stderr.write(`diagrams: ${w}\n`);
  const lines = result.failures.map((d) => `${shown(file)}: note line ${d.filePosition.start.line}: warning ${d.code}: ${d.message}`);
  for (const l of lines) process.stderr.write(`${l}\n`);
  if (o.output) fs.writeFileSync(o.output, r.html);
  if (o.json) {
    const out = { diagrams: { total: result.total, drawn: result.drawn, from: result.from, languages: result.languages }, warnings: result.warnings, diagnostics: result.failures.map((d) => ({ ...d, line: d.filePosition.start.line })) };
    if (!o.output) out.html = r.html;
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  } else if (!o.output) process.stdout.write(r.html);
  const withs = LANGS.filter((L) => result.languages[L.name].drawn && result.languages[L.name].from).map((L) => `${L.title} from ${result.languages[L.name].from}`);
  const of = result.total ? `${result.total} diagram${result.total === 1 ? '' : 's'}, ${result.drawn} drawn ahead${withs.length ? ` with ${withs.join(' and ')}` : ''}` : 'no diagram';
  process.stderr.write(`diagrams: ${of}${o.output ? `; wrote ${shown(o.output)}` : ''}\n`);
  return 0;
}

function usage(message) {
  process.stderr.write(`diagrams: ${message}\n${USAGE}\n`);
  return 2;
}

if (require.main === module)
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      process.stderr.write(`diagrams: ${(e && e.stack) || e}\n`);
      process.exitCode = 1;
    },
  );
