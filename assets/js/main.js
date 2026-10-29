/* MY YATRA — site behaviour. Vanilla JS, no dependencies.
   Each feature only runs when its markup is on the page. */
(function () {
  'use strict';

  var doc = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  // Page-language strings written by build.js (data/i18n/{lang}.json → "js").
  var I18N = {};
  try { I18N = JSON.parse((document.getElementById('i18n') || {}).textContent || '{}'); } catch (e) { /* use fallbacks */ }
  var tx = function (key, fallback, vars) {
    var s = I18N[key] || fallback;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return vars && k in vars ? vars[k] : m; });
  };
  var locale = doc.lang || 'en-IN';

  /* ---------- Shared rAF-throttled scroll/resize loop ---------- */
  var scrollSubs = [];
  var ticking = false;
  function onScroll(fn) { scrollSubs.push(fn); fn(); }
  function runSubs() { ticking = false; for (var i = 0; i < scrollSubs.length; i++) scrollSubs[i](); }
  function requestTick() { if (!ticking) { ticking = true; requestAnimationFrame(runSubs); } }
  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', requestTick, { passive: true });

  /* ---------- Header: solid background after scrolling ---------- */
  var header = $('.site-header');
  if (header) {
    var scrolled = null;
    onScroll(function () {
      var s = window.scrollY > 24;
      if (s !== scrolled) { scrolled = s; header.classList.toggle('is-scrolled', s); }
    });
  }

  /* ---------- Mobile menu: full-screen overlay with scroll-lock ---------- */
  var toggle = $('.menu-toggle');
  var menu = $('#mobile-menu');
  if (toggle && menu) {
    var setMenu = function (open) {
      doc.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? tx('closeMenu', 'Close menu') : tx('openMenu', 'Open menu'));
      menu.toggleAttribute('inert', !open);
      if (open) { var first = $('a', menu); if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 250); }
    };
    menu.setAttribute('inert', '');
    toggle.addEventListener('click', function () { setMenu(toggle.getAttribute('aria-expanded') !== 'true'); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && doc.classList.contains('menu-open')) { setMenu(false); toggle.focus(); }
    });
    window.matchMedia('(min-width: 67.5em)').addEventListener('change', function (m) { if (m.matches) setMenu(false); });
  }

  /* ---------- Scroll reveal (fade + rise, staggered via --i) ---------- */
  var revealEls = $$('[data-reveal]');
  if (revealEls.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealEls.forEach(function (el) { el.classList.add('is-in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
      revealEls.forEach(function (el) { io.observe(el); });
    }
  }

  /* ---------- Animated number counters ---------- */
  var counters = $$('[data-counter]');
  if (counters.length) {
    var fmt = new Intl.NumberFormat('en-IN');
    var runCounter = function (el) {
      var target = parseFloat(el.getAttribute('data-counter')) || 0;
      var suffix = el.getAttribute('data-suffix') || '';
      if (reduceMotion) { el.textContent = fmt.format(target) + suffix; return; }
      var start = performance.now(), dur = 1600;
      (function step(now) {
        var t = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = fmt.format(Math.round(target * eased)) + suffix;
        if (t < 1) requestAnimationFrame(step);
      })(start);
    };
    if ('IntersectionObserver' in window) {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { runCounter(en.target); cio.unobserve(en.target); } });
      }, { threshold: 0.6 });
      counters.forEach(function (el) { cio.observe(el); });
    } else counters.forEach(runCounter);
  }

  /* ---------- Parallax silhouettes in heroes ---------- */
  var layers = $$('.silhouette[data-depth]');
  if (layers.length && !reduceMotion) {
    var hero = layers[0].closest('section, header, div');
    onScroll(function () {
      var y = window.scrollY;
      if (hero && y > hero.offsetHeight * 1.2) return; // off-screen: skip work
      for (var i = 0; i < layers.length; i++) {
        var d = parseFloat(layers[i].getAttribute('data-depth')) || 0;
        layers[i].style.transform = 'translate3d(0,' + (y * d * -0.6).toFixed(1) + 'px,0)';
      }
    });
  }

  /* ---------- Journey itinerary: dotted route that draws itself ---------- */
  $$('[data-journey]').forEach(function (list) {
    var stops = $$('.journey__num', list);
    if (stops.length < 2) return;
    var NS = 'http://www.w3.org/2000/svg';
    var line = document.createElement('div');
    line.className = 'journey__line';
    line.setAttribute('aria-hidden', 'true');
    line.innerHTML =
      '<svg class="route-svg-base"><path class="route-base" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="0.1 9"/></svg>' +
      '<div class="journey__reveal"><div class="journey__reveal-inner"><svg><path class="route-draw" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="0.1 9"/></svg></div></div>';
    list.insertBefore(line, list.firstChild);
    list.classList.add('has-route');
    var reveal = $('.journey__reveal', line), inner = $('.journey__reveal-inner', line);
    var paths = $$('path', line), svgs = $$('svg', line);
    var centers = [];
    var H = 0;

    function build() {
      var top = list.getBoundingClientRect().top;
      H = list.offsetHeight;
      centers = stops.map(function (s) { var r = s.getBoundingClientRect(); return r.top - top + r.height / 2; });
      var x = 24, d = 'M' + x + ' ' + centers[0].toFixed(1);
      for (var i = 1; i < centers.length; i++) {
        var y0 = centers[i - 1], y1 = centers[i], dy = y1 - y0, a = (i % 2 ? 15 : -15);
        d += ' C' + (x + a) + ' ' + (y0 + dy * 0.33).toFixed(1) + ' ' + (x - a) + ' ' + (y0 + dy * 0.66).toFixed(1) + ' ' + x + ' ' + y1.toFixed(1);
      }
      svgs.forEach(function (svg) { svg.setAttribute('viewBox', '0 0 48 ' + H); svg.setAttribute('width', '48'); svg.setAttribute('height', String(H)); });
      paths.forEach(function (p) { p.setAttribute('d', d); });
      update();
    }
    function update() {
      var p = 1;
      if (!reduceMotion) {
        var r = list.getBoundingClientRect();
        p = Math.max(0, Math.min(1, (window.innerHeight * 0.62 - r.top) / r.height));
      }
      var off = (1 - p) * 100;
      reveal.style.transform = 'translate3d(0,' + (-off) + '%,0)';
      inner.style.transform = 'translate3d(0,' + off + '%,0)';
      var reachedY = p * H + 4;
      for (var i = 0; i < stops.length; i++) stops[i].parentNode.classList.toggle('is-reached', centers[i] <= reachedY);
    }
    build();
    onScroll(update);
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(build, 150); });
    window.addEventListener('load', build);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
  });

  /* ---------- Gallery lightbox (native <dialog>) ---------- */
  var lb = $('#lightbox');
  var shots = $$('[data-lightbox]');
  if (lb && shots.length && typeof lb.showModal === 'function') {
    var lbImg = $('img', lb), lbCount = $('[data-lb-count]', lb), idx = 0;
    var show = function (i) {
      idx = (i + shots.length) % shots.length;
      var b = shots[idx];
      lbImg.src = b.getAttribute('data-lightbox');
      lbImg.alt = b.getAttribute('data-alt') || '';
      lbCount.textContent = (idx + 1) + ' / ' + shots.length;
    };
    shots.forEach(function (b, i) { b.addEventListener('click', function () { show(i); lb.showModal(); }); });
    $('[data-lb-prev]', lb).addEventListener('click', function () { show(idx - 1); });
    $('[data-lb-next]', lb).addEventListener('click', function () { show(idx + 1); });
    $('[data-lb-close]', lb).addEventListener('click', function () { lb.close(); });
    lb.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') show(idx - 1);
      if (e.key === 'ArrowRight') show(idx + 1);
    });
    var sx = null;
    lb.addEventListener('pointerdown', function (e) { sx = e.clientX; });
    lb.addEventListener('pointerup', function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
    });
  }

  /* ---------- "Plan this trip on WhatsApp" planner ---------- */
  var planner = $('[data-wa-planner]');
  if (planner) {
    var num = planner.getAttribute('data-wa-number');
    var monthSel = $('[data-wa-month]', planner);
    // Separate male / female counts; the WhatsApp message includes both and the total.
    var counts = { male: $('[data-wa-count="male"]', planner), female: $('[data-wa-count="female"]', planner) };
    var totalEl = $('[data-wa-total]', planner);
    var MAX = 50;
    var val = function (k) { return Math.max(0, Math.min(MAX, parseInt(counts[k].value, 10) || 0)); };

    // Next 12 months, computed in the browser so they never go stale.
    var now = new Date();
    for (var m = 0; m < 12; m++) {
      var d = new Date(now.getFullYear(), now.getMonth() + m, 1);
      var label = d.toLocaleString(locale, { month: 'long', year: 'numeric', numberingSystem: 'latn' });
      var opt = document.createElement('option');
      opt.value = label; opt.textContent = label;
      monthSel.appendChild(opt);
    }

    var buildMsg = function () {
      var m = val('male'), f = val('female'), people = m + f;
      var month = monthSel.value || tx('flexible', 'Flexible');
      var who = tx('mf', '{people} (Male {m}, Female {f})', {
        people: people === 1 ? tx('personOne', '{n} person', { n: people }) : tx('personOther', '{n} people', { n: people }), m: m, f: f
      });
      return [
        tx('tripIntro', 'Hi! I\'d like to plan this trip:'),
        '',
        '*' + planner.getAttribute('data-wa-title') + '* (' + planner.getAttribute('data-wa-duration') + ')',
        tx('month', 'Travel month: {m}', { m: month }),
        tx('travellers', 'Travellers: {n}', { n: who }),
        '',
        planner.getAttribute('data-wa-url'),
        '',
        tx('closing', 'Please share availability and the best price.')
      ].join('\n');
    };
    var sync = function () {
      var total = val('male') + val('female');
      ['male', 'female'].forEach(function (k) {
        // At least one traveller overall, so the last one can't be removed.
        $('[data-step="-1"][data-for="' + k + '"]', planner).disabled = val(k) <= 0 || total <= 1;
        $('[data-step="1"][data-for="' + k + '"]', planner).disabled = val(k) >= MAX;
      });
      if (totalEl) totalEl.textContent = tx('total', 'Total: {n} travellers', { n: total });
      var href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(buildMsg());
      $$('[data-wa-link]').forEach(function (a) { a.href = href; });
    };
    $$('[data-step]', planner).forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-for');
        counts[k].value = Math.max(0, Math.min(MAX, val(k) + parseInt(b.getAttribute('data-step'), 10)));
        sync();
      });
    });
    ['male', 'female'].forEach(function (k) {
      counts[k].addEventListener('input', sync);
      counts[k].addEventListener('change', function () {
        counts[k].value = val(k);
        if (val('male') + val('female') < 1) counts[k].value = 1;
        sync();
      });
    });
    monthSel.addEventListener('change', sync);
    sync();
  }

  /* ---------- Festive offer popup: once per visit, not on the offer's own page, off after the end date ---------- */
  var promo = $('[data-promo]');
  if (promo && typeof promo.showModal === 'function') {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var d0 = new Date(), todayStr = d0.getFullYear() + '-' + pad(d0.getMonth() + 1) + '-' + pad(d0.getDate());
    var until = promo.getAttribute('data-until');
    var seenKey = 'promo-seen:' + promo.getAttribute('data-key');
    var seen = false;
    try { seen = !!sessionStorage.getItem(seenKey); } catch (e) { /* storage blocked: show once per page load */ }
    var here = location.pathname.replace(/^\/(en|hi)(?=\/)/, '');
    var onOfferPage = here === promo.getAttribute('data-skip');
    var closePromo = function () { if (promo.open) promo.close(); };
    $$('[data-promo-close]', promo).forEach(function (b) { b.addEventListener('click', closePromo); });
    promo.addEventListener('click', function (e) { if (e.target === promo) closePromo(); }); // backdrop
    if ((!until || todayStr <= until) && !seen && !onOfferPage) {
      setTimeout(function () {
        if (doc.classList.contains('menu-open') || document.querySelector('dialog[open]')) return;
        promo.showModal();
        try { sessionStorage.setItem(seenKey, '1'); } catch (e) { /* ignore */ }
      }, 1500);
    }
  }

  /* ---------- Language menu: close on outside click or Escape ---------- */
  $$('details.lang').forEach(function (menu) {
    document.addEventListener('click', function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.open) { menu.open = false; $('summary', menu).focus(); } });
  });

  /* ---------- Contact page: enquiry form → prefilled WhatsApp message (nothing is stored) ---------- */
  $$('[data-wa-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = function (n) { var el = form.elements[n]; return el ? el.value.trim() : ''; };
      var lines = [tx('greeting', 'Hi! I\'d like help planning a trip.'), ''];
      if (v('name')) lines.push(tx('name', 'Name: {v}', { v: v('name') }));
      if (v('destination')) lines.push(tx('destination', 'Destination: {v}', { v: v('destination') }));
      if (v('month')) lines.push(tx('month', 'Travel month: {m}', { m: v('month') }));
      var mm = parseInt(v('male'), 10) || 0, ff = parseInt(v('female'), 10) || 0;
      if (mm + ff > 0) lines.push(tx('travellers', 'Travellers: {n}', { n: tx('mf', '{people} (Male {m}, Female {f})', { people: mm + ff, m: mm, f: ff }) }));
      if (v('notes')) lines.push('', v('notes'));
      window.open('https://wa.me/' + form.getAttribute('data-wa-number') + '?text=' + encodeURIComponent(lines.join('\n')), '_blank', 'noopener');
    });
  });

  /* ---------- Mobile sticky bottom bar: appears once the hero is passed ---------- */
  var bar = $('.bottombar');
  var tripHero = $('.trip-hero');
  if (bar && tripHero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var past = !entries[0].isIntersecting;
      bar.classList.toggle('is-visible', past);
      document.body.classList.toggle('bottombar-on', past);
    }, { rootMargin: '-35% 0px 0px 0px' }).observe(tripHero);
  } else if (bar) { bar.classList.add('is-visible'); document.body.classList.add('bottombar-on'); }
})();
