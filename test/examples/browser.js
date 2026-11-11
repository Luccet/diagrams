#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// The examples in Chromium and Firefox (test/harness.js), opened as a reader
// opens them: examples/service.html's Mermaid diagrams and
// examples/internals.html's Graphviz graphs drawn in their numbered figures,
// in the theme's colours where the source gives none, and again in the dark
// scheme. Mermaid and Viz.js come from their local copies (tools/mermaid.js,
// tools/graphviz.js), as in the add-ons' own tests.
//
//   LUCCET_ROOT=…/luccet node test/examples/browser.js [--browsers=…] [--filter=TEXT] [--live-cdn]
'use strict';

const h = require('../harness');

const MERMAID_URL = /^https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@(\d+\.\d+\.\d+)\/([^?#]+)/;
const VIZ_URL = /^https:\/\/cdn\.jsdelivr\.net\/npm\/@viz-js\/viz@(\d+\.\d+\.\d+)\/([^?#]+)/;

// The examples load the engine and a theme from cdn.luccet.dev, as a
// reader's copy does. Here the engine is the checkout's, which the site
// serves as /luccet.js and /luccet.css, and the theme an empty stylesheet:
// the look is not under test, and the colours are checked against the
// custom properties in effect. Any other request to cdn.luccet.dev fails.
async function fromCdn(context, origin) {
  await context.route(/^https:\/\/cdn\.luccet\.dev\//, async (route) => {
    const url = route.request().url();
    const engine = /^https:\/\/cdn\.luccet\.dev\/v2\/(luccet\.(?:js|css))$/.exec(url);
    if (engine) return route.fulfill({ response: await route.fetch({ url: `${origin}/${engine[1]}` }) });
    if (/^https:\/\/cdn\.luccet\.dev\/themes\/v1\/[\w-]+\.css$/.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
}

// In the page: a custom property resolved, as rgb() (for Mermaid's styles,
// read with getComputedStyle) and as #rrggbb (for Graphviz's attributes).
const PAGE = () => {
  const rgb = (k) => {
    const s = document.createElement('span');
    s.style.color = `var(--t-${k})`;
    document.querySelector('main.luccet').append(s);
    const c = getComputedStyle(s).color;
    s.remove();
    return c;
  };
  const hex = (k) => '#' + rgb(k).match(/\d+/g).slice(0, 3).map((x) => Number(x).toString(16).padStart(2, '0')).join('');
  window.__ex = { rgb, hex };
};

// The figures' captions and the references to them.
const FIGURES = () => ({
  captions: [...document.querySelectorAll('main.luccet figure')].map((f) => `${f.id}: ${f.querySelector(':scope > figcaption').textContent.replace(/\s+/g, ' ').trim()}`),
  refs: [...document.querySelectorAll('main.luccet a.t-ref')].map((a) => `${a.getAttribute('href')} ${a.textContent}`),
});

function checkFigures(r, ids) {
  const caps = r.captions.map((c) => /^([\w-]+): (Figure \d+) /.exec(c)).map((m) => m && `${m[1]} ${m[2]}`);
  const want = ids.map((id, i) => `${id} Figure ${i + 1}`);
  if (JSON.stringify(caps) !== JSON.stringify(want)) throw new Error(`figures ${JSON.stringify(r.captions)}`);
  if (JSON.stringify(r.refs) !== JSON.stringify(ids.map((id, i) => `#${id} Figure ${i + 1}`))) throw new Error(`references ${JSON.stringify(r.refs)}`);
}

const SERVICE = ['fig-parts', 'fig-request', 'fig-station', 'fig-branches', 'fig-plan', 'fig-requests'];
const INTERNALS = ['fig-modules', 'fig-tables', 'fig-gauges'];

const TESTS = [
  {
    name: "examples/service.html: six kinds of Mermaid diagram drawn in numbered figures, with print copies; nodes, the note, the critical task and the slices in the theme's colours; the git graph's own settings; drawn again in the dark scheme",
    url: '/examples/service.html',
    timeout: 120000,
    init: PAGE,
    context: { colorScheme: 'light' },
    setup: (context, page, ctx) => fromCdn(context, ctx.origin),
    async check(page) {
      await h.expect(page, () => document.querySelectorAll('main.luccet figure > .t-mermaid > svg.t-mermaid-screen').length === 6 && document.querySelectorAll('main.luccet figure > .t-mermaid > svg.t-mermaid-print').length === 6, 'six diagrams drawn, each with its print copy', 90000);
      checkFigures(await page.evaluate(FIGURES), SERVICE);
      const r = await page.evaluate((ids) => {
        const svg = (id) => document.querySelector(`#${id} > .t-mermaid > svg.t-mermaid-screen`);
        const texts = (id) => [...svg(id).querySelectorAll('text, .nodeLabel, .edgeLabel')].map((t) => t.textContent.trim());
        const style = (e, k) => e && getComputedStyle(e)[k];
        const note = svg('fig-request').querySelector('rect.note');
        const crit = [...svg('fig-plan').querySelectorAll('rect.task')].find((t) => [...t.classList].some((c) => /^crit\d+$/.test(c)));
        const feed = [...svg('fig-parts').querySelectorAll('.node')].find((e) => e.textContent.trim() === 'Feed');
        const x = window.__ex;
        return {
          kinds: ids.map((id) => svg(id).getAttribute('aria-roledescription')),
          fences: document.querySelectorAll('main.luccet figure > .t-mermaid > pre[hidden] > code.language-mermaid').length,
          parts: texts('fig-parts'),
          request: texts('fig-request'),
          station: texts('fig-station'),
          branches: texts('fig-branches'),
          plan: texts('fig-plan'),
          slices: svg('fig-requests').querySelectorAll('.pieCircle').length,
          rotated: [...svg('fig-branches').querySelectorAll('[transform]')].filter((e) => /rotate\(/.test(e.getAttribute('transform'))).length,
          node: style(feed && feed.querySelector('rect, path'), 'fill'),
          soft: x.rgb('soft'),
          note: [style(note, 'fill'), style(note, 'stroke')],
          markWarn: [x.rgb('mark'), x.rgb('warn')],
          crit: crit ? [style(crit, 'fill'), style(crit, 'stroke')] : null,
          errors: [x.rgb('error-bg'), x.rgb('error')],
          slice: style(svg('fig-requests').querySelector('.pieCircle'), 'fill'),
          link: x.rgb('link'),
        };
      }, SERVICE);
      const has = (list, want, what) => {
        const missing = want.filter((w) => !list.includes(w));
        if (missing.length) throw new Error(`${what}: no ${missing.join(', ')} in ${JSON.stringify(list)}`);
      };
      if (r.kinds.join() !== 'flowchart-v2,sequence,stateDiagram,gitGraph,gantt,pie') throw new Error(`kinds ${r.kinds}`);
      if (r.fences !== 6) throw new Error(`${r.fences} fences kept, hidden, in their diagrams`);
      has(r.parts, ['Tide gauges', 'Feed', 'Postgres', 'Model, nightly', 'API', 'Redis', 'Apps and charts', 'tide service'], 'the flowchart');
      has(r.request, ['App', 'API', 'Redis', 'Postgres', '[miss]', '[hit]', "The model's nightly run clears the cache."], 'the sequence diagram');
      has(r.station, ['Online', 'Stale', 'Offline', 'no reading for 30 min'], 'the state diagram');
      has(r.branches, ['main', 'datum', 'stale', 'release-1.5', 'v1.5.0', 'v1.5.1', 'fix Leith'], 'the git graph');
      has(r.plan, ['Datum column', 'Fill the datums', 'Stale flag', 'Datum in responses', 'Tag 1.5.0'], 'the Gantt chart');
      if (r.slices !== 4) throw new Error(`${r.slices} pie slices`);
      if (r.rotated) throw new Error(`${r.rotated} rotated labels in the git graph: its front matter's rotateCommitLabel: false did not apply`);
      if (r.node !== r.soft) throw new Error(`a flowchart node is filled ${r.node}, --t-soft is ${r.soft}`);
      if (r.note.join() !== r.markWarn.join()) throw new Error(`the note is ${r.note}, --t-mark and --t-warn are ${r.markWarn}`);
      if (!r.crit || r.crit.join() !== r.errors.join()) throw new Error(`the critical task is ${r.crit}, --t-error-bg and --t-error are ${r.errors}`);
      if (r.slice !== r.link) throw new Error(`the first slice is ${r.slice}, --t-link is ${r.link}`);
      // The dark scheme: drawn again in its colours.
      await page.emulateMedia({ colorScheme: 'dark' });
      const dark = (was) => {
        const n = [...document.querySelectorAll('#fig-parts svg.t-mermaid-screen .node')].find((e) => e.textContent.trim() === 'Feed');
        const fill = n && getComputedStyle(n.querySelector('rect, path')).fill;
        return fill !== was && fill === window.__ex.rgb('soft');
      };
      await h.expect(page, dark, "the flowchart drawn again in the dark scheme's --t-soft", 30000, r.node);
    },
  },

  {
    name: "examples/internals.html: three Graphviz graphs drawn in numbered figures, with print copies; the head script's rounded boxes; the theme's colours where the graph gives none, its own kept and readable text on its fills, in light and dark; the links to the note's sections; the tables in Courier; the gauges undirected",
    url: '/examples/internals.html',
    timeout: 90000,
    init: PAGE,
    context: { colorScheme: 'light' },
    setup: (context, page, ctx) => fromCdn(context, ctx.origin),
    async check(page) {
      await h.expect(page, () => document.querySelectorAll('main.luccet figure > .t-graphviz > svg.t-graphviz-screen').length === 3 && document.querySelectorAll('main.luccet figure > .t-graphviz > svg.t-graphviz-print').length === 3, 'three graphs drawn, each with its print copy', 60000);
      checkFigures(await page.evaluate(FIGURES), INTERNALS);
      const look = () => {
        const svg = (id) => document.querySelector(`#${id} > .t-graphviz > svg.t-graphviz-screen`);
        const nodes = (id) => [...svg(id).querySelectorAll('g.node')];
        const node = (id, name) => nodes(id).find((n) => n.querySelector('title').textContent === name);
        const shape = (n) => n.querySelector('path, polygon, ellipse');
        const x = window.__ex;
        return {
          names: nodes('fig-modules').map((n) => n.querySelector('title').textContent).sort().join(),
          clusters: svg('fig-modules').querySelectorAll('g.cluster').length,
          shapes: [...new Set(nodes('fig-modules').map((n) => shape(n).tagName))].join(),
          plain: [shape(node('fig-modules', 'poll')).getAttribute('stroke'), node('fig-modules', 'poll').querySelector('text').getAttribute('fill')],
          packages: ['undici', 'fastify', 'ioredis', 'pg'].map((k) => shape(node('fig-modules', k)).getAttribute('fill')),
          changed: ['parse', 'db', 'routes'].map((k) => shape(node('fig-modules', k)).getAttribute('fill')),
          onChanged: node('fig-modules', 'parse').querySelector('text').getAttribute('fill'),
          dashed: [...svg('fig-modules').querySelectorAll('g.edge')].filter((e) => e.querySelector('path').getAttribute('stroke') === 'crimson').map((e) => e.querySelector('title').textContent),
          links: [...svg('fig-modules').querySelectorAll('g.node a')].map((a) => `${a.closest('g.node').querySelector('title').textContent} ${a.getAttribute('xlink:href') || a.getAttribute('href')}`),
          tables: nodes('fig-tables').map((n) => n.querySelector('title').textContent).join(),
          columns: [...svg('fig-tables').querySelectorAll('text')].map((t) => t.textContent),
          fonts: [...new Set([...svg('fig-tables').querySelectorAll('text')].map((t) => t.getAttribute('font-family').split(',')[0]))].join(),
          gauges: nodes('fig-gauges').length,
          lines: svg('fig-gauges').querySelectorAll('g.edge').length,
          arrows: svg('fig-gauges').querySelectorAll('g.edge polygon').length,
          muted: x.hex('muted'),
          fg: x.hex('fg'),
          bg: x.hex('bg'),
          soft: x.hex('soft'),
        };
      };
      const r = await page.evaluate(look);
      const want = {
        names: 'cache,db,fastify,fit,harmonics,ioredis,parse,pg,poll,routes,stations,undici,units',
        clusters: 4,
        shapes: 'path', // rounded boxes, from the head script's defaults
        plain: [r.muted, r.fg],
        packages: [r.soft, r.soft, r.soft, r.soft],
        changed: ['#fde68a', '#fde68a', '#fde68a'],
        onChanged: r.fg,
        dashed: ['routes->harmonics'],
        links: ['db #tables', 'stations #gauges'],
        tables: 'stations,readings,predictions',
        fonts: 'Courier',
        gauges: 10,
        lines: 11,
        arrows: 0,
      };
      for (const [k, v] of Object.entries(want)) if (JSON.stringify(r[k]) !== JSON.stringify(v)) throw new Error(`${k}: ${JSON.stringify(r[k])}, want ${JSON.stringify(v)}`);
      if (!r.columns.includes('datum_m numeric(5, 2)')) throw new Error(`the tables' text: ${JSON.stringify(r.columns)}`);
      // A node's link goes to its section.
      await page.locator('#fig-modules svg.t-graphviz-screen g.node a').first().click();
      await h.expect(page, () => location.hash === '#tables', 'the db node to go to #tables', 5000);
      // The dark scheme: coloured again; on the yellow fill, the dark background reads better than the light text.
      await page.emulateMedia({ colorScheme: 'dark' });
      await h.expect(page, (was) => document.querySelector('#fig-modules svg.t-graphviz-screen g.node path').getAttribute('stroke') !== was, 'the graphs coloured again in the dark scheme', 15000, r.muted);
      const d = await page.evaluate(look);
      if (d.plain.join() !== [d.muted, d.fg].join()) throw new Error(`in the dark scheme a plain node is ${d.plain}, --t-muted and --t-fg are ${d.muted}, ${d.fg}`);
      if (d.changed.join() !== r.changed.join() || d.onChanged !== d.bg) throw new Error(`in the dark scheme the yellow fill is ${d.changed}, its text ${d.onChanged}; --t-bg is ${d.bg}`);
    },
  },
];

h.runBrowser(TESTS, {
  cdn: [
    { re: MERMAID_URL, dir: (v) => require('../../tools/mermaid').packageDir(v) },
    { re: VIZ_URL, dir: (v) => require('../../tools/graphviz').packageDir(v) },
  ],
});
