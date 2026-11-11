#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// The examples under node: every note in examples/ passes luccet check with
// nothing to report. The browser's part is test/examples/browser.js's.
//
//   LUCCET_ROOT=…/luccet node test/examples/node.js
'use strict';

const fs = require('fs');
const path = require('path');
const h = require('../harness');

h.test('examples/: every example passes luccet check with nothing to report', () => {
  const files = fs.readdirSync(path.join(h.ROOT, 'examples')).filter((f) => f.endsWith('.html'));
  h.assert(files.length > 0, 'examples/ holds no note');
  const r = h.cli(['check', 'examples'], { cwd: h.ROOT });
  const want = `luccet check: ${files.length} note${files.length === 1 ? '' : 's'}: 0 errors, 0 warnings, 0 infos`;
  h.assert(r.code === 0 && (r.out + r.err).trim() === want, `expected "${want}": ${r.out}${r.err}`);
});

h.runTests();
