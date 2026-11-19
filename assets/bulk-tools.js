/* QuickCart admin — Bulk Import · Edit · Export workspace (the "Bulk Import" page).
   Import: CSV, TSV, TXT, Excel (.xlsx .xls .xlsm .xlsb .ods), JSON, JSON Lines, XML, HTML tables, Markdown tables, pasted rows.
   Edit:   change any product in a spreadsheet-style grid, with bulk price / stock / category tools, then save only what changed.
   Export: CSV, Excel, JSON, JSON Lines, TSV, XML, HTML, Markdown — choose the products and the columns.
   Everything is written to the logged-in owner's own store through scTarget(). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var H = { 'Content-Type': 'application/json' };
  var money = function (n) { return '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG'); };
  var num = function (v) { var n = parseFloat(String(v == null ? '' : v).replace(/[₦,\s]/g, '')); return isFinite(n) ? n : 0; };
  var say = function (m) { if (window.toast) window.toast(m); };

  /* columns shown in the grid: [field, label, width, numeric?] */
  var COLS = [['name', 'Name', 210], ['brand', 'Brand', 110], ['category', 'Category', 120], ['price', 'Price', 92, 1], ['cost', 'Cost', 92, 1], ['quantity', 'Qty', 70, 1],
    ['sku', 'SKU', 104], ['barcode', 'Barcode', 130], ['unit', 'Unit', 74], ['reorderPoint', 'Reorder at', 84, 1], ['vat', 'VAT %', 66, 1]];
  var EXTRA = ['originalPrice', 'description', 'image', 'supplier', 'tag', 'expiry', 'storeUrl'];
  var ALL = COLS.map(function (c) { return c[0]; }).concat(EXTRA);
  var NUMERIC = { price: 1, cost: 1, quantity: 1, reorderPoint: 1, vat: 1, originalPrice: 1 };
  var LABEL = { name: 'Product name', brand: 'Brand', category: 'Category', price: 'Selling price', originalPrice: 'Compare-at price', cost: 'Cost price', quantity: 'Quantity', sku: 'SKU', barcode: 'Barcode', description: 'Description', unit: 'Unit', reorderPoint: 'Reorder point', vat: 'VAT %', image: 'Image URL', supplier: 'Supplier', expiry: 'Expiry', tag: 'Tag', storeUrl: 'Link' };
  var FORMATS = [['csv', 'CSV', '.csv'], ['xlsx', 'Excel', '.xlsx'], ['json', 'JSON', '.json'], ['jsonl', 'JSON Lines', '.jsonl'], ['tsv', 'TSV', '.tsv'], ['xml', 'XML', '.xml'], ['html', 'HTML table', '.html'], ['md', 'Markdown', '.md']];

  var S = { tab: 'import', file: '', a: null, map: null, builtIssues: [] };
  var G = {};   // grids: G.imp, G.ed

  /* ───────────── helpers ───────────── */
  function target() { return typeof window.scTarget === 'function' ? window.scTarget() : null; }
  async function fetchProducts(t) { var r = await fetch(t.products + '.json'); if (!r.ok) throw new Error('Could not read your products (' + r.status + ')'); var d = await r.json(); return d && typeof d === 'object' ? d : {}; }
  function lazy(src, test) { return new Promise(function (res, rej) { if (test()) return res(); var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Could not load the spreadsheet library — check your internet')); }; document.head.appendChild(s); }); }
  var loadXLSX = function () { return lazy('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', function () { return window.XLSX; }); };
  function download(name, content, type) { var b = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2500); }
  var stamp = function () { return new Date().toISOString().slice(0, 10); };

  /* ───────────── serialisers (export + templates) ───────────── */
  function cell(v) { return v == null ? '' : String(v); }
  function toDelim(rows, cols, d) { var q = function (v) { v = cell(v); return v.indexOf(d) > -1 || /["\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }; return [cols.join(d)].concat(rows.map(function (r) { return cols.map(function (c) { return q(r[c]); }).join(d); })).join('\r\n'); }
  function pick(r, cols) { var o = {}; cols.forEach(function (c) { var v = r[c]; o[c] = NUMERIC[c] ? (v === '' || v == null ? 0 : Number(v) || 0) : cell(v); }); return o; }
  function xmlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function serialise(fmt, rows, cols) {
    var data = rows.map(function (r) { return pick(r, cols); });
    if (fmt === 'csv') return '\uFEFF' + toDelim(data, cols, ',');
    if (fmt === 'tsv') return '\uFEFF' + toDelim(data, cols, '\t');
    if (fmt === 'json') return JSON.stringify(data, null, 2);
    if (fmt === 'jsonl') return data.map(function (o) { return JSON.stringify(o); }).join('\n');
    if (fmt === 'xml') return '<?xml version="1.0" encoding="UTF-8"?>\n<products>\n' + data.map(function (o) { return '  <product>\n' + cols.map(function (c) { return '    <' + c + '>' + xmlEsc(o[c]) + '</' + c + '>'; }).join('\n') + '\n  </product>'; }).join('\n') + '\n</products>\n';
    if (fmt === 'html') return '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Products</title><style>body{font-family:system-ui,sans-serif}table{border-collapse:collapse}td,th{border:1px solid #ccd;padding:6px 10px;font-size:13px}th{background:#f0f3fa;text-align:left}</style></head><body>\n<table>\n<thead><tr>' + cols.map(function (c) { return '<th>' + xmlEsc(LABEL[c] || c) + '</th>'; }).join('') + '</tr></thead>\n<tbody>\n' + data.map(function (o) { return '<tr>' + cols.map(function (c) { return '<td>' + xmlEsc(o[c]) + '</td>'; }).join('') + '</tr>'; }).join('\n') + '\n</tbody></table></body></html>\n';
    if (fmt === 'md') { var m = function (v) { return cell(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); }; return '| ' + cols.map(function (c) { return LABEL[c] || c; }).join(' | ') + ' |\n|' + cols.map(function () { return '---'; }).join('|') + '|\n' + data.map(function (o) { return '| ' + cols.map(function (c) { return m(o[c]); }).join(' | ') + ' |'; }).join('\n') + '\n'; }
    throw new Error('Unknown format');
  }
  var MIME = { csv: 'text/csv;charset=utf-8', tsv: 'text/tab-separated-values;charset=utf-8', json: 'application/json', jsonl: 'application/x-ndjson', xml: 'application/xml', html: 'text/html;charset=utf-8', md: 'text/markdown;charset=utf-8' };
  async function saveAs(fmt, rows, cols, base) {
    var ext = (FORMATS.filter(function (f) { return f[0] === fmt; })[0] || [])[2] || '.' + fmt;
    if (fmt === 'xlsx') {
      await loadXLSX(); var data = rows.map(function (r) { return pick(r, cols); });
      var ws = XLSX.utils.json_to_sheet(data, { header: cols }); ws['!cols'] = cols.map(function (c) { return { wch: c === 'name' || c === 'description' ? 34 : 15 }; });
      var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Products');
      var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      download(base + ext, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    } else download(base + ext, serialise(fmt, rows, cols), MIME[fmt]);
  }

  /* ───────────── editable grid ───────────── */
  function makeGrid(hostId, mode) {
    var g = { host: hostId, mode: mode, rows: [], page: 1, per: 40, q: '', cat: '', map: {} };
    g.set = function (rows) { g.rows = rows; g.map = {}; rows.forEach(function (r) { g.map[r.id] = r; }); g.page = 1; g.q = ''; g.cat = ''; };
    g.vis = function () { var q = g.q.toLowerCase(); return g.rows.filter(function (r) { return !r.del && (!q || [r.d.name, r.d.sku, r.d.barcode, r.d.brand, r.d.category].join(' ').toLowerCase().indexOf(q) > -1) && (!g.cat || String(r.d.category || '') === g.cat); }); };
    g.cats = function () { var c = {}; g.rows.forEach(function (r) { if (!r.del && r.d.category) c[r.d.category] = 1; }); return Object.keys(c).sort(); };
    g.selected = function () { return g.rows.filter(function (r) { return r.sel && !r.del; }); };
    g.dirty = function () { return g.rows.filter(function (r) { return r.dirty || r.del; }).length; };
    g.render = function () {
      var host = $(hostId); if (!host) return;
      var vis = g.vis(), pages = Math.max(1, Math.ceil(vis.length / g.per)); if (g.page > pages) g.page = pages;
      var slice = vis.slice((g.page - 1) * g.per, g.page * g.per), allSel = vis.length && vis.every(function (r) { return r.sel; });
      var cats = g.cats();
      host.innerHTML = '<div class="bt-bar"><input class="bt-q" placeholder="🔍 Search name, SKU, barcode, brand…" value="' + esc(g.q) + '"><select class="bt-cat"><option value="">All categories</option>' + cats.map(function (c) { return '<option' + (c === g.cat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>'
        + '<span class="bt-count">' + vis.length + ' product' + (vis.length === 1 ? '' : 's') + ' · <b>' + g.selected().length + '</b> selected' + (mode === 'ed' ? ' · <b class="bt-dc">' + g.dirty() + '</b> changed' : '') + '</span></div>'
        + '<div class="bt-tw"><table class="bt-t"><thead><tr><th class="bt-ck"><input type="checkbox" class="bt-all"' + (allSel ? ' checked' : '') + ' title="Select all ' + vis.length + ' shown"></th>'
        + COLS.map(function (c) { return '<th style="min-width:' + c[2] + 'px">' + c[1] + '</th>'; }).join('') + (mode === 'imp' ? '<th></th>' : '') + '</tr></thead><tbody>'
        + (slice.length ? slice.map(function (r) {
          return '<tr data-id="' + esc(r.id) + '" class="' + (r.dirty ? 'bt-dirty' : '') + (r.isNew ? ' bt-new' : '') + '"><td class="bt-ck"><input type="checkbox" class="bt-sel"' + (r.sel ? ' checked' : '') + '></td>'
            + COLS.map(function (c) { return '<td><input class="bt-c' + (c[3] ? ' n' : '') + '" data-f="' + c[0] + '"' + (c[0] === 'category' ? ' list="bt-cats"' : '') + (c[3] ? ' inputmode="decimal"' : '') + ' value="' + esc(r.d[c[0]] == null ? '' : r.d[c[0]]) + '"></td>'; }).join('')
            + (mode === 'imp' ? '<td><button class="bt-x" title="Remove this row">✕</button></td>' : '') + '</tr>';
        }).join('') : '<tr><td colspan="' + (COLS.length + 2) + '" class="bt-empty">' + (g.rows.length ? 'No products match.' : 'Nothing here yet.') + '</td></tr>')
        + '</tbody></table></div><datalist id="bt-cats">' + cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>'
        + '<div class="bt-pg"><button class="bt-b" data-pg="-1"' + (g.page <= 1 ? ' disabled' : '') + '>← Prev</button><span>Page ' + g.page + ' of ' + pages + '</span><button class="bt-b" data-pg="1"' + (g.page >= pages ? ' disabled' : '') + '>Next →</button></div>';
      if (g.after) g.after();
    };
    g.touch = function (r) {
      if (mode === 'ed' && !r.isNew) { r.dirty = ALL.some(function (f) { return cell(r.d[f]) !== cell(r.o[f]); }); }
    };
    function counts() { var host = $(hostId); if (!host) return; var d = host.querySelector('.bt-dc'); if (d) d.textContent = g.dirty(); var c = host.querySelector('.bt-count b'); if (c) c.textContent = g.selected().length; if (g.after) g.after(); }
    var bound = false;
    g.bind = function () {
      var host = $(hostId); if (!host || bound) return; bound = true;
      host.addEventListener('input', function (e) {
        var el = e.target;
        if (el.classList.contains('bt-c')) { var tr = el.closest('tr'), r = g.map[tr.getAttribute('data-id')]; if (!r) return; r.d[el.getAttribute('data-f')] = el.value; g.touch(r); tr.classList.toggle('bt-dirty', !!r.dirty); counts(); }
        else if (el.classList.contains('bt-q')) { g.q = el.value; g.page = 1; var pos = el.selectionStart; g.render(); var n = host.querySelector('.bt-q'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { } }
      });
      host.addEventListener('change', function (e) {
        var el = e.target;
        if (el.classList.contains('bt-sel')) { var r = g.map[el.closest('tr').getAttribute('data-id')]; if (r) r.sel = el.checked; counts(); }
        else if (el.classList.contains('bt-all')) { g.vis().forEach(function (r) { r.sel = el.checked; }); g.render(); }
        else if (el.classList.contains('bt-cat')) { g.cat = el.value; g.page = 1; g.render(); }
      });
      host.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.hasAttribute('data-pg')) { g.page += Number(b.getAttribute('data-pg')); g.render(); }
        else if (b.classList.contains('bt-x')) { var r = g.map[b.closest('tr').getAttribute('data-id')]; if (r) { r.del = true; g.render(); } }
      });
    };
    return g;
  }

  /* bulk tools shared by the import review and the edit grid */
  var ACTIONS = [
    ['price_pct', 'Change price by %', '% e.g. 10 or -5'], ['price_set', 'Set price to', '₦ amount'], ['price_round', 'Round prices to nearest', '₦ e.g. 50'],
    ['cost_pct', 'Change cost by %', '% e.g. 10 or -5'],
    ['qty_add', 'Add to stock', 'units (use - to subtract)'], ['qty_set', 'Set stock to', 'units'],
    ['set_category', 'Set category', 'Category name'], ['set_brand', 'Set brand', 'Brand name'], ['set_unit', 'Set unit', 'e.g. piece, pack, kg'],
    ['title_case', 'Tidy names (Title Case)', ''], ['trim', 'Trim extra spaces in names', '']];
  function bulkBar(id) {
    return '<div class="bt-bulk" id="' + id + '"><b>Bulk edit selected rows</b><select class="bt-act">' + ACTIONS.map(function (a) { return '<option value="' + a[0] + '" data-ph="' + esc(a[2]) + '">' + a[1] + '</option>'; }).join('') + '</select><input class="bt-val" placeholder="' + esc(ACTIONS[0][2]) + '"><button class="bt-b ora" data-do="apply">Apply</button><button class="bt-b" data-do="del">🗑 Remove selected</button></div>';
  }
  function applyAction(grid, act, val) {
    var rows = grid.selected(); if (!rows.length) { say('Tick the rows you want to change first'); return false; }
    var n = num(val), needs = ACTIONS.filter(function (a) { return a[0] === act; })[0][2];
    if (needs && String(val).trim() === '') { say('Type a value first'); return false; }
    if (act === 'price_round' && n <= 0) { say('Enter a rounding step like 50 or 100'); return false; }
    rows.forEach(function (r) {
      var d = r.d;
      if (act === 'price_pct') d.price = Math.max(0, Math.round(num(d.price) * (1 + n / 100) * 100) / 100);
      else if (act === 'cost_pct') d.cost = Math.max(0, Math.round(num(d.cost) * (1 + n / 100) * 100) / 100);
      else if (act === 'price_set') d.price = Math.max(0, n);
      else if (act === 'price_round') d.price = Math.round(num(d.price) / n) * n;
      else if (act === 'qty_add') d.quantity = Math.max(0, Math.round(num(d.quantity) + n));
      else if (act === 'qty_set') d.quantity = Math.max(0, Math.round(n));
      else if (act === 'set_category') d.category = String(val).trim();
      else if (act === 'set_brand') d.brand = String(val).trim();
      else if (act === 'set_unit') d.unit = String(val).trim();
      else if (act === 'title_case') d.name = String(d.name || '').toLowerCase().replace(/(^|[\s\-\/(])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
      else if (act === 'trim') d.name = String(d.name || '').replace(/\s+/g, ' ').trim();
      grid.touch(r);
    });
    grid.render(); say('✅ Updated ' + rows.length + ' product' + (rows.length === 1 ? '' : 's')); return true;
  }
  function bindBulk(id, grid) {
    var box = $(id); if (!box || box._bound) return; box._bound = true;
    box.querySelector('.bt-act').onchange = function () { var o = this.options[this.selectedIndex]; var v = box.querySelector('.bt-val'); v.placeholder = o.getAttribute('data-ph') || ''; v.style.display = o.getAttribute('data-ph') ? '' : 'none'; };
    box.querySelector('.bt-act').onchange();
    box.addEventListener('click', async function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.getAttribute('data-do') === 'apply') { applyAction(grid, box.querySelector('.bt-act').value, box.querySelector('.bt-val').value); }
      if (b.getAttribute('data-do') === 'del') {
        var rows = grid.selected(); if (!rows.length) { say('Tick the rows first'); return; }
        var msg = grid.mode === 'ed' ? 'Delete ' + rows.length + ' product' + (rows.length === 1 ? '' : 's') + '? They are removed from your store when you press Save changes.' : 'Remove ' + rows.length + ' row' + (rows.length === 1 ? '' : 's') + ' from this import?';
        if (window.QC && QC.confirm && !(await QC.confirm(msg, { title: 'Remove', ok: 'Remove', danger: true }))) return;
        rows.forEach(function (r) { r.del = true; r.sel = false; }); grid.render();
      }
    });
  }

  /* ───────────── IMPORT ───────────── */
  var ACCEPT = '.csv,.tsv,.txt,.json,.jsonl,.ndjson,.xml,.html,.htm,.md,.markdown,.xlsx,.xls,.xlsm,.xlsb,.ods';
  function impStart() {
    $('bt-imp').innerHTML = '<div class="bt-drop" id="bt-drop"><div class="bt-big">📄</div><b>Drop your file here or click to choose</b><small>CSV · Excel (.xlsx .xls .ods) · JSON · JSON Lines · XML · HTML table · Markdown table · TSV · text</small></div>'
      + '<input type="file" id="bt-file" accept="' + ACCEPT + '" style="display:none">'
      + '<div class="bt-or">OR PASTE</div><textarea id="bt-paste" rows="5" placeholder="Paste rows copied from Excel / Google Sheets, CSV text, JSON, XML…"></textarea>'
      + '<div class="bt-row"><button class="bt-b ora" id="bt-go">Detect &amp; review →</button><span class="bt-sp"></span><span class="bt-lbl">Need a starting point?</span><select id="bt-tf">' + FORMATS.map(function (f) { return '<option value="' + f[0] + '">' + f[1] + '</option>'; }).join('') + '</select><button class="bt-b" id="bt-tpl">⬇ Download template</button></div>';
    var d = $('bt-drop'), f = $('bt-file');
    d.onclick = function () { f.click(); }; f.onchange = function () { if (f.files[0]) impFile(f.files[0]); f.value = ''; };
    ['dragover', 'dragenter'].forEach(function (ev) { d.addEventListener(ev, function (e) { e.preventDefault(); d.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { d.addEventListener(ev, function (e) { e.preventDefault(); d.classList.remove('over'); }); });
    d.addEventListener('drop', function (e) { var fl = e.dataTransfer.files[0]; if (fl) impFile(fl); });
    $('bt-go').onclick = function () { var t = $('bt-paste').value; if (!t.trim()) { say('Paste something first'); return; } S.file = 'pasted data'; impAnalyse({ text: t }); };
    $('bt-tpl').onclick = function () {
      var rows = [{ name: 'Golden Penny Spaghetti 500g', brand: 'Golden Penny', category: 'Groceries', price: 1250, cost: 980, quantity: 48, sku: 'GP-SP-500', barcode: '6001234567890', unit: 'pack', reorderPoint: 10, vat: 0 }, { name: 'Peak Milk Tin 400g', brand: 'Peak', category: 'Dairy', price: 3400, cost: 2900, quantity: 12, sku: 'PK-400', barcode: '6009876543210', unit: 'piece', reorderPoint: 5, vat: 7.5 }];
      saveAs($('bt-tf').value, rows, COLS.map(function (c) { return c[0]; }), 'quickcart-products-template').catch(function (e) { say('❌ ' + e.message); });
    };
  }
  async function impFile(f) {
    S.file = f.name; var ext = (f.name.split('.').pop() || '').toLowerCase();
    try {
      if (/^(xlsx|xls|xlsm|xlsb|ods)$/.test(ext)) {
        say('Reading spreadsheet…'); await loadXLSX();
        var wb = XLSX.read(await f.arrayBuffer(), { type: 'array' }), best = null, bn = -1, bname = '';
        wb.SheetNames.forEach(function (n) { var rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); var c = rows.filter(function (r) { return r.some(function (x) { return String(x).trim(); }); }).length; if (c > bn) { bn = c; best = rows; bname = n; } });
        S.file = f.name + (wb.SheetNames.length > 1 ? ' (sheet “' + bname + '”)' : '');
        impAnalyse({ rows: (best || []).map(function (r) { return r.map(function (x) { return String(x == null ? '' : x); }); }), format: 'Excel (' + ext.toUpperCase() + ')' });
      } else impAnalyse({ text: await f.text() });
    } catch (e) { say('❌ Could not read file: ' + e.message); }
  }
  function impAnalyse(input) {
    var a = QCImport.analyse(input); if (a.error) { say('⚠️ ' + a.error); return; }
    S.a = a; S.map = Object.assign({}, a.map); impReview();
  }
  function impBuild() {
    var built = QCImport.build(S.a, S.map, { defaultCategory: ($('bt-defcat') || {}).value || '' });
    S.builtIssues = built.issues;
    G.imp.set(built.products.map(function (p, i) { var d = {}; ALL.forEach(function (f) { d[f] = p[f] == null ? '' : p[f]; }); return { id: 'i' + i, d: d, sel: false, isNew: true }; }));
  }
  function impReview() {
    var a = S.a, opts = function (sel) { return '<option value="">— not in file —</option>' + a.headers.map(function (h, i) { return '<option value="' + i + '"' + (sel === i ? ' selected' : '') + '>' + esc(h || 'Column ' + (i + 1)) + '</option>'; }).join(''); };
    $('bt-imp').innerHTML = '<div class="bt-sum"><span class="bt-badge">' + esc(a.format) + '</span> <b>' + esc(S.file) + '</b> · ' + a.total + ' rows · ' + (a.hasHeader ? 'header row found' : 'no header — columns guessed') + ' <button class="bt-b" id="bt-back" style="margin-left:auto">← Choose another file</button></div>'
      + (a.warn ? '<div class="bt-warn">⚠️ ' + esc(a.warn) + '</div>' : '')
      + '<details class="bt-map"' + (a.warn ? ' open' : '') + '><summary>Column mapping <span>green = detected automatically · change if something is wrong</span></summary><div class="bt-mg">'
      + QCImport.FIELDS.map(function (f) { var sel = S.map[f] != null ? S.map[f] : null; return '<div class="' + (sel != null ? 'auto' : '') + '"><label>' + (QCImport.LABELS[f] || f) + (f === 'name' ? ' *' : '') + '</label><select data-map="' + f + '">' + opts(sel) + '</select></div>'; }).join('') + '</div><p class="bt-note">Changing a mapping rebuilds the table below (your cell edits are reset).</p></details>'
      + '<div id="bt-iss"></div>'
      + bulkBar('bt-ibulk') + '<div id="bt-igrid"></div>'
      + '<div class="bt-opts"><div><label>If a product already exists</label><select id="bt-dup"><option value="update">Update it (match barcode → SKU → name)</option><option value="skip">Skip it</option><option value="new">Create a duplicate anyway</option></select></div>'
      + '<div><label>Stock quantity</label><select id="bt-qm"><option value="set">Set stock to the quantity in the table</option><option value="add">Add table quantity to current stock</option><option value="keep">Keep current stock (don’t touch)</option></select></div>'
      + '<div><label>Default category (when empty)</label><input id="bt-defcat" placeholder="e.g. General"></div></div>'
      + '<div id="bt-prog" style="display:none"><div class="bt-pb"><i id="bt-pbar"></i></div><div id="bt-ptxt" class="bt-note"></div></div>'
      + '<div class="bt-row"><button class="bt-b ora lg" id="bt-run">Import products</button><span class="bt-note" id="bt-inote"></span></div>';
    G.imp = makeGrid('bt-igrid', 'imp'); G.imp.after = function () { var n = G.imp.rows.filter(function (r) { return !r.del; }).length, b = $('bt-run'); if (b) { b.textContent = 'Import ' + n + ' product' + (n === 1 ? '' : 's'); b.disabled = !n; } };
    impBuild(); G.imp.bind(); G.imp.render(); bindBulk('bt-ibulk', G.imp); impIssues();
    $('bt-back').onclick = impStart;
    $('bt-imp').querySelectorAll('[data-map]').forEach(function (sel) { sel.onchange = function () { var f = sel.getAttribute('data-map'); if (sel.value === '') delete S.map[f]; else { var n = Number(sel.value); Object.keys(S.map).forEach(function (k) { if (S.map[k] === n && k !== f) delete S.map[k]; }); S.map[f] = n; } impBuild(); G.imp.render(); impIssues(); sel.parentNode.className = sel.value === '' ? '' : 'auto'; }; });
    $('bt-defcat').onchange = function () { impBuild(); G.imp.render(); impIssues(); };
    $('bt-run').onclick = runImport;
  }
  function impIssues() {
    var el = $('bt-iss'); if (!el) return; var is = S.builtIssues || [];
    el.innerHTML = is.length ? '<details class="bt-iss"><summary>' + is.length + ' note' + (is.length > 1 ? 's' : '') + ' about your file</summary>' + is.slice(0, 60).map(function (i) { return '<div>Row ' + i.row + ': ' + esc(i.msg) + '</div>'; }).join('') + '</details>' : '';
  }
  async function runImport() {
    var t = target(); if (!t) return;
    var rows = G.imp.rows.filter(function (r) { return !r.del; }); if (!rows.length) return;
    var bad = rows.filter(function (r) { return !String(r.d.name || '').trim(); }); if (bad.length) { say('⚠️ ' + bad.length + ' row(s) have no name — fill it in or remove the row'); return; }
    var btn = $('bt-run'); btn.disabled = true; $('bt-prog').style.display = 'block';
    try {
      var dup = $('bt-dup').value, qm = $('bt-qm').value, now = new Date().toISOString();
      var existing = await fetchProducts(t), taken = {}; Object.keys(existing).forEach(function (k) { taken[k] = 1; });
      var writes = {}, added = 0, updated = 0, skipped = 0;
      rows.forEach(function (r) {
        var p = {}; ALL.forEach(function (f) { var v = r.d[f]; if (NUMERIC[f]) { if (v !== '' && v != null) p[f] = num(v); } else if (v !== '' && v != null) p[f] = String(v).trim(); });
        if (p.quantity != null) p.quantity = Math.max(0, Math.round(p.quantity)); else p.quantity = 0;
        if (p.price == null) p.price = 0; if (!p.category) p.category = ($('bt-defcat').value || '').trim() || 'Other';
        var ex = dup === 'new' ? null : QCImport.matchExisting(p, Object.assign({}, existing, writes));
        if (ex) {
          if (dup === 'skip') { skipped++; return; }
          var old = writes[ex] || existing[ex] || {}, rec = Object.assign({}, old);
          Object.keys(p).forEach(function (k) { if (p[k] !== '' && p[k] != null && !(k === 'price' && !p[k])) rec[k] = p[k]; });
          if (qm === 'keep') rec.quantity = old.quantity || 0; else if (qm === 'add') rec.quantity = (Number(old.quantity) || 0) + (p.quantity || 0);
          if (old.image && !p.image) rec.image = old.image; rec.lastUpdated = now; writes[ex] = rec; updated++;
        } else {
          var rec2 = Object.assign({ store: 'My Store', inStock: true, source: 'import', ownerStore: t.owner, createdAt: now, lastUpdated: now }, p); if (qm === 'keep') rec2.quantity = 0;
          writes[QCImport.newId(p, taken)] = rec2; added++;
        }
      });
      var ids = Object.keys(writes), CH = 80, done = 0;
      for (var i = 0; i < ids.length; i += CH) {
        var chunk = {}; ids.slice(i, i + CH).forEach(function (k) { chunk[k] = writes[k]; });
        var r = await fetch(t.products + '.json', { method: 'PATCH', headers: H, body: JSON.stringify(chunk) }); if (!r.ok) throw new Error('Database refused a batch (' + r.status + ')');
        done += Object.keys(chunk).length; $('bt-pbar').style.width = Math.round(done / ids.length * 100) + '%'; $('bt-ptxt').textContent = done + ' / ' + ids.length + ' saved…';
      }
      $('bt-imp').innerHTML = '<div class="bt-done"><div class="bt-big">🎉</div><h3>Import complete</h3><p><b>' + added + '</b> added · <b>' + updated + '</b> updated' + (skipped ? ' · <b>' + skipped + '</b> skipped' : '') + '</p><div class="bt-row" style="justify-content:center"><button class="bt-b ora" id="bt-d-edit">✏️ Edit products</button><button class="bt-b" id="bt-d-more">Import another file</button></div></div>';
      $('bt-d-edit').onclick = function () { tab('edit'); }; $('bt-d-more').onclick = impStart; G.ed = null; if (window.loadProds) try { window.loadProds(); } catch (e) { }
    } catch (e) { say('❌ ' + e.message); $('bt-ptxt').textContent = 'Stopped: ' + e.message; btn.disabled = false; }
  }

  /* ───────────── EDIT ───────────── */
  async function edLoad() {
    var t = target(); if (!t) { $('bt-ed').innerHTML = '<div class="bt-empty">Please log in first.</div>'; return; }
    $('bt-ed').innerHTML = '<div class="bt-empty">Loading your products…</div>';
    try {
      var d = await fetchProducts(t), keys = Object.keys(d).filter(function (k) { return d[k] && typeof d[k] === 'object'; });
      G.ed = makeGrid('bt-egrid', 'ed');
      G.ed.set(keys.map(function (k) { var rec = {}; ALL.forEach(function (f) { rec[f] = d[k][f] == null ? '' : d[k][f]; }); return { id: k, d: Object.assign({}, rec), o: rec, sel: false, dirty: false, raw: d[k] }; }));
      $('bt-ed').innerHTML = '<p class="bt-note" style="margin:0 0 10px">Click any cell to edit. Changed rows turn orange. Nothing is saved until you press <b>Save changes</b>.</p>' + bulkBar('bt-ebulk')
        + '<div id="bt-egrid"></div><div class="bt-row"><button class="bt-b ora lg" id="bt-save" disabled>Save changes</button><button class="bt-b" id="bt-disc" disabled>Discard changes</button><span class="bt-sp"></span><button class="bt-b" id="bt-reload">↻ Reload</button></div><div id="bt-sprog" class="bt-note"></div>';
      G.ed.after = function () { var n = G.ed.dirty(), b = $('bt-save'); if (b) { b.disabled = !n; b.textContent = n ? 'Save ' + n + ' change' + (n === 1 ? '' : 's') : 'Save changes'; } var x = $('bt-disc'); if (x) x.disabled = !n; };
      G.ed.bind(); G.ed.render(); bindBulk('bt-ebulk', G.ed);
      $('bt-save').onclick = edSave; $('bt-reload').onclick = function () { G.ed = null; edLoad(); };
      $('bt-disc').onclick = function () { G.ed.rows.forEach(function (r) { r.d = Object.assign({}, r.o); r.dirty = false; r.del = false; }); G.ed.render(); };
    } catch (e) { $('bt-ed').innerHTML = '<div class="bt-empty">❌ ' + esc(e.message) + '</div>'; }
  }
  async function edSave() {
    var t = target(); if (!t) return; var g = G.ed, now = new Date().toISOString(), patch = {}, edits = 0, dels = 0;
    var bad = g.rows.filter(function (r) { return !r.del && r.dirty && !String(r.d.name || '').trim(); }); if (bad.length) { say('⚠️ A product can’t have an empty name'); return; }
    g.rows.forEach(function (r) {
      if (r.del) { patch[r.id] = null; dels++; return; }
      if (!r.dirty) return;
      ALL.forEach(function (f) {
        if (cell(r.d[f]) === cell(r.o[f])) return;
        var v = r.d[f]; patch[r.id + '/' + f] = NUMERIC[f] ? (v === '' ? null : (f === 'quantity' ? Math.max(0, Math.round(num(v))) : Math.max(0, num(v)))) : (String(v).trim() === '' ? null : String(v).trim());
      });
      patch[r.id + '/lastUpdated'] = now; edits++;
    });
    var paths = Object.keys(patch); if (!paths.length) return;
    if (dels && window.QC && QC.confirm && !(await QC.confirm('This will permanently delete ' + dels + ' product' + (dels === 1 ? '' : 's') + '. Continue?', { title: 'Save changes', ok: 'Save', danger: true }))) return;
    var btn = $('bt-save'); btn.disabled = true;
    try {
      for (var i = 0; i < paths.length; i += 300) {
        var chunk = {}; paths.slice(i, i + 300).forEach(function (k) { chunk[k] = patch[k]; });
        var r = await fetch(t.products + '.json', { method: 'PATCH', headers: H, body: JSON.stringify(chunk) }); if (!r.ok) throw new Error('Database refused the save (' + r.status + ')');
        $('bt-sprog').textContent = Math.min(i + 300, paths.length) + ' / ' + paths.length + ' saved…';
      }
      say('✅ Saved ' + edits + ' edit' + (edits === 1 ? '' : 's') + (dels ? ' and removed ' + dels : ''));
      g.rows = g.rows.filter(function (r) { return !r.del; }); g.rows.forEach(function (r) { if (r.dirty) { r.o = Object.assign({}, r.d); r.dirty = false; } }); g.set(g.rows);
      $('bt-sprog').textContent = ''; g.render(); if (window.loadProds) try { window.loadProds(); } catch (e) { }
    } catch (e) { say('❌ ' + e.message); $('bt-sprog').textContent = 'Stopped: ' + e.message; btn.disabled = false; }
  }

  /* ───────────── EXPORT ───────────── */
  async function exLoad() {
    var t = target(); if (!t) { $('bt-ex').innerHTML = '<div class="bt-empty">Please log in first.</div>'; return; }
    $('bt-ex').innerHTML = '<div class="bt-empty">Loading…</div>';
    try {
      var d = await fetchProducts(t), rows = Object.keys(d).filter(function (k) { return d[k] && typeof d[k] === 'object'; }).map(function (k) { return Object.assign({ id: k }, d[k]); });
      var cats = {}; rows.forEach(function (r) { if (r.category) cats[r.category] = 1; });
      var low = function (r) { return Number(r.quantity) > 0 && Number(r.quantity) <= (Number(r.reorderPoint) || 5); }, out = function (r) { return !(Number(r.quantity) > 0); };
      var defOn = { name: 1, brand: 1, category: 1, price: 1, cost: 1, quantity: 1, sku: 1, barcode: 1, unit: 1, reorderPoint: 1, vat: 1, description: 1, image: 1, supplier: 1, tag: 1 };
      $('bt-ex').innerHTML = '<div class="bt-grid2"><div><label class="bt-h">1 · Format</label><div class="bt-fm">' + FORMATS.map(function (f, i) { return '<label><input type="radio" name="bt-fmt" value="' + f[0] + '"' + (i === 0 ? ' checked' : '') + '><span>' + f[1] + '<small>' + f[2] + '</small></span></label>'; }).join('') + '</div>'
        + '<label class="bt-h">2 · Which products</label><select id="bt-scope"><option value="all">All products (' + rows.length + ')</option><option value="low">Low stock (' + rows.filter(low).length + ')</option><option value="out">Out of stock (' + rows.filter(out).length + ')</option>' + Object.keys(cats).sort().map(function (c) { return '<option value="cat:' + esc(c) + '">Category: ' + esc(c) + ' (' + rows.filter(function (r) { return r.category === c; }).length + ')</option>'; }).join('') + '</select>'
        + '<label class="bt-h">File name</label><input id="bt-fname" value="quickcart-products-' + stamp() + '"></div>'
        + '<div><label class="bt-h">3 · Columns <a href="#" id="bt-call">all</a> · <a href="#" id="bt-cnone">none</a></label><div class="bt-cols">' + ALL.map(function (f) { return '<label><input type="checkbox" data-col="' + f + '"' + (defOn[f] ? ' checked' : '') + '> ' + LABEL[f] + '</label>'; }).join('') + '<label><input type="checkbox" data-col="id"> Product ID</label></div></div></div>'
        + '<div class="bt-row"><button class="bt-b ora lg" id="bt-exgo">⬇ Export</button><span class="bt-note" id="bt-exn"></span></div>'
        + '<p class="bt-note">Tip: export to Excel or CSV, change prices or stock in your spreadsheet, then bring it back through <b>Import</b> — matching products are updated, not duplicated.</p>';
      var upd = function () { var sc = $('bt-scope').value, n = rows.filter(function (r) { return sc === 'all' ? 1 : sc === 'low' ? low(r) : sc === 'out' ? out(r) : r.category === sc.slice(4); }).length; $('bt-exn').textContent = n + ' product' + (n === 1 ? '' : 's') + ' will be exported'; return n; };
      $('bt-scope').onchange = upd; upd();
      $('bt-call').onclick = function (e) { e.preventDefault(); $('bt-ex').querySelectorAll('[data-col]').forEach(function (c) { c.checked = true; }); };
      $('bt-cnone').onclick = function (e) { e.preventDefault(); $('bt-ex').querySelectorAll('[data-col]').forEach(function (c) { c.checked = false; }); };
      $('bt-exgo').onclick = async function () {
        var sc = $('bt-scope').value, fmt = ($('bt-ex').querySelector('input[name="bt-fmt"]:checked') || {}).value || 'csv';
        var list = rows.filter(function (r) { return sc === 'all' ? 1 : sc === 'low' ? low(r) : sc === 'out' ? out(r) : r.category === sc.slice(4); });
        var cols = [].map.call($('bt-ex').querySelectorAll('[data-col]:checked'), function (c) { return c.getAttribute('data-col'); }); if (cols.indexOf('id') > -1) { cols = ['id'].concat(cols.filter(function (c) { return c !== 'id'; })); }
        if (!list.length) { say('No products to export'); return; } if (!cols.length) { say('Pick at least one column'); return; }
        var nm = ($('bt-fname').value || 'products').replace(/[^\w.\- ]+/g, '_').replace(/\.[a-z0-9]{2,5}$/i, '');
        try { await saveAs(fmt, list, cols, nm); say('✅ Exported ' + list.length + ' products'); } catch (e) { say('❌ ' + e.message); }
      };
    } catch (e) { $('bt-ex').innerHTML = '<div class="bt-empty">❌ ' + esc(e.message) + '</div>'; }
  }

  /* ───────────── shell ───────────── */
  function tab(name) {
    S.tab = name;
    ['import', 'edit', 'export'].forEach(function (n) { var b = $('bt-tab-' + n), p = $('bt-pane-' + n); if (b) b.classList.toggle('on', n === name); if (p) p.style.display = n === name ? 'block' : 'none'; });
    if (name === 'edit' && !G.ed) edLoad(); if (name === 'export') exLoad();
  }
  var CSS = '.bt{max-width:1100px}.bt-tabs{display:flex;gap:6px;margin:14px 0;flex-wrap:wrap}.bt-tabs button{border:1px solid var(--border);background:#fff;padding:11px 20px;border-radius:12px;font-weight:800;font-size:13px;cursor:pointer;color:var(--ink2,#3b4a6b)}.bt-tabs button.on{background:#0a1f44;border-color:#0a1f44;color:#fff}'
    + '.bt-card{background:#fff;border:1px solid var(--border);border-radius:18px;padding:20px}.bt-drop{border:2px dashed #c7d2ea;border-radius:18px;padding:34px 16px;text-align:center;cursor:pointer;background:#f8faff;transition:.2s}.bt-drop:hover,.bt-drop.over{border-color:#ff5a1f;background:#fff6f1}.bt-drop b{display:block;font-size:15px}.bt-drop small{display:block;color:#6b7a99;margin-top:6px;font-size:12px}.bt-big{font-size:36px;margin-bottom:6px}'
    + '.bt-or{text-align:center;margin:14px 0 8px;font-size:11px;color:#8a96b0;font-weight:800;letter-spacing:.1em}#bt-paste{width:100%;padding:12px;border:1px solid var(--border);border-radius:14px;font-family:ui-monospace,Menlo,monospace;font-size:11px;box-sizing:border-box;resize:vertical}'
    + '.bt-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px}.bt-sp{flex:1}.bt-lbl{font-size:12px;color:#6b7a99}.bt-row select,.bt-bar select,.bt-opts select,.bt-opts input,#bt-scope,#bt-fname{padding:9px 11px;border:1px solid var(--border);border-radius:10px;font-size:12px;background:#fff;box-sizing:border-box;max-width:100%}'
    + '.bt-b{border:1px solid var(--border);background:#fff;padding:9px 16px;border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;color:#0a1f44}.bt-b:hover:not(:disabled){border-color:#ff5a1f}.bt-b:disabled{opacity:.45;cursor:not-allowed}.bt-b.ora{background:linear-gradient(135deg,#ff5a1f,#ff8a3d);color:#fff;border:0;box-shadow:0 8px 18px rgba(255,90,31,.3)}.bt-b.lg{padding:13px 26px;font-size:14px}'
    + '.bt-sum{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px;margin-bottom:12px}.bt-badge{background:#fff1ea;color:#ff5a1f;font-weight:800;font-size:11px;padding:4px 10px;border-radius:99px}.bt-warn{background:#fff7e0;border:1px solid #f3dc9a;padding:10px 14px;border-radius:12px;font-size:12px;margin-bottom:10px}'
    + '.bt-map{border:1px solid var(--border);border-radius:14px;padding:10px 14px;margin-bottom:12px;background:#fbfcff}.bt-map summary{cursor:pointer;font-weight:800;font-size:13px}.bt-map summary span{font-weight:500;color:#6b7a99;font-size:11px;margin-left:6px}.bt-mg{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin-top:10px}.bt-mg label{font-size:10px;font-weight:800;color:#6b7a99;text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:3px}.bt-mg select{width:100%;padding:7px;border:1px solid var(--border);border-radius:8px;font-size:12px;background:#fff}.bt-mg .auto select{border-color:#27ae60;background:#f0fbf4}'
    + '.bt-note{font-size:11px;color:#6b7a99;line-height:1.5}.bt-iss{background:#fff7e0;border:1px solid #f3dc9a;border-radius:12px;padding:8px 14px;font-size:12px;margin-bottom:10px}.bt-iss summary{cursor:pointer;font-weight:700}.bt-iss div{padding:2px 0;color:#6a5a1e}'
    + '.bt-bulk{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#0a1f44;color:#fff;border-radius:14px;padding:10px 14px;margin-bottom:10px}.bt-bulk b{font-size:12px}.bt-bulk select,.bt-bulk input{padding:8px 10px;border-radius:9px;border:0;font-size:12px;min-width:140px}.bt-bulk .bt-b{border:0}'
    + '.bt-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.bt-q{flex:1;min-width:200px;padding:10px 14px;border:1px solid var(--border);border-radius:10px;font-size:13px}.bt-count{font-size:12px;color:#6b7a99}'
    + '.bt-tw{overflow:auto;max-height:460px;border:1px solid var(--border);border-radius:14px;background:#fff}.bt-t{border-collapse:collapse;width:100%;font-size:12px}.bt-t th{position:sticky;top:0;background:#f1f4fb;text-align:left;padding:9px 6px;font-size:11px;font-weight:800;color:#3b4a6b;z-index:1;white-space:nowrap}.bt-t td{border-top:1px solid #edf0f8;padding:0}.bt-ck{width:34px;text-align:center}'
    + '.bt-c{width:100%;border:0;background:transparent;padding:9px 6px;font-size:12px;font-family:inherit;box-sizing:border-box;outline:none;color:#0a1f44}.bt-c.n{text-align:right;font-family:ui-monospace,Menlo,monospace}.bt-c:focus{background:#fff6f1;box-shadow:inset 0 0 0 2px #ff5a1f}.bt-t tr.bt-dirty td{background:#fff3ea}.bt-t tr.bt-new td{background:#fff}.bt-x{border:0;background:none;color:#c0392b;cursor:pointer;font-size:14px;padding:6px 10px}'
    + '.bt-pg{display:flex;gap:12px;align-items:center;justify-content:center;margin:10px 0;font-size:12px;color:#6b7a99}.bt-empty{padding:30px;text-align:center;color:#6b7a99;font-size:13px}.bt-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:14px 0}.bt-opts label,.bt-h{display:block;font-size:11px;font-weight:800;color:#3b4a6b;margin:0 0 5px;text-transform:uppercase;letter-spacing:.05em}.bt-opts select,.bt-opts input{width:100%}'
    + '.bt-pb{height:8px;background:#eef2fa;border-radius:99px;overflow:hidden;margin-top:10px}.bt-pb i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff5a1f,#ff8a3d);transition:width .2s}.bt-done{text-align:center;padding:26px}.bt-done h3{margin:4px 0;font-size:22px}'
    + '.bt-grid2{display:grid;grid-template-columns:1fr 1.2fr;gap:24px}.bt-fm{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px}.bt-fm label{border:1.5px solid var(--border);border-radius:12px;padding:10px 12px;cursor:pointer;display:flex;gap:8px;align-items:center;font-size:13px;font-weight:700;text-transform:none;letter-spacing:0;margin:0}.bt-fm label:has(input:checked){border-color:#ff5a1f;background:#fff6f1}.bt-fm small{display:block;font-weight:500;color:#8a96b0;font-size:10px}.bt-fm input{margin:0}'
    + '#bt-scope,#bt-fname{width:100%;margin-bottom:14px}.bt-cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px;border:1px solid var(--border);border-radius:12px;padding:12px;max-height:290px;overflow:auto}.bt-cols label{font-size:12px;font-weight:600;text-transform:none;letter-spacing:0;display:flex;gap:6px;margin:0;align-items:center}.bt-h a{color:#ff5a1f;text-transform:none;letter-spacing:0;margin-left:4px}'
    + '@media(max-width:760px){.bt-grid2{grid-template-columns:1fr}.bt-tabs button{flex:1;padding:10px 8px}}';

  function init() {
    var panel = $('p-import'); if (!panel || $('bt-root')) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var sub = panel.querySelector('.psub'); if (sub) sub.innerHTML = 'Bring products in, edit them like a spreadsheet, or take them out — in the format you need. Everything stays in <b id="sc-store-name">your store</b> only.';
    var ptitle = panel.querySelector('.ptitle'); if (ptitle) ptitle.textContent = 'Import · Edit · Export';
    [].slice.call(panel.children).forEach(function (c) { if (!c.classList.contains('ptitle') && !c.classList.contains('psub')) c.remove(); });   /* drops the old JSON-only box and the sample "Jumia" seeder */
    panel.insertAdjacentHTML('beforeend', '<div class="bt" id="bt-root"><div class="bt-tabs"><button id="bt-tab-import" class="on">📥 Import</button><button id="bt-tab-edit">✏️ Edit products</button><button id="bt-tab-export">📤 Export</button></div>'
      + '<div id="bt-pane-import" class="bt-card"><div id="bt-imp"></div></div><div id="bt-pane-edit" class="bt-card" style="display:none"><div id="bt-ed"></div></div><div id="bt-pane-export" class="bt-card" style="display:none"><div id="bt-ex"></div></div></div>');
    ['import', 'edit', 'export'].forEach(function (n) { $('bt-tab-' + n).onclick = function () { tab(n); }; });
    impStart();
    var g = window.go; if (typeof g === 'function') window.go = function (n) { var r = g.apply(this, arguments); if (n === 'import') { var t = target(); var nm = $('sc-store-name'); if (nm && t) nm.textContent = t.biz || 'your store'; if (S.tab === 'edit') { G.ed = null; edLoad(); } else if (S.tab === 'export') exLoad(); } return r; };
  }
  window.QCBulk = { serialise: serialise, applyAction: applyAction, makeGrid: makeGrid, COLS: COLS, _S: S, _G: G, init: init, tab: tab };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
