#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// graphviz.js under node: it runs under the command line with no diagnostic
// and leaves drawing to the browser; its Viz.js table is well formed and is
// the pinned version's; its print palette is luccet.css's; tools/vendor.js
// writes the copy ?base= takes; tools/diagrams.js draws a built page's
// graphs ahead, and a page's Mermaid diagrams and Graphviz graphs together
// (in a headless Chromium, skipped when there is none). The browser's part
// is test/graphviz/browser.js's.
//
//   LUCCET_ROOT=…/luccet node test/graphviz/node.js
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const h = require('../harness');

const SRC = fs.readFileSync(path.join(h.ROOT, 'graphviz.js'), 'utf8');
const VERSION = /version: '([\d.]+)'/.exec(SRC)[1];
const node = (args, cwd = h.ROOT) => {
  const r = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', env: { ...process.env, NODE_PATH: path.join(h.ENGINE, 'node_modules') } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const offline = (r) => /could not be fetched|fetch failed|ENOTFOUND|EAI_AGAIN/.test(r.err + r.out);
const tool = (name) => path.join(h.ROOT, 'tools', name);

h.test("under luccet check and luccet build: no diagnostic, and the page holds no drawing, which is the browser's", async () => {
  const page = await h.checkAndBuild('graphviz.js', '# Hello\n\n```dot\ndigraph { a -> b }\n```\n\n```graphviz\ngraph { c -- d }\n```\n');
  h.assert(/<code class="language-dot">/.test(page) && /<code class="language-graphviz">/.test(page) && !/t-graphviz|<svg/.test(page), 'the built fences are fences');
});

h.test('the Viz.js table is well formed', () => {
  const block = /\/\/ <viz>[^\n]*\n([\s\S]*?)\n\s*\/\/ <\/viz>/.exec(SRC);
  h.assert(block, 'no <viz> table');
  const VIZ = new Function(`${block[1]}; return VIZ;`)();
  h.assert(/^\d+\.\d+\.\d+$/.test(VIZ.version), `version ${VIZ.version}`);
  h.assert(/^\d+\.\d+\.\d+$/.test(VIZ.graphviz), `Graphviz ${VIZ.graphviz}`);
  h.assert(/^sha384-[A-Za-z0-9+/]{64}$/.test(VIZ.sri), `hash ${VIZ.sri}`);
  return `Viz.js ${VIZ.version}, Graphviz ${VIZ.graphviz}`;
});

h.test("the table is the pinned version's (tools/graphviz.js --check)", () => {
  const r = node([tool('graphviz.js'), '--check']);
  if (r.code !== 0 && offline(r)) throw new h.Skip(`Viz.js ${VERSION} is not cached and could not be fetched`);
  h.assert(r.code === 0, `${r.out}${r.err}`);
});

h.test("its print palette is luccet.css's: its own colours as they are, the system's as browsers print them", () => {
  const PRINT = new Function(`return ${/const PRINT = (\{[\s\S]*?\});/.exec(SRC)[1]}`)();
  const long = (x) => (x.length === 4 ? '#' + [...x.slice(1)].map((c) => c + c).join('') : x);
  const want = require(path.join(h.ENGINE, 'test', 'lib', 'palette')).printPalette();
  const off = [];
  for (const k of Object.keys(PRINT)) {
    if (!/^#[0-9a-f]{6}$/.test(PRINT[k] || '')) off.push(`--t-${k}: ${PRINT[k]} is not #rrggbb`);
    else if (!(k in want)) off.push(`--t-${k}: luccet.css has no such property`);
    else if (/^#/.test(want[k] || '') && PRINT[k] !== long(want[k])) off.push(`--t-${k}: ${PRINT[k]}, luccet.css prints ${want[k]}`);
  }
  if (PRINT.bg !== '#ffffff' || PRINT.fg !== '#000000') off.push(`Canvas and CanvasText print white and black, not ${PRINT.bg} and ${PRINT.fg}`);
  h.assert(!off.length, off.join('; '));
});

h.test('tools/vendor.js: Viz.js in the layout ?base= takes, alone or with Mermaid; usage errors', () =>
  h.inTemp((dir) => {
    const r = node([tool('vendor.js'), 'vend', 'graphviz'], dir);
    if (r.code === 1 && offline(r)) throw new h.Skip(`Viz.js ${VERSION} is not cached and could not be fetched`);
    h.assert(r.code === 0, `vendor.js: ${r.err}`);
    h.assert(JSON.stringify(fs.readdirSync(path.join(dir, 'vend'), { recursive: true }).map(String).sort()) === '["viz","viz/viz-global.js"]', 'graphviz alone: vend/viz/viz-global.js');
    h.assert(new RegExp(`^Graphviz \\(Viz\\.js ${VERSION.replace(/\./g, '\\.')}\\) → vend/viz \\(1 file\\); load it with graphviz\\.js\\?base=vend/viz$`).test(r.err.trim()), `the base line: ${r.err}`);
    const both = node([tool('vendor.js'), 'all'], dir);
    if (both.code === 1 && offline(both)) throw new h.Skip('Mermaid is not cached and could not be fetched');
    h.assert(both.code === 0 && fs.existsSync(path.join(dir, 'all', 'viz', 'viz-global.js')) && fs.existsSync(path.join(dir, 'all', 'mermaid', 'mermaid.min.js')) && both.err.trim().split('\n').length === 2, `both: ${both.err}`);
    h.assert(node([tool('vendor.js'), 'x', 'katex'], dir).code === 2 && node([tool('vendor.js')], dir).code === 2, 'an unknown library, or no DIR');
  }),
);

// A note beside the real luccet.js and the kit's add-ons, since a browser
// runs them, built with the engine's command line.
function built(dir, name, note) {
  for (const [file, target] of [['luccet.js', h.LUCCET_JS], ['mermaid.js', path.join(h.ROOT, 'mermaid.js')], ['graphviz.js', path.join(h.ROOT, 'graphviz.js')]]) fs.copyFileSync(target, path.join(dir, file));
  fs.writeFileSync(path.join(dir, `${name}.html`), note);
  const r = h.cli(['build', `${name}.html`, '-o', `${name}.built.html`], { cwd: dir });
  h.assert(r.code === 0, `luccet build: ${r.err}`);
  return `${name}.built.html`;
}
const FIRST = '<!doctype html><meta charset="utf-8">';

async function chromium() {
  let pw = null;
  for (const from of [h.ROOT, h.ENGINE]) {
    try {
      pw = pw || require(require.resolve('playwright', { paths: [from] }));
    } catch {}
  }
  if (!pw) throw new h.Skip('playwright cannot be required');
  try {
    await (await pw.chromium.launch()).close();
  } catch (e) {
    throw new h.Skip(`Chromium cannot launch: ${String(e.message).split('\n')[0]}`);
  }
}

h.test('tools/diagrams.js: without graphviz.js the graphs are not drawn, and it says so', () =>
  h.inTemp((dir) => {
    const page = built(dir, 'plain', `${FIRST}<script src="luccet.js" data-use="mermaid.js"></script>\n\n\`\`\`dot\ndigraph { a -> b }\n\`\`\`\n`);
    const r = node([tool('diagrams.js'), page], dir);
    h.assert(r.code === 0 && /the page does not load graphviz\.js, so its graphs are not drawn/.test(r.err) && /1 diagram, 0 drawn ahead/.test(r.err) && !/luccet-graphviz-style/.test(r.out), `without the add-on: ${r.err}`);
  }),
);

h.test('tools/diagrams.js: graphs drawn ahead with light, dark and print copies, the fence hidden; a broken one kept with diagram.error; --json', () =>
  h.inTemp(async (dir) => {
    await chromium();
    const page = built(dir, 'n', `${FIRST}<script src="luccet.js" data-use="graphviz.js"></script>\n\n# G\n\n\`\`\`dot {#flow .wide}\ndigraph { a -> b }\n\`\`\`\n\n\`\`\`graphviz [A listing]{#lst}\ngraph { x -- y }\n\`\`\`\n\n\`\`\`dot\ndigraph { a -> }\n\`\`\`\n`);
    const r = node([tool('diagrams.js'), page, '--json'], dir);
    h.assert(r.code === 0, `diagrams.js: ${r.err}`);
    const j = JSON.parse(r.out);
    h.assert(j.diagrams.total === 3 && j.diagrams.drawn === 2 && /viz/.test(j.diagrams.from) && j.diagrams.languages.graphviz.drawn === 2 && j.diagrams.languages.mermaid.total === 0, `--json diagrams ${JSON.stringify(j.diagrams)}`);
    h.assert(/3 diagrams, 2 drawn ahead with Graphviz from /.test(r.err), `the summary: ${r.err}`);
    h.assert(/^n\.built\.html: note line 12: warning diagram\.error: Graphviz cannot draw this graph, so the page keeps the fence: .*syntax error/m.test(r.err), `the broken fence's warning: ${r.err}`);
    const html = j.html;
    h.assert(/<style id="luccet-graphviz-style">\n\.luccet \.t-graphviz \{/.test(html) && html.indexOf('luccet-graphviz-style') < html.indexOf('data-built') && !/luccet-mermaid-style/.test(html), 'the stylesheet before the luccet.js tag, and only its own');
    h.assert(/<div class="t-graphviz" id="flow" data-pos="4:1"><svg[^>]*class="t-graphviz-screen t-graphviz-light"[^>]*data-palette="[^"]*\|light"/.test(html), `the first wrapper with its id, its line and its light copy: ${(/<div class="t-graphviz"[^>]*>/.exec(html) || [])[0]}`);
    h.assert(/<figure id="lst" class="t-block code" data-t="code" data-pos="8:1"><div class="t-graphviz"><svg/.test(html), 'the listing wrapped inside its figure');
    const copies = [...html.matchAll(/<svg\b[^>]*class="(t-graphviz-[a-z -]+)"/g)].map((m) => m[1]);
    h.assert(JSON.stringify(copies) === JSON.stringify(['t-graphviz-screen t-graphviz-light', 't-graphviz-screen t-graphviz-dark', 't-graphviz-print', 't-graphviz-screen t-graphviz-light', 't-graphviz-screen t-graphviz-dark', 't-graphviz-print']), `a light, a dark and a print copy per graph: ${copies}`);
    h.assert(/<pre class="wide" data-t="code" data-pos="4:1" hidden><code class="language-dot">digraph/.test(html) && /<code class="language-graphviz">graph \{ x -- y \}/.test(html), 'the fences kept, hidden, in their own languages');
    const ids = [...html.matchAll(/<g id="(graph0[^"]*)"/g)].map((m) => m[1]);
    h.assert(new Set(ids).size === 6 && ids.every((i) => /^graph0-p\d+$/.test(i)), `unique ids per copy: ${ids}`);
  }),
);

h.test("tools/diagrams.js: a page with both of the kit's add-ons draws each language's fences, with each one's stylesheet, in one browser", () =>
  h.inTemp(async (dir) => {
    await chromium();
    const page = built(dir, 'both', `${FIRST}<script src="luccet.js" data-use="mermaid.js graphviz.js"></script>\n\n\`\`\`mermaid {#m}\nflowchart LR\n  A --> B\n\`\`\`\n\n\`\`\`dot {#g}\ndigraph { A -> B }\n\`\`\`\n`);
    const r = node([tool('diagrams.js'), page, '-o', page], dir);
    h.assert(r.code === 0 && /2 diagrams, 2 drawn ahead with Mermaid from .* and Graphviz from /.test(r.err), `the summary: ${r.err}`);
    const html = fs.readFileSync(path.join(dir, page), 'utf8');
    h.assert(/<style id="luccet-mermaid-style">/.test(html) && /<style id="luccet-graphviz-style">/.test(html), 'both stylesheets');
    h.assert(/<div class="t-mermaid" id="m"/.test(html) && /<div class="t-graphviz" id="g"/.test(html), 'both wrappers');
    const twice = node([tool('diagrams.js'), page], dir);
    h.assert(twice.code === 2 && /diagrams are drawn already/.test(twice.err), `drawn twice: ${twice.err}`);
  }),
);

h.runTests();
