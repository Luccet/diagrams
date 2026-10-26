// SPDX-License-Identifier: MIT
// graphviz.js, Luccet's Graphviz add-on, in the diagrams kit
// (github.com/Luccet/diagrams). It draws each ```dot or ```graphviz fence,
// titled ones (listings) too, as a graph with Graphviz, in the page theme's
// colours and sans-serif font.
//
//   <script src="luccet.js" data-use="graphviz.js"></script>
//
// Graphviz comes from jsDelivr as Viz.js, a WebAssembly build in one file,
// pinned with SRI (the table below), and only to a page that has a graph.
// `?base=URL` names a copy instead (the folder of viz-global.js), loaded
// without SRI; a window.Viz already on the page is used as it is.
// `?engine=neato` lays graphs out with another of Graphviz's engines (a
// graph's own `layout` wins), and window.LUCCET = {use: {graphviz: {graph:
// {…}, node: {…}, edge: {…}}}} sets default attributes over the add-on's.
//
// A graph is laid out once, the colours it does not give left as roles
// (ROLES, below), and each copy is coloured for its palette: the palette in
// effect where it stands, again when that changes (the reader's light or
// dark preference, or a theme switched in), and luccet.css's print palette
// for the copy shown in print. The colours a graph gives are its own, and
// text on a fill it gives takes whichever of the palette's text and
// background colours reads on it. Text is set in the theme's sans-serif
// font, laid out with Helvetica's widths, the nearest Graphviz knows. The
// fence stays, hidden, inside the graph's element; one that Graphviz cannot
// read stays as it is, with the error after it.
//
// A link in a graph (URL, href) is kept for http, https, mailto and a path,
// and dropped for any other scheme: Graphviz writes what it is given, and a
// javascript: link would run on a click.
//
// A built page whose graphs tools/diagrams.js drew has them already, a copy
// per palette the build saw (light, dark) and the print copy, each marked
// with its palette (data-palette). The add-on adopts them: it shows the copy
// for the palette in effect, and asks for Graphviz only when none fits (a
// theme switched in).
//
// Graphviz compiles WebAssembly, which a Content-Security-Policy allows
// with 'wasm-unsafe-eval' in script-src. Its SVG has no inline styles.
//
// Under node (luccet check, luccet build, the language server) it only adds
// its styles: drawing needs the page.
(function () {
  'use strict';
  const T = window.luccet;
  if (!T) return;
  if (T.api !== 2) throw new Error(`needs the add-on API 2 (Luccet 2); this luccet.js has ${T.api}`);

  // <viz> written by tools/graphviz.js; do not edit by hand
  const VIZ = {
    version: '3.31.0',
    graphviz: '16.1.0',
    sri: 'sha384-iX6VK6ib27dxYB4T470zbHOsDDoLewuYvrIgv2B3XXe8kgfKsGMf8QIleFy6VPi4',
  };
  // </viz>

  T.style(
    [
      '.luccet .t-graphviz { margin-block: 0 1rem; }',
      '.t-graphviz > svg { display: block; margin-inline: auto; max-inline-size: 100%; height: auto; }',
      '.t-graphviz > .t-graphviz-print, .t-graphviz > .t-graphviz-alt { display: none; }',
      '@media print { .t-graphviz > .t-graphviz-print { display: block; } .t-graphviz:has(> .t-graphviz-print) > .t-graphviz-screen { display: none; } }',
    ].join('\n'),
  );

  const DOM = typeof document === 'object' && document !== null && document.nodeType === 9;
  if (!DOM) return;

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const opts = Object.assign({}, T.config && T.config.use && T.config.use.graphviz);
  const own = typeof opts.base === 'string' && opts.base.trim() !== '';
  const base = own ? opts.base.trim().replace(/\/+$/, '') : `https://cdn.jsdelivr.net/npm/@viz-js/viz@${VIZ.version}/dist`;
  const engine = typeof opts.engine === 'string' && opts.engine.trim() ? opts.engine.trim() : undefined;
  const defaults = (k) => (opts[k] && typeof opts[k] === 'object' ? opts[k] : null);

  // luccet.css's print palette (src/css.js, @media print), the part a graph
  // uses: its own colours as they are, the system's (Canvas, CanvasText …)
  // as browsers print them.
  const PRINT = { bg: '#ffffff', fg: '#000000', muted: '#555555', line: '#d9dde3', soft: '#f3f4f1' };
  const KEYS = Object.keys(PRINT);

  // The colours a graph is laid out with where it gives none, one per role,
  // each a colour no graph writes: a copy takes the palette's for each, as a
  // stroke and as a fill. A node's fill falls back to its colour, and a
  // cluster's to the graph's, as Graphviz has it, so a filled node or
  // cluster with no colour of its own takes --t-soft.
  const ROLES = {
    '#0a0b0c': ['muted', 'soft'], // a node
    '#0a0b0d': ['muted', 'muted'], // an edge, its arrowheads filled
    '#0a0b0e': ['line', 'soft'], // a cluster, from the graph
    '#0a0b0f': ['fg', 'fg'], // text
  };
  const [NODE, EDGE, CLUSTER, TEXT] = Object.keys(ROLES);
  const FONT = 'Helvetica'; // which Graphviz writes as this family:
  const FONT_FAMILY = 'Helvetica,sans-Serif';

  // Viz.js, asked for at the first graph, and its instance, which draws
  // every graph. window.Viz can be an element with id="Viz", which the
  // browser names on window.
  const found = () => (window.Viz && typeof window.Viz.instance === 'function' ? window.Viz : null);
  let vizP = null;
  let failed = false;
  function viz() {
    if (vizP) return vizP;
    const loaded = found()
      ? Promise.resolve(found())
      : new Promise((resolve) => {
          const s = document.createElement('script');
          if (T.config && T.config.nonce) s.nonce = T.config.nonce;
          if (!own) (s.integrity = VIZ.sri), (s.crossOrigin = 'anonymous');
          s.async = true;
          s.src = `${base}/viz-global.js`;
          s.onload = () => resolve(found());
          s.onerror = () => resolve(null);
          document.head.append(s);
        });
    vizP = loaded.then((V) => {
      if (!V) return console.warn(`Luccet graphviz.js: Graphviz did not load from ${base}, so graphs stay as their source`), null;
      return V.instance().catch((e) => {
        console.warn(`Luccet graphviz.js: Graphviz did not start (${String((e && e.message) || e).split('\n')[0]}), so graphs stay as their source; under a Content-Security-Policy, script-src needs 'wasm-unsafe-eval'`);
        return null;
      });
    });
    // One that failed is asked for again at the next render (below): the
    // network may be back. Until then every fence stays as its source.
    vizP.then((v) => v || (failed = true));
    return vizP;
  }
  // 'render' fires after a root's behaviours have asked for their layouts
  // and before they ask for Viz.js (layout, below), so a reset here is one
  // retry per render.
  T.on('render', () => {
    if (failed) (failed = false), (vizP = null);
  });

  // A colour as #rrggbb: the canvas normalises any CSS colour, reading the
  // pixel back for those it does not write as hex (oklch(), color-mix() …).
  let pen = null;
  function hex(value) {
    pen = pen || document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    pen.fillStyle = '#000';
    pen.fillStyle = value || '#000';
    if (/^#[0-9a-f]{6}$/i.test(pen.fillStyle)) return pen.fillStyle.toLowerCase();
    pen.clearRect(0, 0, 1, 1);
    pen.fillRect(0, 0, 1, 1);
    const d = pen.getImageData(0, 0, 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  const luminance = (h) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  // The palette in effect at el, and its sans-serif font. A colour can be one
  // of the system's (Canvas, CanvasText …, luccet.css's defaults), which
  // means one thing in light and another in dark: each is resolved by a probe
  // that takes el's colour scheme, outside the note, and read back as the
  // browser computes it. The palette's key (keyOf) is what it is made of, the
  // properties as written and the scheme, not the colours they resolve to: a
  // copy made for the system's colours in one browser (tools/diagrams.js
  // draws in Chromium) fits another, whose system greys differ by a shade.
  function palette(el) {
    const cs = getComputedStyle(el);
    const p = { font: cs.getPropertyValue('--t-sans').trim() || 'sans-serif' };
    const written = [];
    const probe = document.createElement('span');
    probe.hidden = true;
    probe.style.colorScheme = cs.colorScheme || 'normal';
    document.documentElement.appendChild(probe);
    for (const k of KEYS) {
      const value = cs.getPropertyValue(`--t-${k}`).trim();
      written.push(value);
      probe.style.color = PRINT[k];
      probe.style.color = value;
      p[k] = hex(getComputedStyle(probe).color);
    }
    probe.remove();
    p.key = `${written.join()}${p.font}|${luminance(p.bg) < 0.18 ? 'dark' : 'light'}`;
    return p;
  }
  // The print palette is written as its colours, and light.
  const keyOf = (p) => p.key || `${KEYS.map((k) => p[k]).join()}${p.font}|light`;

  // One layout per source, the last ones kept, so a note rendered again (the
  // editor's preview) shows its unchanged graphs at once: {svg} as Graphviz
  // wrote it, its colours roles, or {error}.
  const KEEP = 64;
  const laid = new Map();
  function layout(src) {
    if (laid.has(src)) {
      const r = laid.get(src);
      laid.delete(src);
      return laid.set(src, r).get(src);
    }
    // A turn later, after the 'render' that may have reset a failed load.
    const r = Promise.resolve().then(viz).then((v) => {
      if (!v) return null;
      let res;
      try {
        res = v.render(src, {
          format: 'svg',
          engine,
          graphAttributes: Object.assign({ bgcolor: 'transparent', color: CLUSTER, fontcolor: TEXT, fontname: FONT }, defaults('graph')),
          nodeAttributes: Object.assign({ color: NODE, fontcolor: TEXT, fontname: FONT }, defaults('node')),
          edgeAttributes: Object.assign({ color: EDGE, fontcolor: TEXT, fontname: FONT }, defaults('edge')),
        });
      } catch (e) {
        return { error: String((e && e.message) || e).trim() };
      }
      const messages = (res.errors || []).map((e) => String(e.message).trim()).filter(Boolean);
      if (res.status !== 'success') return { error: messages.join('; ') || 'Graphviz gave no reason' };
      for (const m of messages) console.warn(`Luccet graphviz.js: ${m}`);
      return { svg: res.output };
    });
    laid.set(src, r);
    if (laid.size > KEEP) laid.delete(laid.keys().next().value);
    // No layout (Graphviz did not load): not kept, so the next render tries again.
    r.then((res) => res || (laid.get(src) === r && laid.delete(src)));
    return r;
  }

  // A copy coloured for p. Text on a fill the graph gives first, while the
  // roles still mark which fills are the graph's: the palette's text colour
  // or its background colour, whichever reads better on that fill.
  function colour(svg, p) {
    const role = (v) => has(ROLES, (v || '').toLowerCase());
    for (const g of svg.querySelectorAll('g.node, g.cluster')) {
      const shape = [...g.querySelectorAll('polygon, ellipse, path, polyline, rect')].find((s) => {
        const f = (s.getAttribute('fill') || '').trim().toLowerCase();
        return f && f !== 'none' && f !== 'transparent' && !f.startsWith('url(') && !role(f);
      });
      if (!shape) continue;
      const under = luminance(hex(shape.getAttribute('fill')));
      const ink = contrast(luminance(p.fg), under) >= contrast(luminance(p.bg), under) ? p.fg : p.bg;
      for (const t of g.querySelectorAll('text')) if ((t.getAttribute('fill') || '').toLowerCase() === TEXT) t.setAttribute('fill', ink);
    }
    for (const el of svg.querySelectorAll('[fill], [stroke]')) {
      for (const [name, i] of [['stroke', 0], ['fill', 1]]) {
        const v = (el.getAttribute(name) || '').toLowerCase();
        if (has(ROLES, v)) el.setAttribute(name, p[ROLES[v][i]]);
      }
    }
    for (const t of svg.querySelectorAll('text[font-family]')) if (t.getAttribute('font-family') === FONT_FAMILY) t.setAttribute('font-family', p.font);
  }

  // A link or image Graphviz wrote: http, https, mailto or a path; another
  // scheme (javascript:, data: …) is dropped. Browsers ignore spaces and
  // control characters in a scheme, so the test does too.
  function links(svg) {
    for (const el of svg.querySelectorAll('a, image')) {
      for (const name of ['xlink:href', 'href']) {
        const v = el.getAttribute(name);
        if (v === null) continue;
        const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v.replace(/[\u0000- ]/g, ''));
        if (scheme && !/^(?:https?|mailto)$/i.test(scheme[1])) el.removeAttribute(name);
      }
    }
  }

  // Graphviz's markup as an element. Its XML declaration and comments are
  // left out, and so is the title an unnamed graph gets (%0), which would
  // show as the graph's tooltip.
  function nodes(text) {
    const t = document.createElement('template');
    t.innerHTML = text;
    const svg = t.content.querySelector('svg');
    if (!svg) return null;
    const title = svg.querySelector(':scope > g > title');
    if (title && /^%\d*$/.test(title.textContent)) title.remove();
    return svg;
  }

  // Every id in a copy made unique to its placement: a layout placed twice
  // (two fences with one source, or a screen and a print copy) would repeat
  // Graphviz's ids (graph0, node1 …), and their references (url(#…), href)
  // would land on the first.
  let placed = 0;
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function uniqueIds(root) {
    const all = [root, ...root.querySelectorAll('[id]')].filter((e) => e.id);
    if (!all.length) return;
    const suffix = `-p${++placed}`;
    const map = new Map(all.map((e) => [e.id, e.id + suffix]));
    const re = new RegExp(`#(${[...map.keys()].map(escapeRe).join('|')})(?![\\w-])`, 'g');
    const fix = (s) => s.replace(re, (m, id) => `#${map.get(id)}`);
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.id && map.has(el.id)) el.id = map.get(el.id);
      for (const a of [...el.attributes]) {
        if (a.name === 'id' || !a.value.includes('#')) continue;
        const v = fix(a.value);
        if (v !== a.value) el.setAttribute(a.name, v);
      }
    }
  }

  function place(wrap, text, p, cls) {
    const el = nodes(text);
    if (!el) return;
    colour(el, p);
    links(el);
    el.classList.add(cls);
    el.setAttribute('data-palette', keyOf(p));
    uniqueIds(el);
    // A screen copy supersedes every copy of the build's, the kept ones too.
    const olds = [...wrap.querySelectorAll(`:scope > .${cls}${cls === 't-graphviz-screen' ? ', :scope > .t-graphviz-alt' : ''}`)];
    if (olds.length) olds.shift().replaceWith(el);
    else wrap.insertBefore(el, wrap.querySelector(':scope > pre'));
    for (const o of olds) o.remove();
  }

  // The fence's element, the graph's from now on, holding the fence; the
  // palette it was last coloured for. A later showing supersedes one still
  // waiting for Graphviz.
  const sources = new WeakMap();
  const drawnFor = new WeakMap();
  async function show(wrap) {
    const screen = palette(wrap);
    const key = keyOf(screen);
    drawnFor.set(wrap, key);
    const r = await layout(sources.get(wrap));
    if (!r || !wrap.isConnected || drawnFor.get(wrap) !== key) return;
    if (r.error) return fail(wrap, r.error);
    place(wrap, r.svg, screen, 't-graphviz-screen');
    wrap.querySelector(':scope > pre').hidden = true;
    // The print copy, in luccet.css's print palette, for every palette that
    // is not it: a light theme's colours are not print's black on white either.
    const print = Object.assign({}, PRINT, { font: screen.font });
    const old = wrap.querySelector(':scope > .t-graphviz-print');
    if (keyOf(print) === key) return void (old && old.remove());
    place(wrap, r.svg, print, 't-graphviz-print');
  }

  // Among the copies the build drew, the one for the palette in effect, if
  // any, made the screen copy, the others kept aside; false when none fits.
  function pick(wrap) {
    const key = keyOf(palette(wrap));
    const copies = [...wrap.querySelectorAll(':scope > svg.t-graphviz-screen, :scope > svg.t-graphviz-alt')];
    const hit = copies.find((c) => c.getAttribute('data-palette') === key);
    if (!hit) return false;
    for (const c of copies) {
      c.classList.toggle('t-graphviz-screen', c === hit);
      c.classList.toggle('t-graphviz-alt', c !== hit);
      c.classList.remove('t-graphviz-light', 't-graphviz-dark');
    }
    drawnFor.set(wrap, key);
    return true;
  }

  // A fence the build drew already: its wrapper is adopted as if drawn here.
  function adopt(wrap, code) {
    sources.set(wrap, code.textContent);
    // Later placements must not repeat the build's id suffixes.
    for (const el of wrap.querySelectorAll('[id]')) {
      const m = /-p(\d+)$/.exec(el.id);
      if (m) placed = Math.max(placed, Number(m[1]));
    }
    if (!pick(wrap)) show(wrap);
  }

  // A graph Graphviz cannot read: the fence back where it was, with the id
  // the wrapper had taken, so links to it still land, and the error after it.
  function fail(wrap, message) {
    const pre = wrap.querySelector(':scope > pre');
    const err = document.createElement('div');
    err.className = 't-error t-graphviz-error';
    err.textContent = `Graphviz cannot draw this graph: ${message}`;
    if (wrap.id) pre.id = wrap.id;
    wrap.replaceWith(pre, err);
    pre.hidden = false;
    console.warn(`Luccet graphviz.js: ${message}`);
  }

  // Colour again what a palette change leaves stale: the reader's light or
  // dark preference, or a theme a page script switches in and announces with
  // a luccet:theme event on window (github.com/Luccet/diagrams).
  const repaint = () => {
    for (const wrap of document.querySelectorAll('.t-graphviz')) if (sources.has(wrap) && keyOf(palette(wrap)) !== drawnFor.get(wrap) && !pick(wrap)) show(wrap);
  };
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaint);
  window.addEventListener('luccet:theme', repaint);

  // Fences are pre[data-t=code], listings figure[data-t=code] holding one
  // (inside the build's wrapper on a built page).
  const LANGUAGE = /(?:^|\s)language-(?:dot|graphviz)(?:\s|$)/i;
  T.define('code', (el) => {
    const pre = el.matches('pre') ? el : el.querySelector(':scope > pre, :scope > .t-graphviz > pre');
    const code = pre && pre.querySelector(':scope > code');
    if (!code || !LANGUAGE.test(code.className)) return;
    const built = pre.parentElement;
    if (built && built.classList.contains('t-graphviz') && built.querySelector(':scope > svg.t-graphviz-screen')) return adopt(built, code);
    const wrap = document.createElement('div');
    wrap.className = 't-graphviz';
    if (pre.id) (wrap.id = pre.id), pre.removeAttribute('id');
    if (pre.hasAttribute('data-pos')) wrap.setAttribute('data-pos', pre.getAttribute('data-pos'));
    sources.set(wrap, code.textContent);
    pre.replaceWith(wrap);
    wrap.append(pre);
    show(wrap);
  });
})();
