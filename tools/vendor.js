#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Writes local copies of the kit's libraries, at the versions the add-ons
// pin, in the layout their ?base= option takes: DIR/mermaid/ for mermaid.js
// (from the mermaid package) and DIR/viz/ for graphviz.js (from
// @viz-js/viz), each fetched once into node_modules/.cache/luccet-smoke/ and
// checked against the registry's hash. For a note read offline, or under a
// strict policy. Name one, mermaid or graphviz, for that one alone. (From
// the Luccet engine's `luccet vendor`, before 2.0.)
//
//   node tools/vendor.js DIR [mermaid|graphviz]
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIBS = {
  mermaid: { title: 'Mermaid', addon: 'mermaid.js', folder: 'mermaid', files: ['mermaid.min.js'], tool: './mermaid', shown: (v) => `Mermaid ${v}` },
  graphviz: { title: 'Graphviz', addon: 'graphviz.js', folder: 'viz', files: ['viz-global.js'], tool: './graphviz', shown: (v) => `Graphviz (Viz.js ${v})` },
};

async function main() {
  const [dir, only, ...rest] = process.argv.slice(2);
  if (!dir || rest.length || (only && !LIBS[only])) {
    console.error('usage: node tools/vendor.js DIR [mermaid|graphviz]');
    process.exit(2);
  }
  const st = fs.statSync(dir, { throwIfNoEntry: false });
  if (st && !st.isDirectory()) {
    console.error(`${dir} is not a folder`);
    process.exit(2);
  }
  for (const [name, lib] of Object.entries(LIBS)) {
    if (only && only !== name) continue;
    const m = /version: '([\d.]+)'/.exec(fs.readFileSync(path.join(ROOT, lib.addon), 'utf8'));
    if (!m) throw new Error(`${lib.addon} pins no version`);
    const version = m[1];
    let pkg;
    try {
      pkg = await require(lib.tool).packageDir(version);
    } catch (e) {
      console.error(`${lib.shown(version)} could not be fetched (${(e && e.message) || e}); is the network there?`);
      process.exit(1);
    }
    const to = path.join(dir, lib.folder);
    fs.mkdirSync(to, { recursive: true });
    for (const f of lib.files) fs.copyFileSync(path.join(pkg, 'dist', f), path.join(to, f));
    const shown = path.relative(process.cwd(), to).split(path.sep).join('/') || '.';
    console.error(`${lib.shown(version)} → ${shown} (${lib.files.length} file${lib.files.length === 1 ? '' : 's'}); load it with ${lib.addon}?base=${shown}`);
  }
}

main();
