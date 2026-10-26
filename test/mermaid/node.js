#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// mermaid.js under node: it runs under the command line with no diagnostic
// and leaves drawing to the browser; its Mermaid table is well formed and is
// the pinned version's; it prints in luccet.css's print palette;
// tools/vendor.js writes the copy ?base= takes; tools/diagrams.js draws a
// built page's diagrams ahead (in a headless Chromium, skipped when there is
// none). The browser's part is test/browser.js's.
//
//   LUCCET_ROOT=…/luccet node test/node.js
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const h = require('../harness');

const SRC = fs.readFileSync(path.join(h.ROOT, 'mermaid.js'), 'utf8');
const VERSION = /version: '([\d.]+)'/.exec(SRC)[1];
const node = (args, cwd = h.ROOT) => {
  const r = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', env: { ...process.env, NODE_PATH: path.join(h.ENGINE, 'node_modules') } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const offline = (r) => /could not be fetched|fetch failed|ENOTFOUND|EAI_AGAIN/.test(r.err + r.out);
const tool = (name) => path.join(h.ROOT, 'tools', name);

h.test("under luccet check and luccet build: no diagnostic, and the page holds no drawing, which is the browser's", async () => {
  const page = await h.checkAndBuild('mermaid.js', '# Hello\n\n```mermaid\nflowchart LR\n  A --> B\n```\n');
  h.assert(/<code class="language-mermaid">/.test(page) && !/t-mermaid|<svg/.test(page), 'the built fence is a fence');
});

h.test('the Mermaid table is well formed', () => {
  const block = /\/\/ <mermaid>[^\n]*\n([\s\S]*?)\n\s*\/\/ <\/mermaid>/.exec(SRC);
  h.assert(block, 'no <mermaid> table');
  const MERMAID = new Function(`${block[1]}; return MERMAID;`)();
  h.assert(/^\d+\.\d+\.\d+$/.test(MERMAID.version), `version ${MERMAID.version}`);
  h.assert(/^sha384-[A-Za-z0-9+/]{64}$/.test(MERMAID.sri), `hash ${MERMAID.sri}`);
  return `Mermaid ${MERMAID.version}`;
});

h.test("the table is the pinned version's (tools/mermaid.js --check)", () => {
  const r = node([tool('mermaid.js'), '--check']);
  if (r.code !== 0 && offline(r)) throw new h.Skip(`Mermaid ${VERSION} is not cached and could not be fetched`);
  h.assert(r.code === 0, `${r.out}${r.err}`);
});

h.test("its print palette is luccet.css's: its own colours as they are, the system's as browsers print them", () => {
  const PRINT = new Function(`return ${/const PRINT = (\{[\s\S]*?\});/.exec(SRC)[1]}`)();
  const long = (x) => (x.length === 4 ? '#' + [...x.slice(1)].map((c) => c + c).join('') : x);
  const want = require(path.join(h.ENGINE, 'test', 'lib', 'palette')).printPalette();
  const off = [];
  for (const k of new Set([...Object.keys(PRINT), ...Object.keys(want)])) {
    if (!/^#[0-9a-f]{6}$/.test(PRINT[k] || '')) off.push(`--t-${k}: ${PRINT[k]} is not #rrggbb`);
    else if (/^#/.test(want[k] || '') && PRINT[k] !== long(want[k])) off.push(`--t-${k}: ${PRINT[k]}, luccet.css prints ${want[k]}`);
  }
  if (PRINT.bg !== '#ffffff' || PRINT.fg !== '#000000') off.push(`Canvas and CanvasText print white and black, not ${PRINT.bg} and ${PRINT.fg}`);
  h.assert(!off.length, off.join('; '));
});

h.test('tools/vendor.js: Mermaid in the layout ?base= takes; usage errors', () =>
  h.inTemp((dir) => {
    const r = node([tool('vendor.js'), 'vend'], dir);
    if (r.code === 1 && offline(r)) throw new h.Skip(`Mermaid ${VERSION} is not cached and could not be fetched`);
    h.assert(r.code === 0, `vendor.js: ${r.err}`);
    const files = fs.readdirSync(path.join(dir, 'vend'), { recursive: true }).map(String);
    h.assert(files.some((f) => f.endsWith('mermaid.min.js')), `the copy: ${files.slice(0, 5)}`);
    h.assert(new RegExp(`^Mermaid ${VERSION.replace(/\./g, '\\.')} → \\S+ \\(\\d+ files?\\); load it with mermaid\\.js\\?base=\\S+$`, 'm').test(r.err), `the base line: ${r.err}`);
    h.assert(node([tool('vendor.js')], dir).code === 2, 'DIR missing');
  }),
);

// A note beside the real luccet.js and this add-on, since a browser runs
// them, built with the engine's command line.
function built(dir, name, note) {
  // The real luccet.js over inTemp's empty one: the page runs in Chromium.
  for (const [file, target] of [['luccet.js', h.LUCCET_JS], ['mermaid.js', path.join(h.ROOT, 'mermaid.js')]]) fs.copyFileSync(target, path.join(dir, file));
  fs.writeFileSync(path.join(dir, `${name}.html`), note);
  const r = h.cli(['build', `${name}.html`, '-o', `${name}.built.html`], { cwd: dir });
  h.assert(r.code === 0, `luccet build: ${r.err}`);
  return `${name}.built.html`;
}
const FIRST = '<!doctype html><meta charset="utf-8">';

h.test('tools/diagrams.js: a note refused, as it is no built page; without the add-on or a fence nothing is drawn', () =>
  h.inTemp((dir) => {
    fs.writeFileSync(path.join(dir, 'source.html'), `${FIRST}<script src="luccet.js"></script>\n# x\n`);
    let r = node([tool('diagrams.js'), 'source.html'], dir);
    h.assert(r.code === 2 && /is not a page luccet build wrote; build it first/.test(r.err), `a note: ${r.err}`);
    h.assert(node([tool('diagrams.js')], dir).code === 2 && node([tool('diagrams.js'), 'a', 'b'], dir).code === 2, 'one PAGE');
    const plain = built(dir, 'plain', `${FIRST}<script src="luccet.js"></script>\n\n\`\`\`mermaid\nflowchart LR\n  A --> B\n\`\`\`\n`);
    r = node([tool('diagrams.js'), plain], dir);
    h.assert(r.code === 0 && /the page does not load mermaid\.js, so its diagrams are not drawn/.test(r.err) && /1 diagram, 0 drawn ahead/.test(r.err) && !/luccet-mermaid-style/.test(r.out), `without the add-on: ${r.err}`);
    const none = built(dir, 'none', `${FIRST}<script src="luccet.js" data-use="mermaid.js"></script>\n\nNo diagram.\n`);
    r = node([tool('diagrams.js'), none], dir);
    h.assert(r.code === 0 && /^diagrams: no diagram$/m.test(r.err) && !/luccet-mermaid-style/.test(r.out), `without a fence: ${r.err}`);
  }),
);

h.test('tools/diagrams.js: fences drawn ahead with light, dark and print copies, the fence hidden; a broken one kept with diagram.error; --json; -o; a drawn page refused', () =>
  h.inTemp(async (dir) => {
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
    const page = built(dir, 'n', `${FIRST}<script src="luccet.js" data-use="mermaid.js"></script>\n\n# D\n\n\`\`\`mermaid {#flow .wide}\nflowchart LR\n  A --> B\n\`\`\`\n\n\`\`\`mermaid [A listing]{#lst}\npie\n  "a": 1\n\`\`\`\n\n\`\`\`mermaid\nnot a diagram ((\n\`\`\`\n`);
    const r = node([tool('diagrams.js'), page, '--json'], dir);
    h.assert(r.code === 0, `diagrams.js: ${r.err}`);
    const j = JSON.parse(r.out);
    h.assert(j.diagrams.total === 3 && j.diagrams.drawn === 2 && /mermaid/.test(j.diagrams.from), `--json diagrams ${JSON.stringify(j.diagrams)}`);
    h.assert(/3 diagrams, 2 drawn ahead with Mermaid from /.test(r.err), `the summary: ${r.err}`);
    h.assert(/^n\.built\.html: note line 14: warning diagram\.error: Mermaid cannot draw this diagram, so the page keeps the fence: /m.test(r.err), `the broken fence's warning: ${r.err}`);
    h.assert(JSON.stringify(j.diagnostics.map((d) => `${d.code} ${d.line}`)) === '["diagram.error 14"]', `--json diagnostics ${JSON.stringify(j.diagnostics)}`);
    const html = j.html;
    h.assert(/<style id="luccet-mermaid-style">\n\.t-mermaid \{/.test(html) && html.indexOf('luccet-mermaid-style') < html.indexOf('data-built'), 'the stylesheet before the luccet.js tag');
    h.assert(/<div class="t-mermaid" id="flow" data-pos="4:1"><svg[^>]*class="t-mermaid-screen t-mermaid-light"[^>]*data-palette="[^"]*\|light"/.test(html), `the first wrapper with its id, its line and its light copy: ${(/<div class="t-mermaid"[^>]*>/.exec(html) || [])[0]}`);
    h.assert(/<figure id="lst" class="t-block code" data-t="code" data-pos="9:1"><div class="t-mermaid"><svg/.test(html), 'the listing wrapped inside its figure');
    const copies = [...html.matchAll(/<svg\b[^>]*class="(t-mermaid-[a-z -]+)"/g)].map((m) => m[1]);
    h.assert(JSON.stringify(copies) === JSON.stringify(['t-mermaid-screen t-mermaid-light', 't-mermaid-screen t-mermaid-dark', 't-mermaid-print', 't-mermaid-screen t-mermaid-light', 't-mermaid-screen t-mermaid-dark', 't-mermaid-print']), `a light, a dark and a print copy per diagram: ${copies}`);
    h.assert(/<pre class="wide" data-t="code" data-pos="4:1" hidden><code class="language-mermaid">flowchart LR/.test(html), 'the fence kept, hidden, without its id');
    h.assert(/<pre data-t="code" data-pos="14:1"><code class="language-mermaid">not a diagram \(\(/.test(html) && !/t-mermaid-error/.test(html), 'the broken fence kept as a fence, no error in the page');
    const ids = [...html.matchAll(/<svg id="([^"]+)"/g)].map((m) => m[1]);
    h.assert(new Set(ids).size === 6 && ids.every((i) => /^t-mermaid-\d+-p\d+$/.test(i)), `unique ids per copy: ${ids}`);
    const keys = [...html.matchAll(/data-palette="([^"]*)"/g)].map((m) => m[1]);
    h.assert(keys[0] !== keys[1] && keys[1] !== keys[2] && keys[0] === keys[3] && keys[2] === keys[5], 'palette keys: light, dark and print differ; the same per scheme across diagrams');
    const o = node([tool('diagrams.js'), page, '-o', page], dir);
    h.assert(o.code === 0 && o.out === '' && /wrote n\.built\.html$/m.test(o.err) && /luccet-mermaid-style/.test(fs.readFileSync(path.join(dir, page), 'utf8')), `-o the page itself: ${o.err}`);
    const twice = node([tool('diagrams.js'), page], dir);
    h.assert(twice.code === 2 && /diagrams are drawn already; build the page again/.test(twice.err), `drawn twice: ${twice.err}`);
  }),
);

h.runTests();
