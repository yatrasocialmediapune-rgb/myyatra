#!/usr/bin/env node
/* ==========================================================================
   MY YATRA — static site generator
   Zero dependencies. Node 20+.

   node build.js            → build the site into /dist
   node build.js --serve    → build, serve /dist on http://localhost:8080 and
                              rebuild automatically when files change
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const TPL = path.join(ROOT, 'templates');
const SVG_DIR = path.join(ROOT, 'assets', 'svg');

const THEMES = ['Pilgrimage', 'Honeymoon', 'Family', 'Hill Station', 'Beach', 'Wildlife', 'Weekend'];
// Shorter display names for stamps and the boarding-pass "To" field.
const STATE_DISPLAY = {
  'Jammu & Kashmir': 'Kashmir',
  'Andaman & Nicobar Islands': 'Andaman',
  'Himachal Pradesh': 'Himachal',
  'Arunachal Pradesh': 'Arunachal',
  'Andhra Pradesh': 'Andhra',
  'Madhya Pradesh': 'Madhya Pradesh',
  'Uttar Pradesh': 'Uttar Pradesh'
};

// Theme copy and artwork. Replace the image paths with your own photos any time.
const THEME_INFO = {
  'Pilgrimage': { tile: 'Pilgrimage', image: 'images/dwarka-temple.svg', blurb: 'Temples, ghats and sacred circuits at a gentle pace.', intro: 'Sacred journeys planned around darshan timings and aartis, with comfortable stays close to the temples — ideal for travelling with parents and family.' },
  'Honeymoon': { tile: 'Honeymoon', image: 'images/kashmir-houseboat.svg', blurb: 'Houseboats, hill views and slow mornings for two.', intro: 'Romantic escapes with handpicked stays, private cabs and a few thoughtful surprises along the way.' },
  'Family': { tile: 'Family', image: 'images/kerala-backwaters.svg', blurb: 'Easy-paced trips that work for every age.', intro: 'Comfortable, well-paced holidays with sensible drive times, family-friendly hotels and something for every age.' },
  'Hill Station': { tile: 'Hills', image: 'images/kerala-munnar.svg', blurb: 'Pine forests, tea estates and cool mountain air.', intro: 'Mountain air, tea estates and snow-capped views — our favourite hill escapes, from Kashmir to the Western Ghats.' },
  'Beach': { tile: 'Beaches', image: 'images/somnath-shore.svg', blurb: 'Coastlines, sunsets and seafood shacks.', intro: "Sun, sand and seafood along India's coastlines, from quiet shores to lively beach towns." },
  'Wildlife': { tile: 'Wildlife', image: 'images/kerala-thekkady.svg', blurb: 'Safaris, national parks and forest stays.', intro: 'Jungle safaris, national parks and forest lodges for travellers who love the wild side of India.' },
  'Weekend': { tile: 'Weekend', image: 'images/kashmir-pahalgam.svg', blurb: 'Short breaks that fit into two or three days.', intro: 'Short getaways that fit neatly into a long weekend, with minimal travel time and maximum holiday.' }
};
const HOME_THEMES = ['Pilgrimage', 'Honeymoon', 'Hill Station', 'Beach', 'Wildlife', 'Weekend'];

// Original tile-grid map of India: [code, state, column, row, width].
const INDIA_TILES = [
  ['JK', 'Jammu & Kashmir', 3, 0], ['LA', 'Ladakh', 4, 0],
  ['PB', 'Punjab', 2, 1], ['HP', 'Himachal Pradesh', 3, 1],
  ['RJ', 'Rajasthan', 1, 2], ['HR', 'Haryana', 2, 2], ['DL', 'Delhi', 3, 2], ['UK', 'Uttarakhand', 4, 2],
  ['GJ', 'Gujarat', 0, 3], ['MP', 'Madhya Pradesh', 1, 3, 2], ['UP', 'Uttar Pradesh', 3, 3], ['BR', 'Bihar', 4, 3], ['SK', 'Sikkim', 6, 3], ['AR', 'Arunachal Pradesh', 8, 3],
  ['MH', 'Maharashtra', 1, 4, 2], ['CG', 'Chhattisgarh', 3, 4], ['JH', 'Jharkhand', 4, 4], ['WB', 'West Bengal', 5, 4], ['AS', 'Assam', 7, 4], ['NL', 'Nagaland', 8, 4],
  ['GA', 'Goa', 1, 5], ['TS', 'Telangana', 2, 5], ['AP', 'Andhra Pradesh', 3, 5], ['OD', 'Odisha', 4, 5], ['ML', 'Meghalaya', 6, 5], ['TR', 'Tripura', 7, 5], ['MN', 'Manipur', 8, 5],
  ['KA', 'Karnataka', 2, 6], ['TN', 'Tamil Nadu', 3, 6], ['MZ', 'Mizoram', 7, 6],
  ['LD', 'Lakshadweep', 0, 7], ['KL', 'Kerala', 2, 7], ['AN', 'Andaman & Nicobar Islands', 6, 7]
];
const HOME_STATE = 'MH'; // office location tile (Pune)

const STATIC_PAGES = [
  { slug: 'about', name: 'About', title: 'About Us', eyebrow: 'About us', titleHtml: 'Small team. <span class="accent">Big</span> love for India.', lede: 'We are a Pune-based team planning thoughtful, well-paced journeys across India, one WhatsApp chat at a time.', description: 'Meet My Yatra, a Pune-based travel team planning personal, well-paced tour packages across India.' },
  { slug: 'contact', name: 'Contact', title: 'Contact Us', eyebrow: 'Get in touch', titleHtml: "Let's plan your <span class=\"accent\">trip</span>", lede: 'WhatsApp is the quickest way to reach us. Prefer a call or email? Those work too.', description: 'Contact My Yatra in Pune on WhatsApp, phone or email to plan your India tour package.' },
  { slug: 'faq', name: 'FAQ', title: 'Frequently Asked Questions', eyebrow: 'Good to know', titleHtml: 'Questions, <span class="accent">answered</span>', lede: 'Everything you need to know about booking, pricing and customising a trip with us.', description: 'Answers to common questions about booking My Yatra tour packages, prices, payments and customisation.' },
  { slug: 'privacy-policy', name: 'Privacy policy', title: 'Privacy Policy', eyebrow: 'Legal', titleHtml: 'Privacy <span class="accent">policy</span>', lede: 'How we collect, use and protect your information.', description: 'Privacy policy for My Yatra tour packages and website.' },
  { slug: 'terms', name: 'Terms & conditions', title: 'Terms & Conditions', eyebrow: 'Legal', titleHtml: 'Terms &amp; <span class="accent">conditions</span>', lede: 'The terms that apply when you book a trip with us.', description: 'Terms and conditions for booking tour packages with My Yatra.' },
  { slug: 'cancellation-refund', name: 'Cancellation & refund', title: 'Cancellation & Refund Policy', eyebrow: 'Legal', titleHtml: 'Cancellation &amp; <span class="accent">refund</span>', lede: 'What happens if your plans change.', description: 'Cancellation and refund policy for My Yatra tour packages.' }
];

/* ---------- Small helpers ---------- */
const read = (p) => fs.readFileSync(p, 'utf8');
const readJSON = (p) => {
  try { return JSON.parse(read(p)); }
  catch (e) { fail(`Could not parse ${path.relative(ROOT, p)}: ${e.message}`); }
};
function fail(msg) { const e = new Error(msg); e.userFacing = true; throw e; }
const warnings = [];
const warn = (msg) => warnings.push(msg);

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// URL key for a state; "Jammu & Kashmir" and "Jammu and Kashmir" both become "jammu-kashmir".
const stateKey = (s) => slugify(String(s).replace(/\band\b/gi, ' '));
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const plainTitle = (t) => String(t).replace(/\*/g, '');
const stateDisplay = (s) => STATE_DISPLAY[s] || s;
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const get = (obj, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

// Conservative CSS minifier: strips comments and collapses whitespace outside strings/url()s.
function minifyCss(css) {
  const keep = [];
  const out = css
    .replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|url\([^)]*\))/g, (m) => `\u0000${keep.push(m) - 1}\u0000`)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>~])\s*/g, '$1')
    .replace(/:\s+/g, ':')
    .replace(/;}/g, '}')
    .trim();
  return out.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[i]) + '\n';
}

/* ---------- Tiny template engine ----------
   {{key}}         escaped value (dot paths allowed: site.phone)
   {{{key}}}       raw HTML
   {{> partial}}   templates/partials/partial.html rendered with the same context
   {{svg name}}    inlines assets/svg/name.svg                                   */
const cache = new Map();
function tpl(file) {
  if (!cache.has(file)) cache.set(file, read(file));
  return cache.get(file);
}
function render(template, ctx, name = 'template') {
  return template.replace(
    /\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{>\s*([\w-]+)\s*\}\}|\{\{svg\s+([\w-]+)\s*\}\}|\{\{\s*([\w.]+)\s*\}\}/g,
    (m, raw, partial, svg, key) => {
      if (partial) return render(tpl(path.join(TPL, 'partials', partial + '.html')), ctx, partial);
      if (svg) return tpl(path.join(SVG_DIR, svg + '.svg')).trim();
      const k = raw || key;
      const v = get(ctx, k);
      if (v === undefined) { warn(`${name}: missing value for "${k}"`); return ''; }
      return raw ? String(v) : esc(v);
    }
  );
}

/* ---------- Image helpers ---------- */
// Reads pixel dimensions from WebP, PNG, JPEG and SVG files (no dependencies).
function imageSize(file) {
  try {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.svg') {
      const s = read(file).slice(0, 600);
      const w = /\swidth="(\d+)/.exec(s), h = /\sheight="(\d+)/.exec(s);
      if (w && h) return { w: +w[1], h: +h[1] };
      const vb = /viewBox="[\d.\s-]+?\s([\d.]+)\s([\d.]+)"/.exec(s);
      if (vb) return { w: Math.round(vb[1]), h: Math.round(vb[2]) };
      return null;
    }
    const b = fs.readFileSync(file);
    if (ext === '.webp' && b.toString('ascii', 0, 4) === 'RIFF') {
      const chunk = b.toString('ascii', 12, 16);
      if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') {
        const b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24];
        return { w: 1 + (((b1 & 0x3f) << 8) | b0), h: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
      }
    }
    if (ext === '.png') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (ext === '.jpg' || ext === '.jpeg') {
      let i = 2;
      while (i < b.length) {
        const marker = b[i + 1], len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
        i += 2 + len;
      }
    }
  } catch { /* fall through */ }
  return null;
}

/* Builds an <img>. For WebP uploads the admin panel also saves smaller copies
   named photo-480.webp and photo-800.webp (or .jpg on browsers without WebP
   encoding); when present they go into srcset. */
function img(src, alt, { sizes = '100vw', priority = false, cls = '' } = {}) {
  if (!src) return '';
  const rel = src.replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) warn(`Image not found: ${rel}`);
  const dim = (fs.existsSync(file) && imageSize(file)) || { w: 1600, h: 1067 };
  let srcset = '';
  const m = /^(.*)\.(webp|jpe?g)$/i.exec(rel);
  if (m) {
    const parts = [480, 800]
      .filter((w) => w < dim.w && fs.existsSync(path.join(ROOT, `${m[1]}-${w}.${m[2]}`)))
      .map((w) => `/${m[1]}-${w}.${m[2]} ${w}w`);
    if (parts.length) srcset = ` srcset="${parts.join(', ')}, /${rel} ${dim.w}w" sizes="${sizes}"`;
  }
  const load = priority ? ' fetchpriority="high"' : ' loading="lazy"';
  return `<img${cls ? ` class="${cls}"` : ''} src="/${esc(rel)}"${srcset} width="${dim.w}" height="${dim.h}" alt="${esc(alt)}"${load} decoding="async">`;
}

/* ---------- Load & validate data ---------- */
function loadData() {
  const site = readJSON(path.join(ROOT, 'data', 'site.json'));
  const all = readJSON(path.join(ROOT, 'data', 'packages.json'));
  if (!Array.isArray(all)) fail('data/packages.json must be an array of packages.');
  site.url = String(site.url || '').replace(/\/+$/, '');

  const required = ['id', 'slug', 'title', 'state', 'nights', 'days', 'price', 'coverImage'];
  const seenSlug = new Set(), seenId = new Set();
  all.forEach((p, i) => {
    const label = p.title || p.slug || `package #${i + 1}`;
    for (const f of required) if (p[f] === undefined || p[f] === '') fail(`"${label}" is missing required field "${f}".`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)) fail(`"${label}" has an invalid slug "${p.slug}" (use lowercase letters, numbers and hyphens).`);
    if (seenSlug.has(p.slug)) fail(`Duplicate slug "${p.slug}". Every package needs a unique slug.`);
    if (seenId.has(p.id)) fail(`Duplicate id "${p.id}".`);
    seenSlug.add(p.slug); seenId.add(p.id);
    for (const arr of ['cities', 'themes', 'gallery', 'itinerary', 'inclusions', 'exclusions']) if (!Array.isArray(p[arr])) p[arr] = [];
    p.themes.filter((t) => !THEMES.includes(t)).forEach((t) => warn(`"${label}": unknown theme "${t}"`));
    p.salePrice = Number(p.salePrice) || 0;
    p.price = Number(p.price) || 0;
    p.minPeople = Number(p.minPeople) || 1;
    p.title = String(p.title);
  });

  const packages = all.filter((p) => p.published === true);
  return { site, packages, drafts: all.length - packages.length };
}

/* ---------- Derived package fields ---------- */
function enrich(p, site, index) {
  const sale = p.salePrice && p.salePrice < p.price ? p.salePrice : 0;
  const now = sale || p.price;
  const words = p.state.split(/\s+/).filter((w) => w !== '&');
  const code = words.length > 1 ? words.map((w) => w[0]).join('') : p.state.slice(0, 2);
  return Object.assign({}, p, {
    plainTitle: plainTitle(p.title),
    url: `/tours/${p.slug}/`,
    stateSlug: stateKey(p.state),
    stateUrl: `/states/${stateKey(p.state)}/`,
    stateShort: stateDisplay(p.state),
    priceNow: inr(now),
    priceValue: now,
    wasHtml: sale ? `<span class="price__was">${inr(p.price)}</span>` : '',
    saveHtml: sale ? `<span class="badge">Save ${inr(p.price - sale)}</span>` : '',
    metaLine: [`${p.days} days`, p.startCity, p.themes[0]].filter(Boolean).join(' · '),
    ticketNo: `No. MY-${code.toUpperCase()}-${String(index + 1).padStart(3, '0')}`
  });
}

function titleHtml(title) {
  const t = esc(title);
  if (/\*(.+?)\*/.test(t)) return t.replace(/\*(.+?)\*/, '<span class="accent">$1</span>');
  const i = t.lastIndexOf(' ');
  return i > 0 ? `${t.slice(0, i)} <span class="accent">${t.slice(i + 1)}</span>` : t;
}

function card(p, i = 0) {
  const route = (p.cities.length ? p.cities : [p.startCity]).map((c) => `<span>${esc(c)}</span>`).join('');
  return render(tpl(path.join(TPL, 'partials', 'package-card.html')), {
    i,
    image: img(p.coverImage, p.plainTitle, { sizes: '(min-width: 1080px) 400px, (min-width: 760px) 50vw, 84vw' }),
    stateShort: p.stateShort,
    flag: p.featured ? '<span class="badge badge--navy pcard__flag">Bestseller</span>' : '',
    nights: p.nights, days: p.days,
    metaLine: [p.startCity, ...p.themes.slice(0, 2)].filter(Boolean).join(' · '),
    url: p.url, title: p.plainTitle,
    routeHtml: route, wasHtml: p.wasHtml, priceNow: p.priceNow
  }, 'package-card');
}

function related(p, list) {
  return list
    .filter((o) => o.slug !== p.slug)
    .map((o) => ({ o, score: (o.state === p.state ? 10 : 0) + o.themes.filter((t) => p.themes.includes(t)).length + (o.featured ? 0.5 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.o);
}

/* ---------- Page writer ---------- */
function writePage(urlPath, html) {
  const out = path.join(DIST, ...urlPath.split('/').filter(Boolean), urlPath.endsWith('.html') ? '' : 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return out;
}

function layout(ctx, base) {
  const html = render(tpl(path.join(TPL, 'layout.html')), Object.assign({
    robots: 'index, follow, max-image-preview:large',
    ogType: 'website',
    bodyClass: '',
    preload: '',
    jsonld: '',
    afterFooter: '',
    canonical: '',
    canonicalTag: ctx.canonical ? `<link rel="canonical" href="${esc(ctx.canonical)}">` : ''
  }, base, ctx), 'layout');
  // Mark the active nav item.
  return ctx.navActive ? html.replace(`class="nav__link" href="${ctx.navActive}"`, `class="nav__link" href="${ctx.navActive}" aria-current="page"`) : html;
}

/* ---------- Build ---------- */
function build() {
  const t0 = Date.now();
  warnings.length = 0;
  cache.clear();
  const { site, packages: raw, drafts } = loadData();
  const packages = raw.map((p, i) => enrich(p, site, i));
  const abs = (u) => site.url + u;
  const wa = (text) => `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(text)}`;

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // Static folders
  fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });
  const cssOut = path.join(DIST, 'assets', 'css', 'main.css');
  fs.writeFileSync(cssOut, minifyCss(read(cssOut)));
  if (fs.existsSync(path.join(ROOT, 'images'))) fs.cpSync(path.join(ROOT, 'images'), path.join(DIST, 'images'), { recursive: true });
  if (fs.existsSync(path.join(ROOT, 'admin'))) fs.cpSync(path.join(ROOT, 'admin'), path.join(DIST, 'admin'), { recursive: true });

  const assetVersion = crypto.createHash('md5')
    .update(['css/main.css', 'js/main.js', 'js/tours.js'].map((f) => read(path.join(ROOT, 'assets', f))).join(''))
    .digest('hex').slice(0, 8);

  // The admin page is copied as-is; stamp the shared stylesheet so the long /assets cache never serves a stale copy.
  const adminHtml = path.join(DIST, 'admin', 'index.html');
  if (fs.existsSync(adminHtml)) fs.writeFileSync(adminHtml, read(adminHtml).replace('/assets/css/main.css"', `/assets/css/main.css?v=${assetVersion}"`));

  const states = [...new Set(packages.map((p) => p.state))].sort();
  const socials = Object.entries(site.socials || {}).filter(([, u]) => u);
  const base = {
    site,
    year: new Date().getFullYear(),
    assetVersion,
    phoneHref: String(site.phone).replace(/[^\d+]/g, ''),
    waGeneral: wa(site.whatsappGreeting || `Hi ${site.name}! I'd like help planning a trip.`),
    ogImage: abs('/' + String(site.defaultOgImage || '').replace(/^\/+/, '')),
    footerStates: states.map((s) => `<li><a href="/states/${stateKey(s)}/">${esc(s)} tours</a></li>`).join(''),
    socialLinks: socials.length
      ? `<div class="socials">${socials.map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" aria-label="${esc(site.name)} on ${k[0].toUpperCase() + k.slice(1)}"><svg class="icon"><use href="#i-${k}"/></svg></a>`).join('')}</div>`
      : ''
  };
  const pages = [];

  /* ----- Package pages: /tours/{slug}/ ----- */
  for (const p of packages) {
    const canonical = abs(p.url);
    const gallery = (p.gallery.length ? p.gallery : [p.coverImage]);
    const rel = related(p, packages);
    const waTripText = [
      `Hi ${site.name}! I'd like to plan this trip:`, '',
      `*${p.plainTitle}* (${p.nights}N/${p.days}D)`, 'Travel month: Flexible',
      `Travellers: ${p.minPeople} people`, '', canonical, '', 'Please share availability and the best price.'
    ].join('\n');

    const body = render(tpl(path.join(TPL, 'package.html')), Object.assign({}, base, {
      p,
      canonical,
      stateUrl: p.stateUrl,
      stateShort: p.stateShort,
      destShort: p.stateShort,
      metaLine: p.metaLine,
      titleHtml: titleHtml(p.title),
      heroImage: img(p.coverImage, p.plainTitle, { priority: true }),
      citiesLine: p.cities.join(' → ') || p.startCity,
      themesLine: p.themes.join(', ') || '—',
      themeChips: p.themes.map((t) => `<a class="chip" href="/themes/${slugify(t)}/">${esc(t)}</a>`).join('') +
        `<a class="chip" href="${p.stateUrl}">More in ${esc(p.state)}</a>`,
      galleryCount: Math.min(gallery.length, 5),
      galleryHtml: gallery.map((g, i) => `<figure class="gallery__item">${img(g, `${p.plainTitle} — photo ${i + 1}`, { sizes: i === 0 ? '(min-width: 1080px) 420px, (min-width: 760px) 50vw, 86vw' : '(min-width: 1080px) 200px, (min-width: 760px) 25vw, 86vw' })}<button type="button" data-lightbox="/${esc(g.replace(/^\/+/, ''))}" data-alt="${esc(p.plainTitle)} — photo ${i + 1}" aria-label="Open photo ${i + 1} of ${gallery.length}"></button>${i === 0 && gallery.length > 1 ? `<span class="badge badge--navy gallery__count"><svg class="icon"><use href="#i-grid"/></svg>${gallery.length} photos</span>` : ''}</figure>`).join(''),
      itineraryHtml: p.itinerary.map((d, i) => `
        <li class="journey__stop" data-reveal>
          <span class="journey__num" aria-hidden="true">${String(d.day ?? i + 1).padStart(2, '0')}</span>
          <article class="journey__card">
            <p class="meta">Day ${esc(d.day ?? i + 1)}</p>
            <h3>${esc(d.title)}</h3>
            <p>${esc(d.description)}</p>
          </article>
        </li>`).join(''),
      inclusionsHtml: p.inclusions.map((x) => `<li><span class="tick"><svg class="icon"><use href="#i-check"/></svg></span><span>${esc(x)}</span></li>`).join(''),
      exclusionsHtml: p.exclusions.map((x) => `<li><span class="tick"><svg class="icon"><use href="#i-x"/></svg></span><span>${esc(x)}</span></li>`).join(''),
      ticketNo: p.ticketNo,
      mealShort: String(p.mealPlan || '—').split(/\s[(+]/)[0],
      wasHtml: p.wasHtml,
      saveHtml: p.saveHtml,
      priceNow: p.priceNow,
      defaultPeople: Math.max(2, p.minPeople),
      waTrip: wa(waTripText),
      relatedSection: rel.length ? `
<section class="section section--cv" aria-labelledby="related-title" style="padding-bottom:0">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">Keep exploring</p>
      <h2 class="h2" id="related-title">You might also <span class="accent">love</span></h2>
    </div>
    <div class="rail">${rel.map((r, i) => card(r, i)).join('')}</div>
  </div>
</section>` : ''
    }), 'package');

    const jsonld = [
      {
        '@context': 'https://schema.org',
        '@type': 'TouristTrip',
        name: p.plainTitle,
        description: p.seoDescription || p.shortDescription,
        url: canonical,
        image: gallery.map((g) => abs('/' + g.replace(/^\/+/, ''))),
        touristType: p.themes,
        itinerary: {
          '@type': 'ItemList',
          numberOfItems: p.itinerary.length,
          itemListElement: p.itinerary.map((d, i) => ({ '@type': 'ListItem', position: i + 1, name: `Day ${d.day ?? i + 1}: ${d.title}`, description: d.description }))
        },
        offers: {
          '@type': 'Offer',
          price: p.priceValue,
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
          url: canonical,
          ...(p.updatedAt ? { validFrom: p.updatedAt } : {})
        },
        provider: { '@type': 'TravelAgency', name: site.name, url: site.url + '/', telephone: site.phone, email: site.email }
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: abs('/') },
          { '@type': 'ListItem', position: 2, name: 'Tours', item: abs('/tours/') },
          { '@type': 'ListItem', position: 3, name: p.state, item: abs(p.stateUrl) },
          { '@type': 'ListItem', position: 4, name: p.plainTitle, item: canonical }
        ]
      }
    ].map(jsonLd).join('\n  ');

    const bottombar = `
  <div class="bottombar" aria-label="Price and WhatsApp">
    <div class="price"><span class="price__label">Per person</span><span class="price__now">${p.priceNow}</span></div>
    <a class="btn btn--primary" href="${esc(wa(waTripText))}" target="_blank" rel="noopener" data-wa-link><svg class="icon"><use href="#i-whatsapp"/></svg> Plan on WhatsApp</a>
  </div>`;

    writePage(p.url, layout({
      title: p.seoTitle || `${p.plainTitle} | ${site.name}`,
      description: p.seoDescription || p.shortDescription,
      canonical,
      ogType: 'product',
      ogImage: abs('/' + p.coverImage.replace(/^\/+/, '')),
      bodyClass: 'has-hero has-bottombar',
      navActive: '/tours/',
      preload: '',
      jsonld,
      content: body,
      afterFooter: bottombar
    }, base));
    pages.push({ url: p.url, lastmod: p.updatedAt });
  }

  /* ----- Shared bits for listing pages ----- */
  const today = new Date().toISOString().slice(0, 10);
  const latest = packages.map((p) => p.updatedAt).filter(Boolean).sort().pop() || today;
  const byState = new Map();
  packages.forEach((p) => { if (!byState.has(p.state)) byState.set(p.state, []); byState.get(p.state).push(p); });
  const themesIn = (t) => packages.filter((p) => p.themes.includes(t));
  const usedThemes = THEMES.filter((t) => themesIn(t).length);
  const destinationOptions = [...new Set([...states, ...packages.flatMap((p) => p.cities)])].sort()
    .map((d) => `<option value="${esc(d)}"></option>`).join('');
  const popularLinks = [...byState.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4)
    .map(([s]) => `<a class="chip" href="/states/${stateKey(s)}/">${esc(stateDisplay(s))}</a>`).join('');
  const minPrice = (list) => Math.min(...list.map((p) => p.priceValue));
  const gridOf = (list, cls = 'cards-grid cards-grid--wide') =>
    `<ul class="${cls}" role="list">${list.map((p, i) => `<li>${card(p, i % 3)}</li>`).join('')}</ul>`;
  const ordered = (list) => list.slice().sort((a, b) => (b.featured - a.featured));
  const itemListLd = (list, name) => jsonLd({
    '@context': 'https://schema.org', '@type': 'ItemList', name,
    itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(p.url), name: p.plainTitle }))
  });
  const crumbsLd = (trail) => jsonLd({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(url) }))
  });
  const chipLinks = {
    states: states.map((s) => `<a class="chip" href="/states/${stateKey(s)}/">${esc(s)}</a>`).join(''),
    themes: usedThemes.map((t) => `<a class="chip" href="/themes/${slugify(t)}/">${esc(t)}</a>`).join('')
  };
  const listingBase = Object.assign({}, base, {
    destinationOptions, popularLinks,
    packageCount: packages.length, stateCount: states.length
  });

  /* ----- Home ----- */
  {
    const featured = packages.filter((p) => p.featured);
    const featuredList = (featured.length ? featured : packages).slice(0, 6);

    const themeTiles = HOME_THEMES.map((t, i) => {
      const info = THEME_INFO[t], n = themesIn(t).length;
      return `<li><a class="theme-tile" href="/themes/${slugify(t)}/" data-reveal style="--i:${i}">
        <div class="theme-tile__media">${img(info.image, '', { sizes: '(min-width: 1080px) 200px, (min-width: 760px) 33vw, 64vw' })}</div>
        <span class="theme-tile__no">${String(i + 1).padStart(2, '0')}</span>
        ${n ? `<span class="badge theme-tile__count">${n} ${n === 1 ? 'trip' : 'trips'}</span>` : ''}
        <span class="theme-tile__blurb">${esc(info.blurb)}</span>
        <span class="theme-tile__name">${esc(info.tile)}<svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></span>
      </a></li>`;
    }).join('');

    const stateStamps = [...byState.entries()].sort((a, b) => b[1].length - a[1].length).map(([s, list], i) => `
      <li data-reveal style="--i:${i}"><a class="state-stamp" href="/states/${stateKey(s)}/"><span class="state-stamp__in">
        <span class="meta">${list.length} ${list.length === 1 ? 'trip' : 'trips'}</span>
        <strong>${esc(stateDisplay(s))}</strong>
        <em>from ${inr(minPrice(list))}</em>
      </span></a></li>`).join('') +
      `<li data-reveal style="--i:${byState.size}"><a class="state-stamp state-stamp--soon" href="${esc(base.waGeneral)}" target="_blank" rel="noopener"><span class="state-stamp__in"><span class="meta">Anywhere else</span><strong>Custom trip →</strong></span></a></li>`;

    // Tile map of India
    const S = 64, T = 58, O = 10;
    const centre = (c, r, w = 1) => [O + c * S + (w * S - (S - T)) / 2, O + r * S + T / 2];
    const activeKeys = new Map([...byState.entries()].map(([s, l]) => [stateKey(s), l.length]));
    const home = INDIA_TILES.find((t) => t[0] === HOME_STATE);
    const [hx, hy] = centre(home[2], home[3], home[4]);
    let routes = '', tiles = '';
    INDIA_TILES.forEach(([code, name, c, r, w = 1]) => {
      const x = O + c * S, y = O + r * S, width = w * S - (S - T);
      const n = activeKeys.get(stateKey(name)) || 0;
      const isHome = code === HOME_STATE;
      const [cx, cy] = centre(c, r, w);
      const body = `<g class="tile__inner"><rect x="${x}" y="${y}" width="${width}" height="${T}" rx="10"/><text x="${cx}" y="${cy - (isHome ? 7 : 0)}">${code}</text>${isHome ? `<text x="${cx}" y="${cy + 12}" style="font-size:9px;letter-spacing:.14em">PUNE</text>` : ''}${n ? `<circle cx="${x + width - 6}" cy="${y + 6}" r="10" fill="var(--navy)"/><text x="${x + width - 6}" y="${y + 6}" style="fill:var(--white);font-size:11px">${n}</text>` : ''}</g>`;
      if (n) {
        routes += `<path class="map-route" d="M${hx} ${hy} Q${(hx + cx) / 2 + (cy - hy) * 0.25} ${(hy + cy) / 2 - (cx - hx) * 0.25} ${cx} ${cy}"/>`;
        tiles += `<a class="tile tile--on${isHome ? ' tile--home-on' : ''}" href="/states/${stateKey(name)}/" aria-label="${esc(name)}: ${n} ${n === 1 ? 'trip' : 'trips'}"><title>${esc(name)}</title>${body}</a>`;
      } else {
        tiles += `<g class="tile${isHome ? ' tile--home' : ''}" aria-hidden="true"><title>${esc(name)}</title>${body}</g>`;
      }
    });
    const indiaMap = `<svg viewBox="0 0 600 540" role="group" aria-label="Map of Indian states with tour packages">${routes}${tiles}</svg>`;

    const testimonials = (site.testimonials || []).map((t, i) => `
      <li data-reveal style="--i:${i}"><figure class="polaroid">
        <div class="polaroid__photo">${img(t.image, '', { sizes: '(min-width: 760px) 360px, 80vw' })}</div>
        <figcaption class="polaroid__trip">${esc(t.trip)}</figcaption>
        <blockquote>“${esc(t.quote)}”</blockquote>
        <footer><strong>${esc(t.name)}${t.city ? `, ${esc(t.city)}` : ''}</strong><span class="stars" aria-label="5 out of 5">${'<svg class="icon" aria-hidden="true"><use href="#i-star"/></svg>'.repeat(5)}</span></footer>
      </figure></li>`).join('');

    const body = render(tpl(path.join(TPL, 'home.html')), Object.assign({}, listingBase, {
      heroImage: img(site.heroImage || site.defaultOgImage, '', { priority: true }),
      themeOptions: usedThemes.map((t) => `<option value="${slugify(t)}">${esc(t)}</option>`).join(''),
      popularLinks,
      featuredCards: featuredList.map((p, i) => card(p, i)).join(''),
      themeTiles, stateStamps, indiaMap, testimonials,
      travellersFormatted: Number(site.stats?.travellers || 0).toLocaleString('en-IN')
    }), 'home');

    const sameAs = Object.values(site.socials || {}).filter(Boolean);
    const jsonld = [
      {
        '@context': 'https://schema.org', '@type': 'TravelAgency',
        name: site.name, url: site.url + '/', description: site.description,
        logo: abs('/assets/svg/favicon.svg'), image: base.ogImage,
        telephone: site.phone, email: site.email, priceRange: '₹₹',
        address: { '@type': 'PostalAddress', streetAddress: site.address.street || undefined, addressLocality: site.address.city, addressRegion: site.address.region, postalCode: site.address.postalCode || undefined, addressCountry: site.address.country },
        areaServed: { '@type': 'Country', name: 'India' },
        ...(sameAs.length ? { sameAs } : {})
      },
      {
        '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: site.url + '/',
        potentialAction: { '@type': 'SearchAction', target: `${site.url}/tours/?q={search_term_string}`, 'query-input': 'required name=search_term_string' }
      }
    ].map(jsonLd).join('\n  ');

    writePage('/', layout({
      title: `${site.name} — India Tour Packages | ${site.tagline}`,
      description: site.description,
      canonical: abs('/'),
      bodyClass: 'has-hero',
      jsonld,
      content: body
    }, base));
    pages.push({ url: '/', lastmod: latest, priority: '1.0' });
  }

  /* ----- All tours: /tours/ ----- */
  {
    const opt = (type, name, value, label, count) => `<label class="opt"><input type="${type}" name="${name}" value="${esc(value)}"${type === 'radio' && !value ? ' checked' : ''}><span class="opt__box"><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg></span><span class="opt__label">${esc(label)}</span>${count !== undefined ? `<span class="opt__count">${count}</span>` : ''}</label>`;
    const between = (lo, hi, v) => v >= lo && v < hi;
    const durations = [['', 'Any length'], ['1-3', '1–3 days', 1, 4], ['4-6', '4–6 days', 4, 7], ['7-99', '7+ days', 7, 100]];
    const budgets = [['', 'Any budget'], ['0-15000', 'Under ₹15,000', 0, 15000], ['15000-25000', '₹15,000 – ₹25,000', 15000, 25000], ['25000-40000', '₹25,000 – ₹40,000', 25000, 40000], ['40000-9999999', '₹40,000+', 40000, Infinity]];
    const list = ordered(packages);
    const cards = list.map((p, i) => {
      const search = [p.plainTitle, p.state, stateDisplay(p.state), p.startCity, ...p.cities, ...p.themes, p.shortDescription]
        .join(' ').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
      return `<li data-state="${stateKey(p.state)}" data-themes="${p.themes.map(slugify).join('|')}" data-days="${p.days}" data-price="${p.priceValue}" data-featured="${p.featured ? 1 : 0}" data-order="${i}" data-search="${esc(search)}">${card(p, i % 3)}</li>`;
    }).join('');

    const body = render(tpl(path.join(TPL, 'tours.html')), Object.assign({}, listingBase, {
      cards,
      stateFilters: states.map((s) => opt('checkbox', 'state', stateKey(s), s, byState.get(s).length)).join(''),
      themeFilters: usedThemes.map((t) => opt('checkbox', 'theme', slugify(t), t, themesIn(t).length)).join(''),
      durationFilters: durations.map(([v, l, lo, hi]) => opt('radio', 'days', v, l, v ? packages.filter((p) => between(lo, hi, p.days)).length : undefined)).join(''),
      budgetFilters: budgets.map(([v, l, lo, hi]) => opt('radio', 'budget', v, l, v ? packages.filter((p) => between(lo, hi, p.priceValue)).length : undefined)).join('')
    }), 'tours');

    writePage('/tours/', layout({
      title: `India Tour Packages — ${packages.length} Handpicked Trips | ${site.name}`,
      description: `Browse ${packages.length} India tour packages across ${states.length} states — pilgrimages, honeymoons, hill stations and family holidays. Filter by budget and duration.`,
      canonical: abs('/tours/'),
      navActive: '/tours/',
      bodyClass: 'has-hero',
      jsonld: [itemListLd(list, 'India tour packages'), crumbsLd([['Home', '/'], ['Tours', '/tours/']])].join('\n  '),
      content: body,
      afterFooter: `<script src="/assets/js/tours.js?v=${assetVersion}" defer></script>`
    }, base));
    pages.push({ url: '/tours/', lastmod: latest, priority: '0.9' });
  }

  /* ----- Collections: /states/{state}/ and /themes/{theme}/ ----- */
  function collection({ url, name, eyebrow, stampText, titleHtml, intro, image, heroChips, list, listTitleHtml, filterUrl, ctaName, title, description, trail }) {
    const listHtml = list.length ? gridOf(ordered(list)) : `
      <div class="empty">${tpl(path.join(SVG_DIR, 'rangoli.svg'))}
        <h2>Trips coming <span class="accent">soon</span></h2>
        <p>We are still curating ${esc(name)} packages. Message us and we'll plan one around your dates today.</p>
        <div class="empty__actions"><a class="btn btn--primary" href="${esc(wa(`Hi ${site.name}! I'm interested in a ${name} trip.`))}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-whatsapp"/></svg> Plan on WhatsApp</a><a class="btn btn--outline" href="/tours/">See all tours</a></div>
      </div>`;
    const body = render(tpl(path.join(TPL, 'collection.html')), Object.assign({}, listingBase, {
      name, eyebrow, stampText, titleHtml, intro,
      heroImage: img(image, '', { priority: true }),
      heroChips: heroChips || '',
      countLabel: list.length ? `${list.length} ${list.length === 1 ? 'trip' : 'trips'}` : 'Coming soon',
      listTitleHtml, listHtml, filterUrl, ctaName,
      stateChips: chipLinks.states, themeChips: chipLinks.themes,
      waCollection: wa(`Hi ${site.name}! I'd like to plan a ${ctaName} trip.`)
    }), 'collection');
    writePage(url, layout({
      title, description,
      canonical: abs(url),
      bodyClass: 'has-hero',
      ...(list.length ? {} : { robots: 'noindex, follow' }),
      jsonld: [list.length ? itemListLd(list, name + ' tour packages') : '', crumbsLd(trail)].filter(Boolean).join('\n  '),
      content: body
    }, base));
    if (list.length) pages.push({ url, lastmod: list.map((p) => p.updatedAt).filter(Boolean).sort().pop() || latest, priority: '0.8' });
  }

  for (const [s, list] of byState) {
    const key = stateKey(s), cities = [...new Set(list.flatMap((p) => p.cities))];
    collection({
      url: `/states/${key}/`, name: s, eyebrow: 'Tour packages', stampText: stateDisplay(s),
      titleHtml: `${esc(s)} <span class="accent">tours</span>`,
      intro: `${list.length} handpicked ${s} ${list.length === 1 ? 'package' : 'packages'}${cities.length ? ` covering ${cities.slice(0, 5).join(', ')}` : ''}. Private cabs, checked hotels and a real planner on WhatsApp.`,
      image: list[0].coverImage,
      heroChips: cities.length ? `<div class="chip-row">${cities.map((c) => `<a class="chip chip--light" href="/tours/?q=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>` : '',
      list, listTitleHtml: `Packages in <span class="accent">${esc(stateDisplay(s))}</span>`,
      filterUrl: `/tours/?state=${key}`, ctaName: s,
      title: `${s} Tour Packages from ${inr(minPrice(list))} | ${site.name}`,
      description: `Explore ${list.length} ${s} tour ${list.length === 1 ? 'package' : 'packages'}${cities.length ? ` covering ${cities.slice(0, 4).join(', ')}` : ''}. Per-person prices, day-by-day itineraries and WhatsApp planning.`,
      trail: [['Home', '/'], ['Tours', '/tours/'], [s, `/states/${key}/`]]
    });
  }

  for (const t of THEMES) {
    const key = slugify(t), info = THEME_INFO[t] || { image: site.defaultOgImage, intro: '' }, list = themesIn(t);
    collection({
      url: `/themes/${key}/`, name: t, eyebrow: 'Travel by theme', stampText: info.tile || t,
      titleHtml: `${esc(t)} <span class="accent">tours</span>`,
      intro: info.intro, image: info.image, list,
      listTitleHtml: `${esc(t)} trips we <span class="accent">love</span>`,
      filterUrl: `/tours/?theme=${key}`, ctaName: t.toLowerCase(),
      title: `${t} Tour Packages in India | ${site.name}`,
      description: `${info.intro} Browse ${list.length || 'upcoming'} ${t.toLowerCase()} tour packages with per-person prices.`,
      trail: [['Home', '/'], ['Tours', '/tours/'], [t, `/themes/${key}/`]]
    });
  }

  /* ----- Static pages ----- */
  for (const pg of STATIC_PAGES) {
    const url = `/${pg.slug}/`;
    const faqHtml = (site.faqs || []).map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(f.q)}<span class="plus" aria-hidden="true"><svg class="icon"><use href="#i-plus"/></svg></span></summary><div><p>${esc(f.a)}</p></div></details>`).join('');
    const ctx = Object.assign({}, listingBase, {
      faqHtml,
      aboutImage: img('images/kashmir-pahalgam.svg', 'Valley view on a My Yatra trip', { sizes: '(min-width: 1080px) 460px, 90vw' }),
      updatedDate: new Date(site.policiesUpdated || '2026-10-15').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    });
    const body = render(tpl(path.join(TPL, 'page.html')), Object.assign({}, ctx, {
      name: pg.name, eyebrow: pg.eyebrow, titleHtml: pg.titleHtml, lede: pg.lede,
      body: render(tpl(path.join(TPL, 'pages', pg.slug + '.html')), ctx, pg.slug)
    }), 'page');
    const ld = [crumbsLd([['Home', '/'], [pg.name, url]])];
    if (pg.slug === 'faq' && site.faqs?.length) ld.unshift(jsonLd({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: site.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
    }));
    writePage(url, layout({
      title: `${pg.title} | ${site.name}`,
      description: pg.description,
      canonical: abs(url),
      bodyClass: 'has-hero',
      navActive: url,
      jsonld: ld.join('\n  '),
      content: body
    }, base));
    pages.push({ url, lastmod: today, priority: pg.eyebrow === 'Legal' ? '0.3' : '0.6' });
  }

  /* ----- 404 ----- */
  writePage('/404.html', layout({
    title: `Page not found | ${site.name}`,
    description: site.description,
    robots: 'noindex',
    bodyClass: 'has-hero',
    content: render(tpl(path.join(TPL, '404.html')), listingBase, '404')
  }, base));

  /* ----- sitemap.xml & robots.txt ----- */
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    pages.map((p) => `  <url><loc>${esc(abs(p.url))}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}${p.priority ? `<priority>${p.priority}</priority>` : ''}</url>`).join('\n') +
    '\n</urlset>\n');
  fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${site.url}/sitemap.xml\n`);

  /* ----- Cloudflare Pages headers ----- */
  fs.writeFileSync(path.join(DIST, '_headers'), [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
    '  X-Frame-Options: SAMEORIGIN',
    '',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/assets/svg/*',
    '  Cache-Control: public, max-age=604800',
    '',
    '/images/*',
    '  Cache-Control: public, max-age=604800',
    '',
    '/admin/*',
    '  X-Robots-Tag: noindex, nofollow',
    '  Cache-Control: no-store',
    ''
  ].join('\n'));

  const ms = Date.now() - t0;
  console.log(`✔ Built ${pages.length + 1} pages (${packages.length} published packages${drafts ? `, ${drafts} draft(s) skipped` : ''}) in ${ms} ms → dist/`);
  [...new Set(warnings)].forEach((w) => console.warn('  ⚠ ' + w));
}

/* ---------- Local preview server (node build.js --serve) ---------- */
function serve(port) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
  http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(DIST, p);
    if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file)) {
      const nf = path.join(DIST, '404.html');
      res.writeHead(404, { 'Content-Type': types['.html'] });
      return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  }).listen(port, () => console.log(`\n→ Preview: http://localhost:${port}  (watching for changes, Ctrl+C to stop)\n`));

  // Rebuild in a fresh Node process so edits to build.js itself are picked up too.
  let timer;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => require('child_process').spawnSync(process.execPath, [__filename], { stdio: 'inherit' }), 150);
  };
  for (const dir of ['data', 'templates', 'assets', 'images', 'admin']) {
    const full = path.join(ROOT, dir);
    if (fs.existsSync(full)) fs.watch(full, { recursive: true }, rebuild);
  }
  fs.watch(__filename, rebuild);
}

function safeBuild() {
  try { build(); return true; }
  catch (e) { console.error('\n✖ ' + (e.userFacing ? e.message : e.stack) + '\n'); return false; }
}

const serving = process.argv.includes('--serve');
if (!safeBuild() && !serving) process.exit(1);
if (serving) {
  const i = process.argv.indexOf('--port');
  serve(i > -1 ? Number(process.argv[i + 1]) : 8080);
}
