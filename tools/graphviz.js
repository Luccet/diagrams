#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Writes the Viz.js table in graphviz.js: the pinned version of the npm
// package @viz-js/viz, the Graphviz it builds, and the SRI hash of its
// dist/viz-global.js. Run it to move to another version; it needs the
// network once per version.
//
// The package comes from the npm registry, through tools/npm.js, which
// keeps those files in node_modules/.cache/luccet-smoke/ (the browser tests
// serve the same copy). jsDelivr's /npm/ files are the package's bytes, so
// the hash holds.
//
//   node tools/graphviz.js [VERSION]   rewrite the table (default: the version in it)
//   node tools/graphviz.js --check     exit 1 if the table is not what the version gives
'use strict';

const fs = require('fs');
const path = require('path');
const npm = require('./npm');

const ROOT = path.join(__dirname, '..');
const ADDON = path.join(ROOT, 'graphviz.js');
const START = '  // <viz> written by tools/graphviz.js; do not edit by hand';
const END = '  // </viz>';

// node_modules/.cache/luccet-smoke/viz-VERSION/: dist/viz-global.js, lib/metadata.js.
const packageDir = (version) => npm.packageDir('@viz-js/viz', version, { folder: `viz-${version}`, keep: ['dist/viz-global.js', 'lib/metadata.js'], has: 'dist/viz-global.js' });

async function table(version) {
  const dir = await packageDir(version);
  const meta = fs.readFileSync(path.join(dir, 'lib', 'metadata.js'), 'utf8');
  const graphviz = (/graphvizVersion\s*=\s*"([^"]+)"/.exec(meta) || [])[1];
  if (!graphviz) throw new Error(`@viz-js/viz@${version} names no Graphviz version in lib/metadata.js`);
  return [START, '  const VIZ = {', `    version: '${version}',`, `    graphviz: '${graphviz}',`, `    sri: '${npm.sri(path.join(dir, 'dist', 'viz-global.js'))}',`, '  };', END].join('\n');
}

async function main() {
  const src = fs.readFileSync(ADDON, 'utf8');
  const a = src.indexOf(START);
  const b = src.indexOf(END);
  if (a < 0 || b < a) throw new Error(`graphviz.js has no table between "${START.trim()}" and "${END.trim()}"`);
  const current = /version: '([^']+)'/.exec(src.slice(a, b));
  const arg = process.argv.slice(2).find((x) => !x.startsWith('--'));
  const version = arg || (current && current[1]);
  if (!version) throw new Error('no version: give one, as node tools/graphviz.js 3.31.0');
  const out = src.slice(0, a) + (await table(version)) + src.slice(b + END.length);
  if (process.argv.includes('--check')) {
    if (out !== src) {
      console.log(`✗ the Viz.js table in graphviz.js is not @viz-js/viz@${version}'s: run node tools/graphviz.js`);
      process.exit(1);
    }
    console.log(`✓ graphviz.js has @viz-js/viz@${version}'s table`);
    return;
  }
  fs.writeFileSync(ADDON, out);
  console.log(`wrote @viz-js/viz@${version}'s table into graphviz.js`);
}

module.exports = { packageDir };

if (require.main === module)
  main().catch((e) => {
    console.error(`tools/graphviz.js: ${e.message}`);
    process.exit(1);
  });
