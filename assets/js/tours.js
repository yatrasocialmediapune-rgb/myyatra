/* MY YATRA — /tours/ listing: client-side search, filters, sort and the mobile bottom sheet.
   Cards are rendered at build time (good for SEO); this script only shows, hides and reorders them. */
(function () {
  'use strict';

  var root = document.querySelector('[data-listing]');
  if (!root) return;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var doc = document.documentElement;
  var list = $('[data-results]', root);
  var items = $$('[data-results] > li', root);
  var search = $('#tour-search');
  var sortSel = $('[data-sort]', root);
  var empty = $('[data-empty]', root);
  var activeBox = $('[data-active]', root);
  var badge = $('[data-filter-badge]', root);
  var panel = $('[data-filters]', root);
  var backdrop = $('.sheet-backdrop', root);
  var openBtn = $('[data-sheet-open]', root);
  var inputs = $$('input', panel);

  var labelOf = function (input) { return input.closest('label').querySelector('.opt__label').textContent.trim(); };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, ''); };
  var range = function (v) { var p = String(v).split('-'); return [Number(p[0]) || 0, Number(p[1]) || Infinity]; };

  /* ---------- State <-> URL ---------- */
  function readUrl() {
    var q = new URLSearchParams(location.search);
    var multi = function (k) { return (q.get(k) || '').split(',').filter(Boolean); };
    search.value = q.get('q') || '';
    inputs.forEach(function (i) {
      if (i.name === 'state' || i.name === 'theme') i.checked = multi(i.name).indexOf(i.value) > -1;
      else i.checked = (q.get(i.name) || '') === i.value;
    });
    if (q.get('sort')) sortSel.value = q.get('sort');
  }
  function state() {
    var checked = function (name) { return inputs.filter(function (i) { return i.name === name && i.checked && i.value; }).map(function (i) { return i.value; }); };
    return {
      q: search.value.trim(),
      state: checked('state'),
      theme: checked('theme'),
      days: checked('days')[0] || '',
      budget: checked('budget')[0] || '',
      sort: sortSel.value
    };
  }
  function writeUrl(s) {
    var q = new URLSearchParams();
    if (s.q) q.set('q', s.q);
    if (s.state.length) q.set('state', s.state.join(','));
    if (s.theme.length) q.set('theme', s.theme.join(','));
    if (s.days) q.set('days', s.days);
    if (s.budget) q.set('budget', s.budget);
    if (s.sort !== 'recommended') q.set('sort', s.sort);
    var qs = q.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  /* ---------- Filtering & sorting ---------- */
  function matches(li, s) {
    var d = li.dataset;
    if (s.q) {
      var hay = d.search, words = norm(s.q).split(/\s+/);
      for (var w = 0; w < words.length; w++) if (hay.indexOf(words[w]) === -1) return false;
    }
    if (s.state.length && s.state.indexOf(d.state) === -1) return false;
    if (s.theme.length) {
      var themes = d.themes.split('|');
      if (!s.theme.some(function (t) { return themes.indexOf(t) > -1; })) return false;
    }
    if (s.days) { var r = range(s.days), days = Number(d.days); if (days < r[0] || days > r[1]) return false; }
    if (s.budget) { var b = range(s.budget), price = Number(d.price); if (price < b[0] || price >= b[1]) return false; }
    return true;
  }
  var sorters = {
    recommended: function (a, b) { return (b.dataset.featured - a.dataset.featured) || (a.dataset.order - b.dataset.order); },
    'price-asc': function (a, b) { return a.dataset.price - b.dataset.price; },
    'price-desc': function (a, b) { return b.dataset.price - a.dataset.price; },
    'days-asc': function (a, b) { return a.dataset.days - b.dataset.days; },
    'days-desc': function (a, b) { return b.dataset.days - a.dataset.days; }
  };

  function apply() {
    var s = state();
    var shown = 0;
    items.slice().sort(sorters[s.sort] || sorters.recommended).forEach(function (li) {
      var ok = matches(li, s);
      li.hidden = !ok;
      if (ok) { shown++; li.querySelector('[data-reveal]') && li.querySelector('[data-reveal]').classList.add('is-in'); }
      list.appendChild(li);
    });
    $$('[data-count-label]').forEach(function (el) { el.textContent = shown; });
    empty.hidden = shown > 0;

    // Active filter chips
    var chips = [];
    if (s.q) chips.push({ label: '“' + s.q + '”', clear: function () { search.value = ''; } });
    inputs.forEach(function (i) {
      if (i.checked && i.value) chips.push({ label: labelOf(i), clear: function () { i.checked = false; var any = $('input[name="' + i.name + '"][value=""]', panel); if (any) any.checked = true; } });
    });
    activeBox.innerHTML = '';
    chips.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span></span><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg>';
      b.firstChild.textContent = c.label;
      b.setAttribute('aria-label', 'Remove filter ' + c.label);
      b.addEventListener('click', function () { c.clear(); apply(); });
      activeBox.appendChild(b);
    });
    var n = chips.length - (s.q ? 1 : 0);
    badge.hidden = n === 0;
    badge.textContent = n;
    writeUrl(s);
  }

  function reset() {
    search.value = '';
    inputs.forEach(function (i) { i.checked = i.type === 'radio' && i.value === ''; });
    sortSel.value = 'recommended';
    apply();
  }

  /* ---------- Bottom sheet (mobile) ---------- */
  var lastFocus = null;
  function setSheet(open) {
    if (window.matchMedia('(min-width: 67.5em)').matches) open = false;
    panel.classList.toggle('is-open', open);
    backdrop.classList.toggle('is-open', open);
    doc.classList.toggle('sheet-open', open);
    openBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      lastFocus = document.activeElement;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      setTimeout(function () { var f = $('.filters__head button', panel); if (f) f.focus(); }, 300);
    } else {
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
  }
  openBtn.addEventListener('click', function () { setSheet(true); });
  $$('[data-sheet-close]', root).forEach(function (el) { el.addEventListener('click', function () { setSheet(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('is-open')) setSheet(false); });
  window.matchMedia('(min-width: 67.5em)').addEventListener('change', function () { setSheet(false); });

  /* ---------- Wire up ---------- */
  var t;
  search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(apply, 120); });
  search.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
  inputs.forEach(function (i) { i.addEventListener('change', apply); });
  sortSel.addEventListener('change', apply);
  $$('[data-reset]', root).forEach(function (b) { b.addEventListener('click', reset); });

  readUrl();
  apply();
})();
