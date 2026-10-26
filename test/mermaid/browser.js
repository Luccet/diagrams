#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// mermaid.js in Chromium and Firefox (test/harness.js): fences drawn in the
// theme with print copies and unique ids, Mermaid pinned with SRI; a dark
// theme under a strict policy with data-nonce; a change of scheme redraws
// and a note rendered again reuses its drawings; ?base= and other options;
// no Mermaid for a note without a diagram; a Mermaid that does not load;
// securityLevel kept strict; and a page drawn ahead by tools/diagrams.js.
// Mermaid comes from its local copy (tools/mermaid.js), so runs are the
// same each time and work offline after the first.
//
//   LUCCET_ROOT=…/luccet node test/browser.js [--browsers=…] [--filter=TEXT] [--live-cdn]
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const h = require('../harness');

const VERSION = /version: '([\d.]+)'/.exec(fs.readFileSync(path.join(h.ROOT, 'mermaid.js'), 'utf8'))[1];
const MERMAID_URL = /^https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@(\d+\.\d+\.\d+)\/([^?#]+)/;
const mermaidDir = (v) => h.cached('Mermaid', require('../../tools/mermaid').packageDir, v);
const soft = () => {
  // --t-soft resolved, as the add-on resolves it (luccet.css's default is the system's ButtonFace)
  const s = document.createElement('span');
  s.style.color = 'var(--t-soft)';
  document.body.append(s);
  const c = getComputedStyle(s).color;
  s.remove();
  return c;
};

// A note built with the engine's luccet build and drawn ahead with
// tools/diagrams.js, its URLs made the site's; or why it could not be.
let builtPage = null;
function builtDiagrams() {
  if (builtPage) return builtPage;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luccet-mermaid-built-'));
  try {
    fs.copyFileSync(h.LUCCET_JS, path.join(dir, 'luccet.js'));
    fs.copyFileSync(path.join(h.ROOT, 'mermaid.js'), path.join(dir, 'mermaid.js'));
    fs.writeFileSync(path.join(dir, 'n.html'), '<!doctype html><meta charset="utf-8"><script src="luccet.js" data-use="mermaid.js"></script>\n\n# Diagrams drawn ahead {#top}\n\n```mermaid {#flow}\nflowchart LR\n  A --> B\n```\n\n```mermaid [A listing]{#lst}\npie\n  "a": 1\n  "b": 2\n```\n');
    const b = h.cli(['build', 'n.html', '-o', 'page.html'], { cwd: dir });
    if (b.code !== 0) throw new Error(`luccet build: ${b.err}`);
    const r = spawnSync(process.execPath, [path.join(h.ROOT, 'tools', 'diagrams.js'), 'page.html'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NODE_PATH: path.join(h.ENGINE, 'node_modules') } });
    if (r.status !== 0) throw new Error(`diagrams.js: ${r.stderr}`);
    const html = r.stdout.replace('src="luccet.js"', 'src="/luccet.js"').replace(/(src|data-use)="mermaid\.js"/g, '$1="/mermaid.js"');
    builtPage = /class="t-mermaid-screen t-mermaid-light"/.test(html) ? { html } : { why: r.stderr.trim() };
    return builtPage;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const TESTS = [
  {
    name: 'fences drawn as diagrams in the theme, listings and ids kept, a broken one left with its error and its id, print copies with unique ids, Mermaid pinned with SRI',
    url: '/test/mermaid/pages/addon.html',
    timeout: 90000,
    async check(page, ctx) {
      await page.waitForFunction(() => document.querySelectorAll('main.luccet .t-mermaid > svg.t-mermaid-screen').length === 11 && document.querySelectorAll('main.luccet .t-mermaid > svg.t-mermaid-print').length === 11 && document.querySelector('.t-mermaid-error'), null, { timeout: 80000 });
      const r = await page.evaluate((softSrc) => {
        const soft = new Function(`return (${softSrc})()`);
        const flow = document.getElementById('flow');
        const rect = flow && flow.querySelector('svg .node rect, svg .node polygon');
        const listing = document.querySelector('figure[data-t=code]');
        const broken = document.querySelector('.t-mermaid-error');
        const owner = new Map();
        const dupIds = [];
        for (const e of document.querySelectorAll('.t-mermaid > svg [id], .t-mermaid > svg[id]')) {
          const svg = e.closest('svg');
          if (owner.has(e.id) && owner.get(e.id) !== svg) dupIds.push(e.id); // Mermaid repeats some within one drawing of its own accord
          owner.set(e.id, svg);
        }
        return {
          flow: flow && flow.matches('.t-mermaid') && !!flow.querySelector(':scope > svg') && flow.querySelector(':scope > pre').hidden,
          pos: flow && flow.hasAttribute('data-pos'),
          fill: rect && getComputedStyle(rect).fill,
          soft: soft(),
          listing: listing && !!listing.querySelector(':scope > .t-mermaid > svg') && !!listing.querySelector(':scope > figcaption'),
          broken: broken && broken.previousElementSibling && broken.previousElementSibling.matches('pre:not([hidden])') && /Parse error/.test(broken.textContent),
          js: !!document.querySelector('main.luccet > pre > code.language-js'),
          prints: document.querySelectorAll('.t-mermaid-print').length,
          brokenId: !!(document.getElementById('broken') && document.getElementById('broken').matches('pre') && !document.getElementById('broken').hidden),
          dupIds,
          // Every url(#…) reference in a print copy lands inside that copy.
          refs: [...document.querySelectorAll('.t-mermaid-print [marker-end], .t-mermaid-print [marker-start], .t-mermaid-print [fill^="url("]')].map((e) => {
            const m = /url\(#([^)]+)\)/.exec(e.getAttribute('marker-end') || e.getAttribute('marker-start') || e.getAttribute('fill'));
            return m ? !!e.closest('svg').querySelector(`#${CSS.escape(m[1])}`) : true;
          }),
          scripts: [...document.querySelectorAll('script[src*="mermaid@"]')].map((e) => ({ src: e.src.replace(/^.*\/npm\//, ''), sri: e.integrity.startsWith('sha384-') })),
        };
      }, soft.toString());
      if (!r.flow || !r.pos) throw new Error(`#flow: drawn ${r.flow}, data-pos ${r.pos}`);
      if (r.fill !== r.soft) throw new Error(`a flowchart node is filled ${r.fill}, --t-soft resolves to ${r.soft}`);
      if (!r.listing) throw new Error('the listing lost its diagram or its caption');
      if (!r.broken) throw new Error('the broken diagram is not shown as source with its error');
      if (!r.js) throw new Error('the js fence was touched');
      if (r.prints !== 11) throw new Error(`${r.prints} print copies: the light palette is not print's, so every diagram gets one`);
      if (!r.brokenId) throw new Error('the broken fence did not get its id back, or is hidden');
      if (r.dupIds.length) throw new Error(`ids repeated across drawings: ${[...new Set(r.dupIds)].slice(0, 5).join(', ')}`);
      if (!r.refs.length || !r.refs.every(Boolean)) throw new Error(`${r.refs.filter((x) => !x).length} of ${r.refs.length} url(#…) references in print copies point outside their copy`);
      if (JSON.stringify(r.scripts) !== JSON.stringify([{ src: `mermaid@${VERSION}/dist/mermaid.min.js`, sri: true }])) throw new Error(`scripts ${JSON.stringify(r.scripts)}`);
      if (!ctx.console.some((m) => m.type === 'warning' && /Luccet mermaid\.js: Parse error/.test(m.text))) throw new Error('no console warning for the broken diagram');
    },
  },
  {
    name: 'a dark theme under a strict CSP with data-nonce: drawn in its colours, styles kept, a light copy for print',
    url: '/csp-nonce/test/mermaid/pages/addon-theme.html',
    timeout: 60000,
    async check(page) {
      await page.waitForFunction(() => document.querySelectorAll('.t-mermaid > svg.t-mermaid-print').length === 2, null, { timeout: 40000 });
      const look = (softSrc) => {
        const shown = [...document.querySelectorAll('.t-mermaid > svg')].filter((s) => getComputedStyle(s).display !== 'none');
        const node = shown[0] && shown[0].querySelector('.node rect');
        return {
          fill: node && getComputedStyle(node).fill,
          maxWidth: shown[0] && shown[0].style.maxWidth,
          kinds: shown.map((s) => s.classList[s.classList.length - 1]),
          soft: new Function(`return (${softSrc})()`)(),
          csp: window.__csp,
          nonces: [...document.querySelectorAll('script[src*="mermaid@"]')].map((e) => e.nonce),
        };
      };
      const screen = await page.evaluate(look, soft.toString());
      if (screen.csp.length) throw new Error(`CSP violations: ${screen.csp.slice(0, 3).join('; ')}`);
      if (JSON.stringify(screen.nonces) !== JSON.stringify([h.NONCE])) throw new Error(`Mermaid's script nonces ${JSON.stringify(screen.nonces)}`);
      if (screen.kinds.join() !== 't-mermaid-screen,t-mermaid-screen') throw new Error(`on screen: ${screen.kinds.join()}`);
      if (screen.fill !== screen.soft) throw new Error(`a node is filled ${screen.fill}, nord's --t-soft is ${screen.soft} (the SVG's <style> did not apply?)`);
      if (!/px$/.test(screen.maxWidth || '')) throw new Error(`the SVG's max-width is "${screen.maxWidth}" (its style attribute was not set again)`);
      await page.emulateMedia({ media: 'print' });
      const print = await page.evaluate(look, soft.toString());
      if (print.kinds.join() !== 't-mermaid-print,t-mermaid-print') throw new Error(`in print: ${print.kinds.join()}`);
      if (print.fill !== 'rgb(243, 244, 241)') throw new Error(`in print a node is filled ${print.fill}, luccet.css's print --t-soft is #f3f4f1`);
    },
  },
  {
    name: 'a change of light or dark preference redraws; a note rendered again reuses its drawings',
    url: '/test/mermaid/pages/addon.html',
    timeout: 60000,
    context: { colorScheme: 'light' },
    async check(page) {
      const fill = () => getComputedStyle(document.querySelector('#flow > svg.t-mermaid-screen .node rect')).fill;
      await page.waitForFunction(() => document.querySelector('#flow > svg.t-mermaid-screen'), null, { timeout: 40000 });
      const light = await page.evaluate(fill);
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForFunction((was) => getComputedStyle(document.querySelector('#flow > svg.t-mermaid-screen .node rect')).fill !== was && document.querySelector('#flow > svg.t-mermaid-print'), light, { timeout: 20000 });
      const dark = await page.evaluate((softSrc) => ({ fill: getComputedStyle(document.querySelector('#flow > svg.t-mermaid-screen .node rect')).fill, soft: new Function(`return (${softSrc})()`)() }), soft.toString());
      if (dark.fill !== dark.soft || dark.fill === light) throw new Error(`after the switch a node is filled ${dark.fill} (it was ${light}), --t-soft resolves to ${dark.soft}`);
      await page.emulateMedia({ colorScheme: 'light' });
      await page.waitForFunction((was) => getComputedStyle(document.querySelector('#flow > svg.t-mermaid-screen .node rect')).fill === was, light, { timeout: 20000 });
      // Once the redraws the switches queued are done, render the note again.
      const again = await page.evaluate(async () => {
        const main = document.querySelector('main.luccet');
        const render = window.mermaid.render;
        let calls = 0;
        let last = performance.now();
        window.mermaid.render = (...a) => (calls++, (last = performance.now()), render.apply(window.mermaid, a));
        while (performance.now() - last < 1000) await new Promise((r) => setTimeout(r, 100));
        calls = 0;
        const html = await (await fetch(location.href)).text();
        await window.luccet.render(main, html.slice(html.indexOf('</script>') + '</script>'.length));
        return { calls, svgs: main.querySelectorAll('.t-mermaid > svg.t-mermaid-screen').length };
      });
      if (again.calls || again.svgs !== 11) throw new Error(`rendered again: ${again.svgs} diagrams, ${again.calls} new drawings`);
    },
  },
  {
    name: '?base= loads a local copy without SRI; other options go to Mermaid',
    url: '/test/mermaid/pages/addon-base.html',
    timeout: 60000,
    async setup(_context, _page, ctx) {
      if (!(await mermaidDir(VERSION))) ctx.skip(`no local copy of Mermaid ${VERSION}`);
    },
    async check(page) {
      await page.waitForFunction(() => document.querySelector('.t-mermaid > svg.t-mermaid-screen'), null, { timeout: 40000 });
      const r = await page.evaluate(() => ({
        scripts: [...document.querySelectorAll('script[src*="mermaid.min.js"]')].map((e) => ({ src: new URL(e.src).pathname, sri: !!e.integrity })),
        look: window.mermaid.mermaidAPI.getConfig().look,
      }));
      if (JSON.stringify(r.scripts) !== JSON.stringify([{ src: '/vendor/mermaid/mermaid.min.js', sri: false }])) throw new Error(`scripts ${JSON.stringify(r.scripts)}`);
      if (r.look !== 'classic') throw new Error(`look ${r.look}, want classic from ?look=classic`);
    },
  },
  {
    name: 'Mermaid is not requested for a note with no diagram',
    url: '/test/mermaid/pages/addon-none.html',
    async check(page) {
      await page.waitForTimeout(300);
      if (await page.evaluate(() => document.querySelectorAll('script[src*="mermaid@"]').length)) throw new Error('Mermaid was requested for a note with no mermaid fence');
    },
  },
  {
    name: 'a Mermaid that fails to load leaves each fence as its source, with a warning; the next render asks for it again',
    url: '/test/mermaid/pages/addon.html',
    timeout: 90000,
    allowConsole: /Failed to load resource|Loading failed for the <script>|integrity|MIME type/i,
    async setup(context, _page, ctx) {
      // Routed after the copy's route, so it wins; lifted for the retry.
      ctx.blocked = (url) => MERMAID_URL.test(url.href);
      await context.route(ctx.blocked, (route) => route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'text/plain', body: 'not found' }));
    },
    async check(page, ctx) {
      await page.waitForFunction(() => [...document.querySelectorAll('script')].some((s) => /mermaid@/.test(s.src)), null, { timeout: 5000 });
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => ({ svgs: document.querySelectorAll('.t-mermaid svg').length, hidden: document.querySelectorAll('main.luccet pre[hidden]').length, fences: document.querySelectorAll('main.luccet code.language-mermaid').length }));
      if (r.svgs || r.hidden || r.fences !== 12) throw new Error(`${r.svgs} diagrams, ${r.hidden} hidden fences, ${r.fences} fences`);
      if (!ctx.console.some((m) => m.type === 'warning' && /Mermaid did not load/.test(m.text))) throw new Error(`no warning; console: ${JSON.stringify(ctx.console.slice(0, 5))}`);
      // The network is back: the note rendered again asks for Mermaid again and draws.
      await page.context().unroute(ctx.blocked);
      await page.evaluate(async () => {
        const html = await (await fetch(location.href)).text();
        await window.luccet.render(document.querySelector('main.luccet'), html.slice(html.indexOf('</script>') + '</script>'.length));
      });
      await page.waitForFunction(() => document.querySelectorAll('.t-mermaid > svg.t-mermaid-screen').length === 11, null, { timeout: 60000 });
      const scripts = await page.evaluate(() => document.querySelectorAll('script[src*="mermaid@"]').length);
      if (scripts !== 2) throw new Error(`${scripts} Mermaid script tags, expected the failed one and the retry`);
    },
  },
  {
    name: '?securityLevel=loose on the add-on does not loosen it: strict, and a click with a javascript: URL makes no such link',
    url: '/test/mermaid/pages/loose.html',
    timeout: 60000,
    async check(page) {
      await page.waitForFunction(() => document.querySelector('.t-mermaid > svg.t-mermaid-screen'), null, { timeout: 40000 });
      const r = await page.evaluate(() => ({
        level: window.mermaid.mermaidAPI.getConfig().securityLevel,
        look: window.mermaid.mermaidAPI.getConfig().look,
        hrefs: [...document.querySelectorAll('.t-mermaid a')].map((a) => a.getAttribute('href') || a.getAttribute('xlink:href') || ''),
      }));
      if (r.level !== 'strict') throw new Error(`securityLevel ${r.level}, expected strict whatever the tag says`);
      if (r.look !== 'classic') throw new Error(`look ${r.look}: the other options still reach Mermaid`);
      if (r.hrefs.some((x) => /^\s*javascript:/i.test(x))) throw new Error(`a javascript: link in the diagram: ${JSON.stringify(r.hrefs)}`);
    },
  },
  {
    name: 'a page drawn ahead by tools/diagrams.js: its copies shown per scheme and in print with no Mermaid request; a theme switch draws afresh',
    url: '/gen/built-diagrams.html',
    timeout: 90000,
    context: { colorScheme: 'light' },
    async setup(_context, page, ctx) {
      const b = builtDiagrams();
      if (b.why && /Executable doesn't exist|playwright install|cannot be required/.test(b.why)) ctx.skip(`tools/diagrams.js could not draw here: ${b.why}`);
      if (b.why) throw new Error(`tools/diagrams.js drew no diagram: ${b.why}`);
      ctx.mermaid = 0;
      page.on('request', (q) => /mermaid\.min\.js/.test(q.url()) && ctx.mermaid++);
    },
    async check(page, ctx) {
      const shown = () =>
        page.evaluate(() =>
          ['#flow', '#lst > .t-mermaid'].map((sel) =>
            [...document.querySelectorAll(`${sel} > svg`)].map((s) => `${s.className.baseVal.replace(/t-mermaid-/g, '')}:${getComputedStyle(s).display}`).join(' '),
          ),
        );
      const keyOf = (sel) => page.evaluate((sel) => document.querySelector(`${sel} > svg.t-mermaid-screen`).getAttribute('data-palette'), sel);
      await page.waitForTimeout(300);
      let s = await shown();
      if (s[0] !== 'screen:block alt:none print:none' || s[1] !== 'screen:block alt:none print:none') throw new Error(`in the light scheme: ${JSON.stringify(s)}`);
      const light = await keyOf('#flow');
      if (ctx.mermaid) throw new Error('Mermaid was requested for a page whose diagrams are drawn');
      // The dark scheme: the dark copy, still without Mermaid.
      await page.emulateMedia({ colorScheme: 'dark' });
      await h.expect(page, (was) => document.querySelector('#flow > svg.t-mermaid-screen').getAttribute('data-palette') !== was, 'the dark copy shown', 8000, light);
      s = await shown();
      if (s[0] !== 'alt:none screen:block print:none' || s[1] !== 'alt:none screen:block print:none') throw new Error(`in the dark scheme: ${JSON.stringify(s)}`);
      if (ctx.mermaid) throw new Error('Mermaid was requested for the dark scheme');
      // Print: the print copy alone.
      await page.emulateMedia({ media: 'print' });
      s = await shown();
      if (s[0] !== 'alt:none screen:none print:block') throw new Error(`in print: ${JSON.stringify(s)}`);
      await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
      // A theme no copy was drawn for: the add-on draws afresh, once Mermaid is loaded, and the kept copies go.
      const built = await page.evaluate(() => [...document.querySelectorAll('#flow > svg, #lst > .t-mermaid > svg')].map((e) => Number(/-p(\d+)$/.exec(e.id)[1])));
      await page.evaluate(async () => {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = '/test/mermaid/pages/themes/nord.css'; // a copy of Luccet/themes's nord.css
        document.head.append(l);
        await new Promise((r) => (l.onload = r));
        window.dispatchEvent(new CustomEvent('luccet:theme', { detail: { theme: 'nord', href: l.href } }));
      });
      await h.expect(page, () => document.querySelectorAll('#flow > svg').length === 2 && document.querySelectorAll('#lst > .t-mermaid > svg').length === 2 && !document.querySelector('.t-mermaid-alt') && getComputedStyle(document.querySelector('#flow > svg.t-mermaid-screen .node rect')).fill === 'rgb(59, 66, 82)', 'both diagrams drawn afresh in Nord, the kept copies gone', 60000);
      if (ctx.mermaid !== 1) throw new Error(`${ctx.mermaid} Mermaid requests for the fresh drawing, expected 1`);
      // The print copies follow the screen ones; every fresh id suffix comes after the build's.
      await h.expect(page, (max) => [...document.querySelectorAll('#flow > svg, #lst > .t-mermaid > svg')].every((e) => Number(/-p(\d+)$/.exec(e.id)[1]) > max), `fresh id suffixes after the build's (${built})`, 30000, Math.max(...built));
    },
  },
];

h.runBrowser(TESTS, {
  generated: { 'built-diagrams.html': () => ['text/html', builtDiagrams().html || ''] },
  // The local copy, for ?base=.
  route: (url) => (url.startsWith('/vendor/mermaid/') ? path.join(require('../../tools/npm').CACHE, `mermaid-${VERSION}`, 'dist', path.normalize(url.slice('/vendor/mermaid/'.length))) : null),
  cdn: [{ re: MERMAID_URL, dir: (v) => require('../../tools/mermaid').packageDir(v) }],
});
