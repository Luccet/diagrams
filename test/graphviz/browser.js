#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// graphviz.js in Chromium and Firefox (test/harness.js): fences drawn in the
// theme's colours with the graph's own kept, readable text on a fill the
// graph gives, print copies and unique ids, unsafe links dropped, Viz.js
// pinned with SRI; a dark theme under a strict policy that allows
// WebAssembly, and one that does not; a change of scheme colours again
// without a new layout, and a note rendered again reuses its layouts; ?base=
// and ?engine=; no Viz.js for a note without a graph; a Viz.js that does not
// load; both of the kit's add-ons on one page; and a page drawn ahead by
// tools/diagrams.js. Viz.js comes from its local copy (tools/graphviz.js),
// so runs are the same each time and work offline after the first.
//
//   LUCCET_ROOT=…/luccet node test/graphviz/browser.js [--browsers=…] [--filter=TEXT] [--live-cdn]
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const h = require('../harness');

const VERSION = /version: '([\d.]+)'/.exec(fs.readFileSync(path.join(h.ROOT, 'graphviz.js'), 'utf8'))[1];
const VIZ_URL = /^https:\/\/cdn\.jsdelivr\.net\/npm\/@viz-js\/viz@(\d+\.\d+\.\d+)\/([^?#]+)/;
const MERMAID_URL = /^https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@(\d+\.\d+\.\d+)\/([^?#]+)/;
const vizDir = (v) => h.cached('Viz.js', require('../../tools/graphviz').packageDir, v);

// In the page: a custom property resolved as the add-on resolves it, as
// #rrggbb (luccet.css's defaults are the system's colours), and the colour
// an SVG attribute names, the same way.
const PAGE = () => {
  const toHex = (rgb) => '#' + rgb.match(/\d+/g).slice(0, 3).map((x) => Number(x).toString(16).padStart(2, '0')).join('');
  const resolved = (value, at = document.querySelector('main.luccet')) => {
    const s = document.createElement('span');
    s.style.color = value;
    at.append(s);
    const c = getComputedStyle(s).color;
    s.remove();
    return toHex(c);
  };
  window.__gv = {
    prop: (k, at) => resolved(getComputedStyle(at || document.querySelector('main.luccet')).getPropertyValue(`--t-${k}`).trim(), at),
    hex: (c) => resolved(c),
    shown: (sel) => [...document.querySelectorAll(`${sel} > svg`)].filter((s) => getComputedStyle(s).display !== 'none'),
  };
};

// The instance's render, counted and its options kept: every instance
// shares the class, so its prototype is patched.
const SPY = async () => {
  const proto = Object.getPrototypeOf(await window.Viz.instance());
  if (proto.__spied) return;
  const render = proto.render;
  proto.__spied = true;
  window.__renders = [];
  proto.render = function (src, o) {
    window.__renders.push({ src, engine: o && o.engine });
    return render.call(this, src, o);
  };
};

// A note built with the engine's luccet build and drawn ahead with
// tools/diagrams.js, its URLs made the site's; or why it could not be.
let builtPage = null;
function builtGraphs() {
  if (builtPage) return builtPage;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luccet-graphviz-built-'));
  try {
    fs.copyFileSync(h.LUCCET_JS, path.join(dir, 'luccet.js'));
    fs.copyFileSync(path.join(h.ROOT, 'graphviz.js'), path.join(dir, 'graphviz.js'));
    fs.writeFileSync(path.join(dir, 'n.html'), '<!doctype html><meta charset="utf-8"><script src="luccet.js" data-use="graphviz.js"></script>\n\n# Graphs drawn ahead {#top}\n\n```dot {#flow}\ndigraph { a -> b; b [style=filled] }\n```\n\n```graphviz [A listing]{#lst}\ngraph { x -- y }\n```\n');
    const b = h.cli(['build', 'n.html', '-o', 'page.html'], { cwd: dir });
    if (b.code !== 0) throw new Error(`luccet build: ${b.err}`);
    const r = spawnSync(process.execPath, [path.join(h.ROOT, 'tools', 'diagrams.js'), 'page.html'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NODE_PATH: path.join(h.ENGINE, 'node_modules') } });
    if (r.status !== 0) throw new Error(`diagrams.js: ${r.stderr}`);
    const html = r.stdout.replace('src="luccet.js"', 'src="/luccet.js"').replace(/(src|data-use)="graphviz\.js"/g, '$1="/graphviz.js"');
    builtPage = /class="t-graphviz-screen t-graphviz-light"/.test(html) ? { html } : { why: r.stderr.trim() };
    return builtPage;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const DRAWN = 7; // flow, coloured, lst, circle, the pair, links; and broken
const FENCES = 8;

const TESTS = [
  {
    name: "fences drawn in the theme's colours, the graph's own kept, text readable on its fills; listings, ids and engines; unsafe links dropped; a broken one left with its error and its id; print copies with unique ids; Viz.js pinned with SRI",
    url: '/test/graphviz/pages/addon.html',
    timeout: 60000,
    init: PAGE,
    async check(page, ctx) {
      await h.expect(page, (n) => document.querySelectorAll('main.luccet .t-graphviz > svg.t-graphviz-screen').length === n && document.querySelectorAll('main.luccet .t-graphviz > svg.t-graphviz-print').length === n && document.querySelector('.t-graphviz-error'), 'every graph drawn, with its print copy', 40000, DRAWN);
      const r = await page.evaluate(() => {
        const g = window.__gv;
        const at = (sel) => document.querySelector(sel);
        const flow = at('#flow');
        const svg = at('#flow > svg.t-graphviz-screen');
        const node = (name, s = svg) => [...s.querySelectorAll('g.node')].find((n) => n.querySelector('text') && n.querySelector('text').textContent === name);
        const shape = (n) => n.querySelector('ellipse, polygon, path');
        const col = at('#coloured > svg.t-graphviz-screen');
        const owner = new Map();
        const dupIds = [];
        for (const e of document.querySelectorAll('.t-graphviz > svg[id], .t-graphviz > svg [id]')) {
          if (owner.has(e.id) && owner.get(e.id) !== e.closest('svg')) dupIds.push(e.id);
          owner.set(e.id, e.closest('svg'));
        }
        const hrefs = [...document.querySelectorAll('#links > svg.t-graphviz-screen a')].map((a) => a.getAttribute('xlink:href') || a.getAttribute('href'));
        const broken = at('.t-graphviz-error');
        return {
          flow: flow.matches('.t-graphviz') && flow.querySelector(':scope > pre').hidden && flow.hasAttribute('data-pos'),
          stroke: shape(node('Write the note')).getAttribute('stroke'),
          muted: g.prop('muted'),
          text: node('Write the note').querySelector('text').getAttribute('fill'),
          fg: g.prop('fg'),
          font: node('Write the note').querySelector('text').getAttribute('font-family'),
          sans: getComputedStyle(at('main.luccet')).getPropertyValue('--t-sans').trim(),
          filled: shape(node('Publish')).getAttribute('fill'),
          soft: g.prop('soft'),
          cluster: at('#flow > svg.t-graphviz-screen g.cluster polygon').getAttribute('stroke'),
          line: g.prop('line'),
          edge: at('#flow > svg.t-graphviz-screen g.edge path').getAttribute('stroke'),
          arrow: at('#flow > svg.t-graphviz-screen g.edge polygon').getAttribute('fill'),
          background: [...svg.querySelectorAll(':scope > g > polygon')].map((p) => p.getAttribute('fill')),
          light: shape(node('light fill', col)).getAttribute('fill'),
          onLight: node('light fill', col).querySelector('text').getAttribute('fill'),
          bg: g.prop('bg'),
          red: shape(node('red and blue', col)).getAttribute('stroke'),
          blue: node('red and blue', col).querySelector('text').getAttribute('fill'),
          green: col.querySelector('g.edge path').getAttribute('stroke'),
          listing: !!at('figure[data-t=code] > .t-graphviz > svg') && !!at('figure[data-t=code] > figcaption'),
          circle: !!at('#circle > svg.t-graphviz-screen g.node'),
          hrefs,
          brokenId: !!(at('#broken') && at('#broken').matches('pre') && !at('#broken').hidden),
          broken: broken && broken.previousElementSibling === at('#broken') && /^Graphviz cannot draw this graph: .*syntax error/.test(broken.textContent),
          js: !!at('main.luccet > pre > code.language-js'),
          titles: [...document.querySelectorAll('.t-graphviz > svg > g > title')].map((t) => t.textContent),
          dupIds,
          refs: [...document.querySelectorAll('.t-graphviz-print [fill^="url("]')].length,
          scripts: [...document.querySelectorAll('script[src*="viz-global"]')].map((e) => ({ src: e.src.replace(/^.*\/npm\//, ''), sri: e.integrity.startsWith('sha384-') })),
        };
      });
      const want = {
        flow: true, stroke: r.muted, text: r.fg, font: r.sans, filled: r.soft, cluster: r.line, edge: r.muted, arrow: r.muted,
        light: 'lightblue', red: 'red', blue: 'blue', green: 'darkgreen', listing: true, circle: true, brokenId: true, broken: true, js: true,
      };
      for (const [k, v] of Object.entries(want)) if (r[k] !== v) throw new Error(`${k}: ${JSON.stringify(r[k])}, want ${JSON.stringify(v)}`);
      if (!r.background.every((f) => f === 'transparent')) throw new Error(`the graph's background is filled: ${r.background}`);
      // lightblue is light: on it the palette's text colour (dark in a light scheme) reads better than its background.
      if (r.onLight !== r.fg) throw new Error(`text on lightblue is ${r.onLight}; the palette's text colour is ${r.fg}, its background ${r.bg}`);
      if (JSON.stringify(r.hrefs) !== JSON.stringify([null, null, 'https://example.com/', '#flow'])) throw new Error(`links ${JSON.stringify(r.hrefs)}: javascript: dropped, https and a fragment kept`);
      if (r.titles.some((t) => /^%/.test(t))) throw new Error(`an unnamed graph's title kept: ${r.titles}`);
      if (r.dupIds.length) throw new Error(`ids repeated across copies: ${[...new Set(r.dupIds)].slice(0, 5).join(', ')}`);
      if (JSON.stringify(r.scripts) !== JSON.stringify([{ src: `@viz-js/viz@${VERSION}/dist/viz-global.js`, sri: true }])) throw new Error(`scripts ${JSON.stringify(r.scripts)}`);
      if (!ctx.console.some((m) => m.type === 'warning' && /Luccet graphviz\.js: .*syntax error/.test(m.text))) throw new Error('no console warning for the broken graph');
      // Print: the print copies alone, in luccet.css's print palette.
      await page.emulateMedia({ media: 'print' });
      const print = await page.evaluate(() => {
        const shown = window.__gv.shown('#flow');
        const n = [...shown[0].querySelectorAll('g.node')].find((x) => x.querySelector('text').textContent === 'Publish');
        return { kinds: shown.map((s) => s.classList[0]), fill: n.querySelector('polygon').getAttribute('fill'), text: n.querySelector('text').getAttribute('fill') };
      });
      if (JSON.stringify(print) !== JSON.stringify({ kinds: ['t-graphviz-print'], fill: '#f3f4f1', text: '#000000' })) throw new Error(`in print: ${JSON.stringify(print)}`);
    },
  },
  {
    name: "a dark theme under a strict policy that allows WebAssembly, with data-nonce: no violation, the theme's colours, light text on its own fills, a light copy for print",
    url: '/csp-wasm/test/graphviz/pages/addon-theme.html',
    timeout: 60000,
    init: PAGE,
    async check(page) {
      await h.expect(page, () => document.querySelectorAll('.t-graphviz > svg.t-graphviz-print').length === 2, 'both graphs drawn, with print copies', 40000);
      const r = await page.evaluate(() => {
        const g = window.__gv;
        const svg = g.shown('#flow')[0];
        const b = [...svg.querySelectorAll('g.node')].find((n) => n.querySelector('text').textContent === 'b');
        return {
          csp: window.__csp,
          nonces: [...document.querySelectorAll('script[src*="viz-global"]')].map((e) => e.nonce),
          fill: b.querySelector('ellipse').getAttribute('fill'),
          soft: g.prop('soft'),
          text: b.querySelector('text').getAttribute('fill'),
          fg: g.prop('fg'),
          kinds: [...document.querySelectorAll('.t-graphviz')].map((w) => g.shown(`#${w.id || 'x'}`).length),
        };
      });
      if (r.csp.length) throw new Error(`CSP violations: ${r.csp.slice(0, 3).join('; ')}`);
      if (JSON.stringify(r.nonces) !== JSON.stringify([h.NONCE])) throw new Error(`Viz.js's script nonces ${JSON.stringify(r.nonces)}`);
      if (r.fill !== r.soft) throw new Error(`a filled node is ${r.fill}, nord's --t-soft is ${r.soft}`);
      if (r.text !== r.fg) throw new Error(`text on --t-soft is ${r.text}, nord's --t-fg is ${r.fg}`);
    },
  },
  {
    name: "a strict policy without 'wasm-unsafe-eval': every fence stays as its source, with a warning that names it",
    url: '/csp-nonce/test/graphviz/pages/addon-theme.html',
    timeout: 30000,
    allowConsole: /WebAssembly|wasm|unsafe-eval|Content Security Policy|Aborted|CompileError/i,
    async check(page, ctx) {
      await h.expect(page, () => window.__csp.length > 0, 'the policy blocks WebAssembly', 15000);
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => ({ svgs: document.querySelectorAll('.t-graphviz svg').length, hidden: document.querySelectorAll('main.luccet pre[hidden]').length, fences: document.querySelectorAll('main.luccet code.language-dot, main.luccet code.language-graphviz').length }));
      if (r.svgs || r.hidden || r.fences !== 2) throw new Error(`${r.svgs} graphs, ${r.hidden} hidden fences, ${r.fences} fences`);
      if (!ctx.console.some((m) => m.type === 'warning' && /Graphviz did not start .*'wasm-unsafe-eval'/.test(m.text))) throw new Error(`no warning; console: ${JSON.stringify(ctx.console.slice(0, 5))}`);
    },
  },
  {
    name: 'a change of light or dark preference colours the graphs again without a new layout; a note rendered again reuses its layouts',
    url: '/test/graphviz/pages/addon.html',
    timeout: 60000,
    init: PAGE,
    context: { colorScheme: 'light' },
    async check(page) {
      const stroke = () => document.querySelector('#flow > svg.t-graphviz-screen g.node ellipse').getAttribute('stroke');
      await h.expect(page, () => document.querySelector('#flow > svg.t-graphviz-screen'), 'the graph drawn', 30000);
      await page.evaluate(SPY);
      const light = await page.evaluate(stroke);
      await page.emulateMedia({ colorScheme: 'dark' });
      await h.expect(page, (was) => document.querySelector('#flow > svg.t-graphviz-screen g.node ellipse').getAttribute('stroke') !== was, 'coloured again in the dark scheme', 10000, light);
      const dark = await page.evaluate((s) => ({ stroke: new Function(`return (${s})()`)(), muted: window.__gv.prop('muted'), onLight: [...document.querySelectorAll('#coloured > svg.t-graphviz-screen g.node')].find((n) => n.querySelector('text').textContent === 'light fill').querySelector('text').getAttribute('fill'), bg: window.__gv.prop('bg'), renders: window.__renders.length }), stroke.toString());
      if (dark.stroke !== dark.muted) throw new Error(`in the dark scheme a node is stroked ${dark.stroke}, --t-muted resolves to ${dark.muted}`);
      // In a dark scheme the palette's text is light: on lightblue its dark background reads better.
      if (dark.onLight !== dark.bg) throw new Error(`text on lightblue in the dark scheme is ${dark.onLight}, the palette's background is ${dark.bg}`);
      if (dark.renders) throw new Error(`${dark.renders} new layouts for a change of scheme`);
      await page.emulateMedia({ colorScheme: 'light' });
      await h.expect(page, (was) => document.querySelector('#flow > svg.t-graphviz-screen g.node ellipse').getAttribute('stroke') === was, 'the light colours back', 10000, light);
      const again = await page.evaluate(async () => {
        const main = document.querySelector('main.luccet');
        window.__renders.length = 0;
        const html = await (await fetch(location.href)).text();
        await window.luccet.render(main, html.slice(html.indexOf('</script>') + '</script>'.length));
        await new Promise((r) => setTimeout(r, 300));
        return { renders: window.__renders.length, svgs: main.querySelectorAll('.t-graphviz > svg.t-graphviz-screen').length };
      });
      if (again.renders || again.svgs !== DRAWN) throw new Error(`rendered again: ${again.svgs} graphs, ${again.renders} new layouts`);
    },
  },
  {
    name: '?base= loads a local copy without SRI; ?engine= reaches Graphviz',
    url: '/test/graphviz/pages/addon-base.html',
    timeout: 60000,
    async setup(_context, _page, ctx) {
      if (!(await vizDir(VERSION))) ctx.skip(`no local copy of Viz.js ${VERSION}`);
    },
    async check(page) {
      await h.expect(page, () => document.querySelector('.t-graphviz > svg.t-graphviz-screen'), 'the graph drawn', 30000);
      const r = await page.evaluate(() => ({ scripts: [...document.querySelectorAll('script[src*="viz-global.js"]')].map((e) => ({ src: new URL(e.src).pathname, sri: !!e.integrity })) }));
      if (JSON.stringify(r.scripts) !== JSON.stringify([{ src: '/vendor/viz/viz-global.js', sri: false }])) throw new Error(`scripts ${JSON.stringify(r.scripts)}`);
      await page.evaluate(SPY);
      const engine = await page.evaluate(async () => {
        const html = await (await fetch(location.href)).text();
        await window.luccet.render(document.querySelector('main.luccet'), html.slice(html.indexOf('</script>') + '</script>'.length).replace('a -- b', 'a -- b -- d'));
        await new Promise((r) => setTimeout(r, 300));
        return window.__renders.map((x) => x.engine);
      });
      if (JSON.stringify(engine) !== '["neato"]') throw new Error(`engines ${JSON.stringify(engine)}, want neato from ?engine=neato`);
    },
  },
  {
    name: 'Viz.js is not requested for a note with no graph',
    url: '/test/graphviz/pages/addon-none.html',
    async check(page) {
      await page.waitForTimeout(300);
      if (await page.evaluate(() => document.querySelectorAll('script[src*="viz-global"]').length)) throw new Error('Viz.js was requested for a note with no graph');
    },
  },
  {
    name: 'a Viz.js that fails to load leaves each fence as its source, with a warning; the next render asks for it again',
    url: '/test/graphviz/pages/addon.html',
    timeout: 60000,
    allowConsole: /Failed to load resource|Loading failed for the <script>|integrity|MIME type/i,
    async setup(context, _page, ctx) {
      // Routed after the copy's route, so it wins; lifted for the retry.
      ctx.blocked = (url) => VIZ_URL.test(url.href);
      await context.route(ctx.blocked, (route) => route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'text/plain', body: 'not found' }));
    },
    async check(page, ctx) {
      await page.waitForFunction(() => [...document.querySelectorAll('script')].some((s) => /viz-global/.test(s.src)), null, { timeout: 5000 });
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => ({ svgs: document.querySelectorAll('.t-graphviz svg').length, hidden: document.querySelectorAll('main.luccet pre[hidden]').length, fences: document.querySelectorAll('main.luccet code.language-dot, main.luccet code.language-graphviz').length }));
      if (r.svgs || r.hidden || r.fences !== FENCES) throw new Error(`${r.svgs} graphs, ${r.hidden} hidden fences, ${r.fences} fences`);
      if (!ctx.console.some((m) => m.type === 'warning' && /Graphviz did not load/.test(m.text))) throw new Error(`no warning; console: ${JSON.stringify(ctx.console.slice(0, 5))}`);
      await page.context().unroute(ctx.blocked);
      await page.evaluate(async () => {
        const html = await (await fetch(location.href)).text();
        await window.luccet.render(document.querySelector('main.luccet'), html.slice(html.indexOf('</script>') + '</script>'.length));
      });
      await h.expect(page, (n) => document.querySelectorAll('.t-graphviz > svg.t-graphviz-screen').length === n, 'drawn once the network is back', 30000, DRAWN);
      const scripts = await page.evaluate(() => document.querySelectorAll('script[src*="viz-global"]').length);
      if (scripts !== 2) throw new Error(`${scripts} Viz.js script tags, expected the failed one and the retry`);
    },
  },
  {
    name: "both of the kit's add-ons on one page: each draws its own fences, and neither touches the other's",
    url: '/test/graphviz/pages/both.html',
    timeout: 60000,
    async check(page) {
      await h.expect(page, () => document.querySelector('#m.t-mermaid > svg.t-mermaid-screen') && document.querySelector('#g.t-graphviz > svg.t-graphviz-screen'), 'a Mermaid diagram and a Graphviz graph', 40000);
      const r = await page.evaluate(() => ({ mixed: document.querySelectorAll('.t-mermaid .t-graphviz, .t-graphviz .t-mermaid').length, wrappers: document.querySelectorAll('.t-mermaid:not(.t-mermaid-box), .t-graphviz').length }));
      if (r.mixed || r.wrappers !== 2) throw new Error(`${r.wrappers} wrappers, ${r.mixed} nested`);
    },
  },
  {
    name: 'a page drawn ahead by tools/diagrams.js: its copies shown per scheme and in print with no Viz.js request; a theme switch draws afresh',
    url: '/gen/built-graphs.html',
    timeout: 60000,
    context: { colorScheme: 'light' },
    async setup(_context, page, ctx) {
      const b = builtGraphs();
      if (b.why && /Executable doesn't exist|playwright install|cannot be required/.test(b.why)) ctx.skip(`tools/diagrams.js could not draw here: ${b.why}`);
      if (b.why) throw new Error(`tools/diagrams.js drew no graph: ${b.why}`);
      ctx.viz = 0;
      page.on('request', (q) => /viz-global\.js/.test(q.url()) && ctx.viz++);
    },
    async check(page, ctx) {
      const shown = () =>
        page.evaluate(() =>
          ['#flow', '#lst > .t-graphviz'].map((sel) =>
            [...document.querySelectorAll(`${sel} > svg`)].map((s) => `${s.className.baseVal.replace(/t-graphviz-/g, '')}:${getComputedStyle(s).display}`).join(' '),
          ),
        );
      await page.waitForTimeout(300);
      let s = await shown();
      if (s[0] !== 'screen:block alt:none print:none' || s[1] !== 'screen:block alt:none print:none') throw new Error(`in the light scheme: ${JSON.stringify(s)}`);
      const light = await page.evaluate(() => document.querySelector('#flow > svg.t-graphviz-screen').getAttribute('data-palette'));
      await page.emulateMedia({ colorScheme: 'dark' });
      await h.expect(page, (was) => document.querySelector('#flow > svg.t-graphviz-screen').getAttribute('data-palette') !== was, 'the dark copy shown', 8000, light);
      s = await shown();
      if (s[0] !== 'alt:none screen:block print:none' || s[1] !== 'alt:none screen:block print:none') throw new Error(`in the dark scheme: ${JSON.stringify(s)}`);
      await page.emulateMedia({ media: 'print' });
      s = await shown();
      if (s[0] !== 'alt:none screen:none print:block') throw new Error(`in print: ${JSON.stringify(s)}`);
      if (ctx.viz) throw new Error('Viz.js was requested for a page whose graphs are drawn');
      await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
      // A theme no copy was drawn for: the add-on lays the graphs out afresh, and the kept copies go.
      await page.evaluate(async () => {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = '/test/mermaid/pages/themes/nord.css'; // a copy of Luccet/themes's nord.css
        document.head.append(l);
        await new Promise((r) => (l.onload = r));
        window.dispatchEvent(new Event('luccet:theme'));
      });
      await h.expect(page, () => document.querySelectorAll('#flow > svg').length === 2 && document.querySelectorAll('#lst > .t-graphviz > svg').length === 2 && !document.querySelector('.t-graphviz-alt'), 'both graphs drawn afresh in Nord, the kept copies gone', 30000);
      if (ctx.viz !== 1) throw new Error(`${ctx.viz} Viz.js requests for the fresh drawing, expected 1`);
    },
  },
];

h.runBrowser(TESTS, {
  generated: { 'built-graphs.html': () => ['text/html', builtGraphs().html || ''] },
  // The local copy, for ?base=.
  route: (url) => (url.startsWith('/vendor/viz/') ? path.join(require('../../tools/npm').CACHE, `viz-${VERSION}`, 'dist', path.normalize(url.slice('/vendor/viz/'.length))) : null),
  cdn: [
    { re: VIZ_URL, dir: (v) => require('../../tools/graphviz').packageDir(v) },
    { re: MERMAID_URL, dir: (v) => require('../../tools/mermaid').packageDir(v) },
  ],
});
