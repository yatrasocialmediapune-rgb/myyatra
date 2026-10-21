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
// Artwork for each theme (tiles on the home page and theme page heroes). Theme names and
// descriptions in every language live in data/i18n/{lang}.json under "themes".
const THEME_IMAGES = {
  'Pilgrimage': 'images/dwarka-temple.svg',
  'Honeymoon': 'images/kashmir-houseboat.svg',
  'Family': 'images/kerala-backwaters.svg',
  'Hill Station': 'images/kerala-munnar.svg',
  'Beach': 'images/somnath-shore.svg',
  'Wildlife': 'images/kerala-thekkady.svg',
  'Weekend': 'images/kashmir-pahalgam.svg'
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

// Static pages; their text is in data/i18n/{lang}.json under "pages" and their bodies in
// templates/pages/{lang}/{slug}.html (falls back to the English body).
const STATIC_PAGES = [
  { slug: 'about' }, { slug: 'contact' }, { slug: 'faq' },
  { slug: 'privacy-policy', legal: true }, { slug: 'terms', legal: true }, { slug: 'cancellation-refund', legal: true }
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

/* ---------- Languages ----------
   Each language is generated as its own set of static pages:
   English at /, Marathi at /mr/, Hindi at /hi/. UI text lives in data/i18n/{code}.json
   (missing keys fall back to English); package and site text can be translated in the
   "translations" field of packages.json / site.json (missing fields fall back to English). */
const LANGS = [
  { code: 'en', prefix: '', locale: 'en-IN', og: 'en_IN' },
  { code: 'mr', prefix: '/mr', locale: 'mr-IN', og: 'mr_IN' },
  { code: 'hi', prefix: '/hi', locale: 'hi-IN', og: 'hi_IN' }
];
const FONTS_LATIN = 'family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..600&family=Manrope:wght@400;500;600;700;800';
const FONTS_DEVANAGARI = '&family=Mukta:wght@400;500;600;700;800&family=Noto+Serif+Devanagari:wght@500..700';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isPlural = (v) => isObj(v) && 'other' in v;
function deepMerge(base, over) {
  const out = Object.assign({}, base);
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = isObj(base[k]) && isObj(v) && !isPlural(v) ? deepMerge(base[k], v) : v;
  }
  return out;
}
function mapStrings(obj, fn) {
  if (typeof obj === 'string') return fn(obj);
  if (Array.isArray(obj)) return obj.map((v) => mapStrings(v, fn));
  if (isObj(obj)) return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, mapStrings(v, fn)]));
  return obj;
}
function loadDicts(site) {
  const dir = path.join(ROOT, 'data', 'i18n');
  const en = readJSON(path.join(dir, 'en.json'));
  const out = {};
  for (const L of LANGS) {
    const file = path.join(dir, L.code + '.json');
    const raw = L.code === 'en' ? en : deepMerge(en, fs.existsSync(file) ? readJSON(file) : {});
    const siteL = localizeSite(site, L.code);
    const globals = { brand: site.name, city: siteL.address.city, phone: site.phone, tagline: siteL.tagline };
    out[L.code] = mapStrings(raw, (s) => s.replace(/\{(brand|city|phone|tagline)\}/g, (m, k) => globals[k] ?? m));
  }
  return out;
}
function translator(dict) {
  return (key, vars = {}) => {
    let v = get(dict, key);
    if (isPlural(v)) v = Number(vars.n) === 1 ? v.one : v.other;
    if (typeof v !== 'string') { warn(`i18n: missing text "${key}"`); return key; }
    return v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  };
}
function localizeSite(site, code) {
  const tr = (site.translations || {})[code] || {};
  const s = Object.assign({}, site, { address: Object.assign({}, site.address, tr.address || {}) });
  for (const k of ['tagline', 'description', 'hours']) if (tr[k]) s[k] = tr[k];
  s.whatsappGreeting = code === 'en' ? site.whatsappGreeting : tr.whatsappGreeting;
  s.testimonials = (site.testimonials || []).map((t, i) => Object.assign({}, t, ((tr.testimonials || [])[i]) || {}));
  s.faqs = Array.isArray(tr.faqs) && tr.faqs.length ? tr.faqs : (site.faqs || []);
  return s;
}
function localizePackage(p, code) {
  if (code === 'en') return p;
  const tr = (p.translations || {})[code] || {};
  const out = Object.assign({}, p);
  for (const k of ['title', 'startCity', 'mealPlan', 'shortDescription', 'seoTitle', 'seoDescription']) if (tr[k]) out[k] = tr[k];
  for (const k of ['cities', 'inclusions', 'exclusions']) if (Array.isArray(tr[k]) && tr[k].some(Boolean)) out[k] = tr[k].filter(Boolean);
  if (Array.isArray(tr.itinerary)) {
    out.itinerary = p.itinerary.map((d, i) => Object.assign({}, d, {
      title: (tr.itinerary[i] && tr.itinerary[i].title) || d.title,
      description: (tr.itinerary[i] && tr.itinerary[i].description) || d.description
    }));
  }
  // English SEO text is not reused for other languages; it is regenerated from the translated title.
  if (!tr.seoTitle) out.seoTitle = '';
  if (!tr.seoDescription) out.seoDescription = '';
  return out;
}

/* ---------- Derived package fields (language independent) ---------- */
function enrich(p, index) {
  const sale = p.salePrice && p.salePrice < p.price ? p.salePrice : 0;
  const now = sale || p.price;
  const words = p.state.split(/\s+/).filter((w) => w !== '&');
  const code = words.length > 1 ? words.map((w) => w[0]).join('') : p.state.slice(0, 2);
  return Object.assign({}, p, {
    path: `/tours/${p.slug}/`,
    stateSlug: stateKey(p.state),
    priceNow: inr(now),
    priceWas: sale ? inr(p.price) : '',
    saveAmount: sale ? inr(p.price - sale) : '',
    priceValue: now,
    ticketCode: `MY-${code.toUpperCase()}-${String(index + 1).padStart(3, '0')}`
  });
}

function titleHtml(title) {
  const t = esc(title);
  if (/\*(.+?)\*/.test(t)) return t.replace(/\*(.+?)\*/, '<span class="accent">$1</span>');
  const i = t.lastIndexOf(' ');
  return i > 0 ? `${t.slice(0, i)} <span class="accent">${t.slice(i + 1)}</span>` : t;
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

/* ---------- Build ---------- */
function build() {
  const t0 = Date.now();
  warnings.length = 0;
  cache.clear();
  const { site, packages: raw, drafts } = loadData();
  const packagesBase = raw.map((p, i) => enrich(p, i));
  const dicts = loadDicts(site);
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

  const today = new Date().toISOString().slice(0, 10);
  const latest = packagesBase.map((p) => p.updatedAt).filter(Boolean).sort().pop() || today;
  const pages = [];

  for (const L of LANGS) {
    const d = dicts[L.code];
    const t = translator(d);
    const siteL = localizeSite(site, L.code);
    const lp = L.prefix;
    const home = lp + '/';
    const packages = packagesBase.map((p) => {
      const lpkg = localizePackage(p, L.code);
      return Object.assign(lpkg, { plainTitle: plainTitle(lpkg.title), url: lp + p.path, stateUrl: `${lp}/states/${p.stateSlug}/` });
    });

    /* ----- Localized names ----- */
    const stateName = (s) => (d.states && d.states[s]) || s;
    const stateShort = (s) => (d.statesShort && d.statesShort[s]) || stateName(s);
    const themeInfo = (th) => (d.themes && d.themes[th]) || { name: th, tile: th, blurb: '', intro: '' };
    const themeName = (th) => themeInfo(th).name;
    const nd = (p, key = 'fmt.nd') => t(key, { n: p.nights, d: p.days });
    const trips = (n) => t('fmt.trips', { n });

    const states = [...new Set(packages.map((p) => p.state))].sort();
    const socials = Object.entries(site.socials || {}).filter(([, u]) => u);
    const base = {
      site, siteL, t: d, L, lp, home,
      year: new Date().getFullYear(),
      assetVersion,
      fontUrl: `https://fonts.googleapis.com/css2?${FONTS_LATIN}${L.code === 'en' ? '' : FONTS_DEVANAGARI}&display=swap`,
      phoneHref: String(site.phone).replace(/[^\d+]/g, ''),
      waGeneral: wa(siteL.whatsappGreeting || t('wa.greeting')),
      ogImage: abs('/' + String(site.defaultOgImage || '').replace(/^\/+/, '')),
      footerStates: states.map((s) => `<li><a href="${lp}/states/${stateKey(s)}/">${esc(t('footer.stateTours', { state: stateName(s) }))}</a></li>`).join(''),
      socialLinks: socials.length
        ? `<div class="socials">${socials.map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" aria-label="${esc(t('a11y.brandOn', { network: k[0].toUpperCase() + k.slice(1) }))}"><svg class="icon"><use href="#i-${k}"/></svg></a>`).join('')}</div>`
        : '',
      jsStrings: JSON.stringify(d.js || {}).replace(/</g, '\\u003c')
    };

    const layout = (ctx) => {
      const p = ctx.path || '/';
      const langLinks = LANGS.map((l) => `<li><a href="${l.prefix + p}" hreflang="${l.locale}" lang="${l.locale}"${l === L ? ' aria-current="true"' : ''}>${esc(dicts[l.code].lang.label)}</a></li>`).join('');
      const alternates = ctx.noAlternates ? '' : LANGS.map((l) => `<link rel="alternate" hreflang="${l.locale}" href="${esc(abs(l.prefix + p))}">`).join('\n  ') +
        `\n  <link rel="alternate" hreflang="x-default" href="${esc(abs(p))}">`;
      const html = render(tpl(path.join(TPL, 'layout.html')), Object.assign({
        robots: 'index, follow, max-image-preview:large',
        ogType: 'website', bodyClass: '', preload: '', jsonld: '', afterFooter: '', canonical: '',
        canonicalTag: ctx.canonical ? `<link rel="canonical" href="${esc(ctx.canonical)}">` : '',
        langLinks, alternates
      }, base, ctx), 'layout');
      return ctx.navActive ? html.replace(`class="nav__link" href="${ctx.navActive}"`, `class="nav__link" href="${ctx.navActive}" aria-current="page"`) : html;
    };
    const addPage = (p, extra = {}) => pages.push(Object.assign({ url: lp + p }, extra));

    const card = (p, i = 0) => {
      const route = (p.cities.length ? p.cities : [p.startCity]).map((c) => `<span>${esc(c)}</span>`).join('');
      return render(tpl(path.join(TPL, 'partials', 'package-card.html')), {
        i,
        image: img(p.coverImage, p.plainTitle, { sizes: '(min-width: 1080px) 400px, (min-width: 760px) 50vw, 84vw' }),
        stateShort: stateShort(p.state),
        flag: p.featured ? `<span class="badge badge--navy pcard__flag">${esc(t('card.bestseller'))}</span>` : '',
        ndText: nd(p),
        metaLine: [p.startCity, ...p.themes.slice(0, 2).map(themeName)].filter(Boolean).join(' · '),
        url: p.url, title: p.plainTitle,
        routeHtml: route,
        wasHtml: p.priceWas ? `<span class="price__was">${p.priceWas}</span>` : '',
        priceNow: p.priceNow,
        perPersonFrom: t('card.perPersonFrom')
      }, 'package-card');
    };

    /* ----- Package pages: /tours/{slug}/ ----- */
    for (const p of packages) {
      const canonical = abs(p.url);
      const gallery = (p.gallery.length ? p.gallery : [p.coverImage]);
      const rel = related(p, packages);
      const waTripText = [
        t('wa.tripIntro'), '',
        `*${p.plainTitle}* (${nd(p, 'fmt.ndShort')})`, t('wa.month', { m: t('pkg.flexible') }),
        t('wa.travellers', { n: t('wa.people', { n: Math.max(2, p.minPeople) }) }), '', canonical, '', t('wa.closing')
      ].join('\n');

      const body = render(tpl(path.join(TPL, 'package.html')), Object.assign({}, base, {
        p,
        canonical,
        stateUrl: p.stateUrl,
        stateName: stateName(p.state),
        stateShort: stateShort(p.state),
        ndText: nd(p),
        ndShort: nd(p, 'fmt.ndShort'),
        ndLong: nd(p, 'fmt.ndLong'),
        minTravellers: t('fmt.minTravellers', { n: p.minPeople }),
        minShort: t('fmt.min', { n: p.minPeople }),
        metaLine: [t('fmt.days', { d: p.days }), p.startCity, p.themes[0] && themeName(p.themes[0])].filter(Boolean).join(' · '),
        titleHtml: titleHtml(p.title),
        heroImage: img(p.coverImage, p.plainTitle, { priority: true }),
        citiesLine: p.cities.join(' → ') || p.startCity,
        themesLine: p.themes.map(themeName).join(', ') || '—',
        themeChips: p.themes.map((th) => `<a class="chip" href="${lp}/themes/${slugify(th)}/">${esc(themeName(th))}</a>`).join('') +
          `<a class="chip" href="${p.stateUrl}">${esc(t('pkg.moreIn', { state: stateName(p.state) }))}</a>`,
        galleryCount: Math.min(gallery.length, 5),
        galleryHtml: gallery.map((g, i) => {
          const alt = t('fmt.photoAlt', { title: p.plainTitle, i: i + 1 });
          return `<figure class="gallery__item">${img(g, alt, { sizes: i === 0 ? '(min-width: 1080px) 420px, (min-width: 760px) 50vw, 86vw' : '(min-width: 1080px) 200px, (min-width: 760px) 25vw, 86vw' })}<button type="button" data-lightbox="/${esc(g.replace(/^\/+/, ''))}" data-alt="${esc(alt)}" aria-label="${esc(t('fmt.openPhoto', { i: i + 1, n: gallery.length }))}"></button>${i === 0 && gallery.length > 1 ? `<span class="badge badge--navy gallery__count"><svg class="icon"><use href="#i-grid"/></svg>${esc(t('fmt.photos', { n: gallery.length }))}</span>` : ''}</figure>`;
        }).join(''),
        itineraryHtml: p.itinerary.map((day, i) => `
        <li class="journey__stop" data-reveal>
          <span class="journey__num" aria-hidden="true">${String(day.day ?? i + 1).padStart(2, '0')}</span>
          <article class="journey__card">
            <p class="meta">${esc(t('pkg.day', { n: day.day ?? i + 1 }))}</p>
            <h3>${esc(day.title)}</h3>
            <p>${esc(day.description)}</p>
          </article>
        </li>`).join(''),
        inclusionsHtml: p.inclusions.map((x) => `<li><span class="tick"><svg class="icon"><use href="#i-check"/></svg></span><span>${esc(x)}</span></li>`).join(''),
        exclusionsHtml: p.exclusions.map((x) => `<li><span class="tick"><svg class="icon"><use href="#i-x"/></svg></span><span>${esc(x)}</span></li>`).join(''),
        ticketNo: `${t('fmt.ticketNo')} ${p.ticketCode}`,
        mealShort: String(p.mealPlan || '—').split(/\s[(+]/)[0],
        wasHtml: p.priceWas ? `<span class="price__was">${p.priceWas}</span>` : '',
        saveHtml: p.saveAmount ? `<span class="badge">${esc(t('fmt.save', { amount: p.saveAmount }))}</span>` : '',
        priceNow: p.priceNow,
        defaultPeople: Math.max(2, p.minPeople),
        waTrip: wa(waTripText),
        relatedSection: rel.length ? `
<section class="section section--cv" aria-labelledby="related-title" style="padding-bottom:0">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow">${esc(t('pkg.keepExploring'))}</p>
      <h2 class="h2" id="related-title">${t('pkg.alsoLove')}</h2>
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
          inLanguage: L.locale,
          image: gallery.map((g) => abs('/' + g.replace(/^\/+/, ''))),
          touristType: p.themes.map(themeName),
          itinerary: {
            '@type': 'ItemList',
            numberOfItems: p.itinerary.length,
            itemListElement: p.itinerary.map((day, i) => ({ '@type': 'ListItem', position: i + 1, name: `${t('pkg.day', { n: day.day ?? i + 1 })}: ${day.title}`, description: day.description }))
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
            { '@type': 'ListItem', position: 1, name: t('nav.home'), item: abs(home) },
            { '@type': 'ListItem', position: 2, name: t('nav.toursShort'), item: abs(`${lp}/tours/`) },
            { '@type': 'ListItem', position: 3, name: stateName(p.state), item: abs(p.stateUrl) },
            { '@type': 'ListItem', position: 4, name: p.plainTitle, item: canonical }
          ]
        }
      ].map(jsonLd).join('\n  ');

      const bottombar = `
  <div class="bottombar" aria-label="${esc(t('pkg.bottomAria'))}">
    <div class="price"><span class="price__label">${esc(t('card.perPerson'))}</span><span class="price__now">${p.priceNow}</span></div>
    <a class="btn btn--primary" href="${esc(wa(waTripText))}" target="_blank" rel="noopener" data-wa-link><svg class="icon"><use href="#i-whatsapp"/></svg> ${esc(t('cta.planOnWhatsApp'))}</a>
  </div>`;

      writePage(p.url, layout({
        path: p.path,
        title: p.seoTitle || `${p.plainTitle} — ${nd(p, 'fmt.ndShort')} | ${site.name}`,
        description: p.seoDescription || p.shortDescription,
        canonical,
        ogType: 'product',
        ogImage: abs('/' + p.coverImage.replace(/^\/+/, '')),
        bodyClass: 'has-hero has-bottombar',
        navActive: `${lp}/tours/`,
        jsonld,
        content: body,
        afterFooter: bottombar
      }));
      addPage(p.path, { lastmod: p.updatedAt });
    }

    /* ----- Shared bits for listing pages ----- */
    const byState = new Map();
    packages.forEach((p) => { if (!byState.has(p.state)) byState.set(p.state, []); byState.get(p.state).push(p); });
    const themesIn = (th) => packages.filter((p) => p.themes.includes(th));
    const usedThemes = THEMES.filter((th) => themesIn(th).length);
    const englishById = new Map(packagesBase.map((p) => [p.id, p]));
    const destinationOptions = [...new Set([
      ...states.map(stateName), ...packages.flatMap((p) => p.cities),
      ...(L.code === 'en' ? [] : [...states, ...packages.flatMap((p) => englishById.get(p.id).cities)])
    ])].sort((a, b) => a.localeCompare(b, L.locale)).map((x) => `<option value="${esc(x)}"></option>`).join('');
    const popularLinks = [...byState.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4)
      .map(([s]) => `<a class="chip" href="${lp}/states/${stateKey(s)}/">${esc(stateShort(s))}</a>`).join('');
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
      states: states.map((s) => `<a class="chip" href="${lp}/states/${stateKey(s)}/">${esc(stateName(s))}</a>`).join(''),
      themes: usedThemes.map((th) => `<a class="chip" href="${lp}/themes/${slugify(th)}/">${esc(themeName(th))}</a>`).join('')
    };
    const listingBase = Object.assign({}, base, {
      destinationOptions, popularLinks,
      packageCount: packages.length, stateCount: states.length
    });

    /* ----- Home ----- */
    {
      const featured = packages.filter((p) => p.featured);
      const featuredList = (featured.length ? featured : packages).slice(0, 6);

      const themeTiles = HOME_THEMES.map((th, i) => {
        const info = themeInfo(th), n = themesIn(th).length;
        return `<li><a class="theme-tile" href="${lp}/themes/${slugify(th)}/" data-reveal style="--i:${i}">
        <div class="theme-tile__media">${img(THEME_IMAGES[th], '', { sizes: '(min-width: 1080px) 200px, (min-width: 760px) 33vw, 64vw' })}</div>
        <span class="theme-tile__no">${String(i + 1).padStart(2, '0')}</span>
        ${n ? `<span class="badge theme-tile__count">${esc(trips(n))}</span>` : ''}
        <span class="theme-tile__blurb">${esc(info.blurb)}</span>
        <span class="theme-tile__name">${esc(info.tile)}<svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></span>
      </a></li>`;
      }).join('');

      const stateStamps = [...byState.entries()].sort((a, b) => b[1].length - a[1].length).map(([s, list], i) => `
      <li data-reveal style="--i:${i}"><a class="state-stamp" href="${lp}/states/${stateKey(s)}/"><span class="state-stamp__in">
        <span class="meta">${esc(trips(list.length))}</span>
        <strong>${esc(stateShort(s))}</strong>
        <em>${esc(t('fmt.from', { price: inr(minPrice(list)) }))}</em>
      </span></a></li>`).join('') +
        `<li data-reveal style="--i:${byState.size}"><a class="state-stamp state-stamp--soon" href="${esc(base.waGeneral)}" target="_blank" rel="noopener"><span class="state-stamp__in"><span class="meta">${esc(t('home.stampAnywhere'))}</span><strong>${esc(t('home.stampCustom'))}</strong></span></a></li>`;

      // Tile map of India
      const S = 64, T = 58, O = 10;
      const centre = (c, r, w = 1) => [O + c * S + (w * S - (S - T)) / 2, O + r * S + T / 2];
      const activeKeys = new Map([...byState.entries()].map(([s, l]) => [stateKey(s), l.length]));
      const homeTile = INDIA_TILES.find((x) => x[0] === HOME_STATE);
      const [hx, hy] = centre(homeTile[2], homeTile[3], homeTile[4]);
      let routes = '', tiles = '';
      INDIA_TILES.forEach(([code, name, c, r, w = 1]) => {
        const x = O + c * S, y = O + r * S, width = w * S - (S - T);
        const n = activeKeys.get(stateKey(name)) || 0;
        const isHome = code === HOME_STATE;
        const [cx, cy] = centre(c, r, w);
        const body = `<g class="tile__inner"><rect x="${x}" y="${y}" width="${width}" height="${T}" rx="10"/><text x="${cx}" y="${cy - (isHome ? 7 : 0)}">${code}</text>${isHome ? `<text x="${cx}" y="${cy + 12}" style="font-size:9px;letter-spacing:.14em">${esc(t('home.mapBaseShort'))}</text>` : ''}${n ? `<circle cx="${x + width - 6}" cy="${y + 6}" r="10" fill="var(--navy)"/><text x="${x + width - 6}" y="${y + 6}" style="fill:var(--white);font-size:11px">${n}</text>` : ''}</g>`;
        if (n) {
          routes += `<path class="map-route" d="M${hx} ${hy} Q${(hx + cx) / 2 + (cy - hy) * 0.25} ${(hy + cy) / 2 - (cx - hx) * 0.25} ${cx} ${cy}"/>`;
          tiles += `<a class="tile tile--on${isHome ? ' tile--home-on' : ''}" href="${lp}/states/${stateKey(name)}/" aria-label="${esc(stateName(name))}: ${esc(trips(n))}"><title>${esc(stateName(name))}</title>${body}</a>`;
        } else {
          tiles += `<g class="tile${isHome ? ' tile--home' : ''}" aria-hidden="true"><title>${esc(stateName(name))}</title>${body}</g>`;
        }
      });
      const indiaMap = `<svg viewBox="0 0 600 540" role="group" aria-label="${esc(t('home.mapAria'))}">${routes}${tiles}</svg>`;

      const testimonials = (siteL.testimonials || []).map((x, i) => `
      <li data-reveal style="--i:${i}"><figure class="polaroid">
        <div class="polaroid__photo">${img(x.image, '', { sizes: '(min-width: 760px) 360px, 80vw' })}</div>
        <figcaption class="polaroid__trip">${esc(x.trip)}</figcaption>
        <blockquote>“${esc(x.quote)}”</blockquote>
        <footer><strong>${esc(x.name)}${x.city ? `, ${esc(x.city)}` : ''}</strong><span class="stars" aria-label="${esc(t('a11y.fiveStars'))}">${'<svg class="icon" aria-hidden="true"><use href="#i-star"/></svg>'.repeat(5)}</span></footer>
      </figure></li>`).join('');

      const body = render(tpl(path.join(TPL, 'home.html')), Object.assign({}, listingBase, {
        heroImage: img(site.heroImage || site.defaultOgImage, '', { priority: true }),
        themeOptions: usedThemes.map((th) => `<option value="${slugify(th)}">${esc(themeName(th))}</option>`).join(''),
        popularLinks,
        viewAll: t('home.viewAll', { n: packages.length }),
        featuredCards: featuredList.map((p, i) => card(p, i)).join(''),
        themeTiles, stateStamps, indiaMap, testimonials,
        travellersFormatted: Number(site.stats?.travellers || 0).toLocaleString('en-IN')
      }), 'home');

      const sameAs = Object.values(site.socials || {}).filter(Boolean);
      const jsonld = [
        {
          '@context': 'https://schema.org', '@type': 'TravelAgency',
          name: site.name, url: site.url + '/', description: siteL.description,
          logo: abs('/assets/img/logo.webp'), image: base.ogImage,
          telephone: site.phone, email: site.email, priceRange: '₹₹',
          address: { '@type': 'PostalAddress', streetAddress: site.address.street || undefined, addressLocality: site.address.city, addressRegion: site.address.region, postalCode: site.address.postalCode || undefined, addressCountry: site.address.country },
          areaServed: { '@type': 'Country', name: 'India' },
          availableLanguage: ['en', 'mr', 'hi'],
          ...(sameAs.length ? { sameAs } : {})
        },
        {
          '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: abs(home), inLanguage: L.locale,
          potentialAction: { '@type': 'SearchAction', target: `${abs(lp)}/tours/?q={search_term_string}`, 'query-input': 'required name=search_term_string' }
        }
      ].map(jsonLd).join('\n  ');

      writePage(home, layout({
        path: '/',
        title: t('home.metaTitle'),
        description: siteL.description,
        canonical: abs(home),
        bodyClass: 'has-hero',
        jsonld,
        content: body
      }));
      addPage('/', { lastmod: latest, priority: '1.0' });
    }

    /* ----- All tours: /tours/ ----- */
    {
      const opt = (type, name, value, label, count) => `<label class="opt"><input type="${type}" name="${name}" value="${esc(value)}"${type === 'radio' && !value ? ' checked' : ''}><span class="opt__box"><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg></span><span class="opt__label">${esc(label)}</span>${count !== undefined ? `<span class="opt__count">${count}</span>` : ''}</label>`;
      const between = (lo, hi, v) => v >= lo && v < hi;
      const durations = [['', t('search.anyLength')], ['1-3', t('search.d13'), 1, 4], ['4-6', t('search.d46'), 4, 7], ['7-99', t('search.d7'), 7, 100]];
      const budgets = [['', t('tours.anyBudget')], ['0-15000', t('tours.under15'), 0, 15000], ['15000-25000', '₹15,000 – ₹25,000', 15000, 25000], ['25000-40000', '₹25,000 – ₹40,000', 25000, 40000], ['40000-9999999', '₹40,000+', 40000, Infinity]];
      const list = ordered(packages);
      const cards = list.map((p, i) => {
        const en = englishById.get(p.id);
        const search = [p.plainTitle, plainTitle(en.title), p.state, stateName(p.state), stateShort(p.state), p.startCity, en.startCity, ...p.cities, ...en.cities, ...p.themes, ...p.themes.map(themeName), p.shortDescription]
          .join(' ').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
        return `<li data-state="${p.stateSlug}" data-themes="${p.themes.map(slugify).join('|')}" data-days="${p.days}" data-price="${p.priceValue}" data-featured="${p.featured ? 1 : 0}" data-order="${i}" data-search="${esc(search)}">${card(p, i % 3)}</li>`;
      }).join('');

      const body = render(tpl(path.join(TPL, 'tours.html')), Object.assign({}, listingBase, {
        cards,
        lede: t('tours.lede', { n: packages.length, s: states.length }),
        showHtml: esc(t('tours.show', { count: '\u0000' })).replace('\u0000', `<span data-count-label>${packages.length}</span>`),
        foundHtml: esc(t('tours.found', { count: '\u0000' })).replace('\u0000', `<strong data-count-label>${packages.length}</strong>`),
        stateFilters: states.map((s) => opt('checkbox', 'state', stateKey(s), stateName(s), byState.get(s).length)).join(''),
        themeFilters: usedThemes.map((th) => opt('checkbox', 'theme', slugify(th), themeName(th), themesIn(th).length)).join(''),
        durationFilters: durations.map(([v, l, lo, hi]) => opt('radio', 'days', v, l, v ? packages.filter((p) => between(lo, hi, p.days)).length : undefined)).join(''),
        budgetFilters: budgets.map(([v, l, lo, hi]) => opt('radio', 'budget', v, l, v ? packages.filter((p) => between(lo, hi, p.priceValue)).length : undefined)).join('')
      }), 'tours');

      writePage(`${lp}/tours/`, layout({
        path: '/tours/',
        title: t('tours.metaTitle', { n: packages.length }),
        description: t('tours.metaDesc', { n: packages.length, s: states.length }),
        canonical: abs(`${lp}/tours/`),
        navActive: `${lp}/tours/`,
        bodyClass: 'has-hero',
        jsonld: [itemListLd(list, t('tours.listName')), crumbsLd([[t('nav.home'), home], [t('nav.toursShort'), `${lp}/tours/`]])].join('\n  '),
        content: body,
        afterFooter: `<script src="/assets/js/tours.js?v=${assetVersion}" defer></script>`
      }));
      addPage('/tours/', { lastmod: latest, priority: '0.9' });
    }

    /* ----- Collections: /states/{state}/ and /themes/{theme}/ ----- */
    const collection = ({ path: cpath, name, eyebrow, stampText, titleHtmlStr, intro, image, heroChips, list, listTitleHtml, filterUrl, title, description }) => {
      const url = lp + cpath;
      const listHtml = list.length ? gridOf(ordered(list)) : `
      <div class="empty">${tpl(path.join(SVG_DIR, 'rangoli.svg'))}
        <h2>${t('coll.soonTitle')}</h2>
        <p>${esc(t('coll.soonText', { name }))}</p>
        <div class="empty__actions"><a class="btn btn--primary" href="${esc(wa(t('wa.interested', { name })))}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-whatsapp"/></svg> ${esc(t('cta.planOnWhatsApp'))}</a><a class="btn btn--outline" href="${lp}/tours/">${esc(t('coll.seeAll'))}</a></div>
      </div>`;
      const body = render(tpl(path.join(TPL, 'collection.html')), Object.assign({}, listingBase, {
        name, eyebrow, stampText, titleHtml: titleHtmlStr, intro,
        heroImage: img(image, '', { priority: true }),
        heroChips: heroChips || '',
        countLabel: list.length ? trips(list.length) : t('coll.comingSoon'),
        listTitleHtml, listHtml, filterUrl,
        ctaTitle: t('coll.ctaTitle', { name: esc(name) }),
        stateChips: chipLinks.states, themeChips: chipLinks.themes,
        waCollection: wa(t('wa.collection', { name }))
      }), 'collection');
      writePage(url, layout({
        path: cpath,
        title, description,
        canonical: abs(url),
        bodyClass: 'has-hero',
        ...(list.length ? {} : { robots: 'noindex, follow' }),
        jsonld: [list.length ? itemListLd(list, t('coll.listName', { name })) : '', crumbsLd([[t('nav.home'), home], [t('nav.toursShort'), `${lp}/tours/`], [name, url]])].filter(Boolean).join('\n  '),
        content: body
      }));
      if (list.length) addPage(cpath, { lastmod: list.map((p) => p.updatedAt).filter(Boolean).sort().pop() || latest, priority: '0.8' });
    };

    for (const [s, list] of byState) {
      const key = stateKey(s), cities = [...new Set(list.flatMap((p) => p.cities))];
      const sName = stateName(s);
      const citiesTxt = cities.length ? t('coll.covering', { list: cities.slice(0, 5).join(', ') }) : '';
      collection({
        path: `/states/${key}/`, name: sName, eyebrow: t('coll.stateEyebrow'), stampText: stateShort(s),
        titleHtmlStr: t('coll.toursTitle', { name: esc(sName) }),
        intro: t('coll.stateIntro', { packages: t('fmt.packages', { n: list.length }), state: sName, cities: citiesTxt }),
        image: list[0].coverImage,
        heroChips: cities.length ? `<div class="chip-row">${cities.map((c) => `<a class="chip chip--light" href="${lp}/tours/?q=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>` : '',
        list, listTitleHtml: t('coll.packagesIn', { state: esc(stateShort(s)) }),
        filterUrl: `${lp}/tours/?state=${key}`,
        title: t('coll.stateMetaTitle', { state: sName, price: inr(minPrice(list)) }),
        description: t('coll.stateMetaDesc', { packages: t('fmt.packages', { n: list.length }), state: sName, cities: cities.length ? t('coll.covering', { list: cities.slice(0, 4).join(', ') }) : '' })
      });
    }

    for (const th of THEMES) {
      const key = slugify(th), info = themeInfo(th), list = themesIn(th);
      collection({
        path: `/themes/${key}/`, name: info.name, eyebrow: t('coll.themeEyebrow'), stampText: info.tile || info.name,
        titleHtmlStr: t('coll.toursTitle', { name: esc(info.name) }),
        intro: info.intro, image: THEME_IMAGES[th] || site.defaultOgImage, list,
        listTitleHtml: t('coll.themeList', { theme: esc(info.name) }),
        filterUrl: `${lp}/tours/?theme=${key}`,
        title: t('coll.themeMetaTitle', { theme: info.name }),
        description: t('coll.themeMetaDesc', { intro: info.intro, theme: info.name })
      });
    }

    /* ----- Static pages ----- */
    for (const pg of STATIC_PAGES) {
      const ppath = `/${pg.slug}/`, url = lp + ppath;
      const meta = (d.pages && d.pages[pg.slug]) || {};
      const own = path.join(TPL, 'pages', L.code, pg.slug + '.html');
      const bodyFile = fs.existsSync(own) ? own : path.join(TPL, 'pages', 'en', pg.slug + '.html');
      const bodyLang = bodyFile === own ? L : LANGS[0];
      const faqHtml = (siteL.faqs || []).map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(f.q)}<span class="plus" aria-hidden="true"><svg class="icon"><use href="#i-plus"/></svg></span></summary><div><p>${esc(f.a)}</p></div></details>`).join('');
      const ctx = Object.assign({}, listingBase, {
        faqHtml,
        aboutImage: img('images/kashmir-pahalgam.svg', t('pages.aboutImageAlt'), { sizes: '(min-width: 1080px) 460px, 90vw' }),
        updatedDate: new Date(site.policiesUpdated || '2026-10-15').toLocaleDateString(bodyLang.locale, { day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn' })
      });
      const body = render(tpl(path.join(TPL, 'page.html')), Object.assign({}, ctx, {
        name: meta.name, eyebrow: meta.eyebrow, titleHtml: meta.titleHtml, lede: meta.lede,
        notice: bodyLang !== L && d.pages.legalNotice ? `<p class="callout" style="max-width:72ch;margin-bottom:1.5em">${esc(d.pages.legalNotice)}</p>` : '',
        body: `<div lang="${bodyLang.locale}">${render(tpl(bodyFile), ctx, pg.slug)}</div>`
      }), 'page');
      const ld = [crumbsLd([[t('nav.home'), home], [meta.name, url]])];
      if (pg.slug === 'faq' && siteL.faqs && siteL.faqs.length) ld.unshift(jsonLd({
        '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: L.locale,
        mainEntity: siteL.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
      }));
      writePage(url, layout({
        path: ppath,
        title: `${meta.title} | ${site.name}`,
        description: meta.description,
        canonical: abs(url),
        bodyClass: 'has-hero',
        navActive: url,
        jsonld: ld.join('\n  '),
        content: body
      }));
      addPage(ppath, { lastmod: today, priority: pg.legal ? '0.3' : '0.6' });
    }

    /* ----- 404 (Cloudflare Pages serves the nearest 404.html, so each language gets one) ----- */
    writePage(`${lp}/404.html`, layout({
      path: '/',
      noAlternates: true,
      title: t('e404.metaTitle'),
      description: siteL.description,
      robots: 'noindex',
      bodyClass: 'has-hero',
      content: render(tpl(path.join(TPL, '404.html')), listingBase, '404')
    }));
  }

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
  console.log(`✔ Built ${pages.length + LANGS.length} pages in ${LANGS.length} languages (${packagesBase.length} published packages${drafts ? `, ${drafts} draft(s) skipped` : ''}) in ${ms} ms → dist/`);
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
      // Like Cloudflare Pages: serve the nearest 404.html (/mr/404.html for Marathi pages, etc.).
      const langDir = /^\/(mr|hi)\//.exec(p);
      const nf = path.join(DIST, langDir ? langDir[1] : '', '404.html');
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
