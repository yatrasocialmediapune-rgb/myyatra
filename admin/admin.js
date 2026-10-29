/* ==========================================================================
   MY YATRA — admin panel
   Vanilla JS, no dependencies. Saves by committing to GitHub; Cloudflare Pages
   rebuilds the site automatically after every commit.

   Reads use the Contents API. Writes use the Git Data API (blobs → tree →
   commit → ref) so a package and all its new photos land in ONE commit and
   trigger ONE deploy. If someone else committed in the meantime, the change is
   re-applied on top of the latest data and retried.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Constants ---------- */
  var STORE_KEY = 'myyatra.admin.v1';
  var PKG_PATH = 'data/packages.json';
  var SITE_PATH = 'data/site.json';
  var THEMES = ['Pilgrimage', 'Honeymoon', 'Family', 'Hill Station', 'Beach', 'Wildlife', 'Weekend'];
  var STATES = ['Andaman & Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra & Nagar Haveli and Daman & Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];
  var MEALS = ['Room only (EP)', 'Breakfast only (CP)', 'Breakfast & Dinner (MAP)', 'All meals (AP)'];
  var FIELD_ORDER = ['id', 'slug', 'title', 'state', 'cities', 'themes', 'nights', 'days', 'startCity', 'minPeople', 'mealPlan', 'price', 'salePrice', 'featured', 'published', 'coverImage', 'gallery', 'shortDescription', 'itinerary', 'inclusions', 'exclusions', 'seoTitle', 'seoDescription', 'updatedAt', 'translations'];
  // Extra website languages. English is the main text; these are optional translations.
  var TR_LANGS = [['mr', 'मराठी', 'Marathi'], ['hi', 'हिंदी', 'Hindi']];
  var IMG_MAX = 1600, IMG_VARIANTS = [800, 480], IMG_QUALITY = 0.82;

  /* ---------- Helpers ---------- */
  var app = document.getElementById('app');
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var slugify = function (s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); };
  var inr = function (n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); };
  var today = function () { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var plain = function (t) { return String(t || '').replace(/\*/g, ''); };
  var icon = function (id, cls) { return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#' + id + '"/></svg>'; };
  var fmtDate = function (iso) { if (!iso) return '—'; var d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso); return isNaN(d) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };
  var ago = function (iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago'; return fmtDate(iso);
  };
  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function setPath(obj, path, val) {
    var keys = path.split('.'), last = keys.pop();
    var tgt = keys.reduce(function (o, k) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; return o[k]; }, obj);
    tgt[last] = val;
  }
  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function blobToB64(blob) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1]); }; fr.onerror = rej; fr.readAsDataURL(blob); });
  }
  // Git blob SHA of a UTF-8 string — lets us track the file version without refetching.
  async function gitSha(str) {
    var body = new TextEncoder().encode(str), head = new TextEncoder().encode('blob ' + body.length + '\0');
    var all = new Uint8Array(head.length + body.length); all.set(head); all.set(body, head.length);
    var hash = await crypto.subtle.digest('SHA-1', all);
    return Array.prototype.map.call(new Uint8Array(hash), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  var toJSON = function (data) { return JSON.stringify(data, null, 2) + '\n'; };

  /* ---------- Toasts & busy overlay ---------- */
  function toast(msg, type, sub, ms) {
    var box = document.getElementById('toasts');
    var t = document.createElement('div');
    t.className = 'toast toast--' + (type || 'ok');
    t.setAttribute('role', type === 'err' ? 'alert' : 'status');
    t.innerHTML = '<div>' + msg + (sub ? '<small>' + sub + '</small>' : '') + '</div><button type="button" aria-label="Dismiss">' + icon('a-x') + '</button>';
    t.querySelector('button').onclick = function () { t.remove(); };
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || (type === 'err' ? 9000 : 6000));
  }
  var busyEl = null;
  function busy(text) {
    if (!text) { if (busyEl) busyEl.remove(); busyEl = null; return; }
    if (!busyEl) { busyEl = document.createElement('div'); busyEl.className = 'busy-overlay'; document.body.appendChild(busyEl); }
    busyEl.innerHTML = '<div><span class="spinner"></span><span>' + esc(text) + '</span></div>';
  }

  /* ---------- Config (stored only on this device) ---------- */
  function loadCfg() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch (e) { return null; } }
  function saveCfg(c) { localStorage.setItem(STORE_KEY, JSON.stringify(c)); }
  function clearCfg() { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }

  /* ---------- GitHub API ---------- */
  function GHError(status, message) { this.status = status; this.message = message; }
  GHError.prototype = Object.create(Error.prototype);

  var GH = {
    cfg: null,
    async req(path, opts) {
      opts = opts || {};
      var res;
      try {
        res = await fetch('https://api.github.com' + path, {
          method: opts.method || 'GET',
          cache: 'no-store',
          headers: Object.assign({
            Authorization: 'Bearer ' + GH.cfg.token,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          }, opts.body ? { 'Content-Type': 'application/json' } : {}),
          body: opts.body ? JSON.stringify(opts.body) : undefined
        });
      } catch (e) {
        throw new GHError(0, 'Network error — check your internet connection.');
      }
      if (res.ok) return res.status === 204 ? null : res.json();
      var data = {}; try { data = await res.json(); } catch (e) { /* ignore */ }
      var msg = data.message || res.statusText;
      if (res.status === 401) msg = 'GitHub rejected the token. It may be wrong or expired — log out and enter a new one.';
      else if (res.status === 403 && /rate limit/i.test(msg)) msg = 'GitHub rate limit reached. Please wait a few minutes.';
      else if (res.status === 403) msg = 'The token does not have permission for this. It needs "Contents: Read and write" on this repository.';
      else if (res.status === 404) msg = 'Not found on GitHub. Check the owner, repository, branch, and that the token has access to this repository.';
      throw new GHError(res.status, msg);
    },
    repo: function () { return '/repos/' + encodeURIComponent(GH.cfg.owner) + '/' + encodeURIComponent(GH.cfg.repo); },
    async getFile(path) {
      var d = await GH.req(GH.repo() + '/contents/' + path + '?ref=' + encodeURIComponent(GH.cfg.branch) + '&t=' + Date.now());
      var text = b64ToUtf8(d.content);
      var json;
      try { json = JSON.parse(text); } catch (e) { throw new GHError(0, path + ' is not valid JSON on GitHub. Fix it in the repository first.'); }
      return { json: json, sha: d.sha };
    },
    /* files: [{ path, text } | { path, base64 }] → one commit on the branch */
    async commit(files, message, onStep) {
      var base = GH.repo() + '/git';
      var branch = encodeURIComponent(GH.cfg.branch);
      var ref = await GH.req(base + '/ref/heads/' + branch);
      var head = await GH.req(base + '/commits/' + ref.object.sha);
      var tree = [];
      var imgs = files.filter(function (x) { return x.base64; }).length, n = 0;
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (onStep && f.base64) onStep('Uploading images (' + (++n) + '/' + imgs + ')…');
        var blob = await GH.req(base + '/blobs', { method: 'POST', body: f.base64 ? { content: f.base64, encoding: 'base64' } : { content: f.text, encoding: 'utf-8' } });
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
      }
      if (onStep) onStep('Committing…');
      var newTree = await GH.req(base + '/trees', { method: 'POST', body: { base_tree: head.tree.sha, tree: tree } });
      var c = await GH.req(base + '/commits', { method: 'POST', body: { message: message, tree: newTree.sha, parents: [ref.object.sha] } });
      await GH.req(base + '/refs/heads/' + branch, { method: 'PATCH', body: { sha: c.sha, force: false } });
      return c;
    }
  };

  /* ---------- App state ---------- */
  var S = {
    cfg: null,
    packages: [], pkgSha: null,
    site: {}, siteSha: null,
    commits: [],
    draft: null, draftOrig: null, slugTouched: false, daysTouched: false,
    pending: {},            // image path → { base64, url }  (uploaded this session, not yet committed)
    localUrls: {},          // image path → object URL (for previews before the site redeploys)
    dirty: false,
    siteDraft: null
  };
  var imgSrc = function (p) { return p ? (S.localUrls[p] || '/' + String(p).replace(/^\/+/, '')) : ''; };

  /* ==========================================================================
     Setup / login
     ========================================================================== */
  function renderSetup(err, values) {
    var v = values || {};
    app.innerHTML =
      '<main class="setup"><form class="setup__card" id="setup" autocomplete="off">' +
      '<div class="setup__brand"><img src="/assets/img/logo.webp" width="413" height="120" alt="My Yatra"><h1>Admin setup</h1></div>' +
      '<p>Connect this panel to the GitHub repository that holds your website. Saving here commits to GitHub and Cloudflare Pages republishes the site in about a minute.</p>' +
      (err ? '<p class="toast toast--err" style="animation:none;max-width:none">' + esc(err) + '</p>' : '') +
      '<div class="grid2">' +
      field('GitHub owner', '<input class="input" name="owner" required placeholder="your-username" value="' + esc(v.owner || '') + '" autocapitalize="off" spellcheck="false">') +
      field('Repository', '<input class="input" name="repo" required placeholder="myyatra" value="' + esc(v.repo || '') + '" autocapitalize="off" spellcheck="false">') +
      '</div>' +
      field('Branch', '<input class="input" name="branch" required value="' + esc(v.branch || 'main') + '" autocapitalize="off" spellcheck="false">') +
      field('Fine-grained personal access token', '<input class="input" name="token" type="password" required placeholder="github_pat_…" autocomplete="off" spellcheck="false">', 'Stored only in this browser on this device. Use “Log out” to remove it.') +
      '<details><summary>How do I create a token?</summary><ol>' +
      '<li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → Fine-grained tokens → Generate new token</a>.</li>' +
      '<li>Repository access: <b>Only select repositories</b> → choose this site’s repository.</li>' +
      '<li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Nothing else is needed.</li>' +
      '<li>Set an expiry (e.g. 90 days), generate, copy the token and paste it above.</li></ol></details>' +
      '<button class="btn btn--primary btn--lg btn--block" type="submit">' + icon('a-key') + ' Connect</button>' +
      '</form></main>';
    var form = $('#setup');
    if (!err) $('input[name="owner"]', form).focus();
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var cfg = {
        owner: form.owner.value.trim(), repo: form.repo.value.trim(),
        branch: form.branch.value.trim() || 'main', token: form.token.value.trim()
      };
      var btn = $('button[type="submit"]', form);
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Checking…';
      GH.cfg = cfg;
      try {
        var repo = await GH.req(GH.repo());
        if (repo.permissions && repo.permissions.push === false) throw new GHError(403, 'This token can read but not write to the repository. Give it “Contents: Read and write”.');
        await GH.req(GH.repo() + '/branches/' + encodeURIComponent(cfg.branch));
        await GH.getFile(PKG_PATH);
        saveCfg(cfg);
        start(cfg);
      } catch (ex) {
        renderSetup(ex.message || String(ex), cfg);
      }
    });
  }
  function field(label, control, hint, opts) {
    opts = opts || {};
    return '<div class="f' + (opts.cls ? ' ' + opts.cls : '') + '"' + (opts.key ? ' data-err-for="' + opts.key + '"' : '') + '>' +
      '<label' + (opts.id ? ' for="' + opts.id + '"' : '') + '><span>' + label + (opts.req ? ' <span class="req">*</span>' : '') + '</span>' + (opts.counter ? '<span class="counter" data-counter-for="' + opts.counter + '"></span>' : '') + '</label>' +
      control + (hint ? '<small>' + hint + '</small>' : '') + '<span class="f__err"></span></div>';
  }
  function logo() {
    return '<svg class="logo-mark" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="23" fill="#0B2D50"/><path d="M8.5 34C10.5 22 22 14.5 36 15.5 25 17.5 16.5 24 13.5 37.5Z" fill="#F7941D"/><g transform="translate(31.5 15) rotate(-32) scale(.95)" fill="#FFFFFF"><path d="M-8.5-1.3H6Q9.5 0 6 1.3H-8.5Q-9.5 0-8.5-1.3Z"/><path d="M-1.5-1.2-5-7.5h2.4L3-1.2Zm0 2.4L-5 7.5h2.4L3 1.2Z"/><path d="M-7.5-1.2-9.5-4.6H-8l2.5 3.4Zm0 2.4-2 3.4H-8l2.5-3.4Z"/></g></svg>';
  }

  /* ==========================================================================
     Shell & routing
     ========================================================================== */
  var NAV = [
    ['#/dashboard', 'a-dash', 'Dashboard'],
    ['#/packages', 'a-list', 'Packages'],
    ['#/new', 'a-plus', 'New'],
    ['#/settings', 'a-gear', 'Site settings']
  ];
  function renderShell() {
    app.innerHTML =
      '<div class="shell">' +
      '<aside class="side" aria-label="Admin navigation">' +
      '<a class="logo side__logo" href="#/dashboard" aria-label="Dashboard"><img src="/assets/img/logo-light.webp" width="413" height="120" alt=""><span class="meta">Admin</span></a>' +
      NAV.map(function (n) { return '<a class="nav-item" href="' + n[0] + '">' + icon(n[1]) + (n[0] === '#/new' ? 'New package' : n[2]) + '</a>'; }).join('') +
      '<div class="side__foot"><span class="side__repo">' + icon('a-key') + ' ' + esc(S.cfg.owner + '/' + S.cfg.repo) + ' · ' + esc(S.cfg.branch) + '</span>' +
      '<a href="/" target="_blank" rel="noopener">' + icon('a-ext') + ' View website</a>' +
      '<button type="button" data-action="refresh">' + icon('a-refresh') + ' Reload data</button>' +
      '<button type="button" data-action="logout">' + icon('a-out') + ' Log out / clear token</button></div>' +
      '</aside>' +
      '<div class="main"><header class="topbar" id="topbar"></header><div class="content" id="view"></div></div>' +
      '<nav class="tabbar" aria-label="Admin navigation">' +
      NAV.map(function (n) { return '<a href="' + n[0] + '"' + (n[0] === '#/new' ? ' class="tab-new"' : '') + '>' + icon(n[1]) + '<span>' + (n[0] === '#/settings' ? 'Settings' : n[2]) + '</span></a>'; }).join('') +
      '</nav></div>';
  }
  function setTop(title, actions) {
    $('#topbar').innerHTML = '<div class="topbar__brand">' + logo() + '<h1>' + title + '</h1></div><div class="topbar__actions">' + (actions || '') + '</div>';
    document.title = plain(title.replace(/<[^>]+>/g, '')) + ' · My Yatra Admin';
  }
  function markNav(hash) {
    $$('.side a.nav-item, .tabbar a').forEach(function (a) {
      var h = a.getAttribute('href');
      var on = hash === h || (h === '#/packages' && /^#\/(edit|dup)\//.test(hash));
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  var currentHash = null;
  function route() {
    var hash = location.hash || '#/dashboard';
    if (S.dirty && currentHash && hash !== currentHash) {
      if (!confirm('You have unsaved changes. Leave without saving?')) { history.replaceState(null, '', currentHash); return; }
      discardPending();
    }
    S.dirty = false;
    currentHash = hash;
    markNav(hash);
    window.scrollTo(0, 0);
    var m;
    if (hash === '#/packages') viewPackages();
    else if (hash === '#/new') viewEditor(null);
    else if ((m = /^#\/edit\/(.+)$/.exec(hash))) viewEditor(decodeURIComponent(m[1]));
    else if ((m = /^#\/dup\/(.+)$/.exec(hash))) viewEditor(decodeURIComponent(m[1]), true);
    else if (hash === '#/settings') viewSettings();
    else viewDashboard();
  }
  function discardPending() {
    Object.keys(S.pending).forEach(function (p) { delete S.pending[p]; });
  }

  async function loadData() {
    var res = await Promise.all([GH.getFile(PKG_PATH), GH.getFile(SITE_PATH)]);
    S.packages = Array.isArray(res[0].json) ? res[0].json : [];
    S.pkgSha = res[0].sha;
    S.site = res[1].json || {};
    S.siteSha = res[1].sha;
    try {
      S.commits = await GH.req(GH.repo() + '/commits?sha=' + encodeURIComponent(S.cfg.branch) + '&per_page=6');
    } catch (e) { S.commits = []; }
  }

  async function start(cfg) {
    S.cfg = cfg; GH.cfg = cfg;
    app.innerHTML = '<div class="boot"><span class="spinner"></span></div>';
    try { await loadData(); }
    catch (e) {
      if (e.status === 401 || e.status === 404) { clearCfg(); return renderSetup(e.message, cfg); }
      app.innerHTML = '<main class="setup"><div class="setup__card"><h1>Could not load data</h1><p>' + esc(e.message) + '</p><button class="btn btn--primary" onclick="location.reload()">Try again</button><button class="btn btn--ghost" data-action="logout">Log out</button></div></main>';
      return;
    }
    renderShell();
    route();
  }

  /* ==========================================================================
     Dashboard
     ========================================================================== */
  function viewDashboard() {
    setTop('Dashboard', '<a class="btn btn--primary btn--sm" href="#/new">' + icon('a-plus') + '<span>New package</span></a>');
    var P = S.packages;
    var pub = P.filter(function (p) { return p.published; }).length;
    var feat = P.filter(function (p) { return p.featured; }).length;
    var last = P.map(function (p) { return p.updatedAt; }).filter(Boolean).sort().pop();
    var recent = P.slice().sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); }).slice(0, 5);
    $('#view').innerHTML =
      '<div class="kpis">' +
      kpi('Total packages', P.length, P.length ? pub + ' live on the site' : 'Add your first trip', true) +
      kpi('Published', pub, 'Visible to visitors') +
      kpi('Drafts', P.length - pub, 'Hidden until published') +
      kpi('Featured', feat, 'Shown on the home page') +
      '</div>' +
      '<div class="dash-grid">' +
      '<section class="panel"><div class="panel__head"><div><h2>Recently updated</h2><p>Last package change: ' + fmtDate(last) + '</p></div><a class="link-arrow" href="#/packages">All packages ' + icon('i-arrow') + '</a></div>' +
      (recent.length ? '<ul class="plist">' + recent.map(row).join('') + '</ul>' : '<p class="empty-note">No packages yet.</p>') + '</section>' +
      '<section class="panel"><div class="panel__head"><div><h2>Recent activity</h2><p>Latest commits on <b>' + esc(S.cfg.branch) + '</b></p></div></div>' +
      (S.commits.length ? '<ul class="activity">' + S.commits.map(function (c) {
        return '<li><a href="' + esc(c.html_url) + '" target="_blank" rel="noopener"><b>' + esc(String(c.commit.message).split('\n')[0]) + '</b></a><small>' + esc((c.commit.author && c.commit.author.name) || '') + ' · ' + ago(c.commit.author && c.commit.author.date) + '</small></li>';
      }).join('') + '</ul>' : '<p class="empty-note">No activity found.</p>') +
      '<p class="hint">Each save creates one commit. Cloudflare Pages rebuilds the site automatically — changes are usually live in about a minute.</p></section>' +
      '</div>';
  }
  function kpi(label, val, sub, navy) {
    return '<div class="kpi' + (navy ? ' kpi--navy' : '') + '"><span class="meta">' + label + '</span><strong>' + val + '</strong><small>' + esc(sub) + '</small></div>';
  }
  function row(p) {
    var id = encodeURIComponent(p.id);
    return '<li class="prow">' +
      '<div class="prow__thumb">' + (p.coverImage ? '<img src="' + esc(imgSrc(p.coverImage)) + '" alt="" loading="lazy">' : '') + '</div>' +
      '<div class="prow__main"><a class="prow__title" href="#/edit/' + id + '">' + esc(plain(p.title) || 'Untitled') + '</a>' +
      '<div class="prow__meta"><span>' + esc(p.state || '—') + '</span><span>' + (p.nights || 0) + 'N/' + (p.days || 0) + 'D</span><span>' + inr(p.salePrice && p.salePrice < p.price ? p.salePrice : p.price) + '</span><span>Updated ' + fmtDate(p.updatedAt) + '</span></div>' +
      '<div class="prow__badges">' + (p.published ? '<span class="st st--live">Published</span>' : '<span class="st st--draft">Draft</span>') + (p.featured ? '<span class="st st--feat">' + icon('a-star') + 'Featured</span>' : '') + '</div></div>' +
      '<div class="prow__actions">' +
      '<a class="ibtn" href="#/edit/' + id + '" title="Edit" aria-label="Edit ' + esc(plain(p.title)) + '">' + icon('a-edit') + '</a>' +
      '<a class="ibtn" href="#/dup/' + id + '" title="Duplicate" aria-label="Duplicate ' + esc(plain(p.title)) + '">' + icon('a-copy') + '</a>' +
      (p.published ? '<a class="ibtn" href="/tours/' + esc(p.slug) + '/" target="_blank" rel="noopener" title="View on site" aria-label="View ' + esc(plain(p.title)) + ' on the website">' + icon('a-eye') + '</a>' : '') +
      '<button class="ibtn" type="button" data-action="delete" data-id="' + esc(p.id) + '" title="Delete" aria-label="Delete ' + esc(plain(p.title)) + '">' + icon('a-trash') + '</button>' +
      '</div></li>';
  }

  /* ==========================================================================
     Package list
     ========================================================================== */
  var listState = { q: '', state: '', status: '' };
  function viewPackages() {
    setTop('Packages', '<a class="btn btn--primary btn--sm" href="#/new">' + icon('a-plus') + '<span>New</span></a>');
    var states = Array.from(new Set(S.packages.map(function (p) { return p.state; }).filter(Boolean))).sort();
    $('#view').innerHTML =
      '<section class="panel">' +
      '<div class="filters-row">' +
      '<label class="search-input"><span class="sr-only">Search packages</span>' + icon('a-search') + '<input class="input" type="search" id="pq" placeholder="Search title, city or slug" value="' + esc(listState.q) + '"></label>' +
      '<label><span class="sr-only">Filter by state</span><select class="input" id="ps"><option value="">All states</option>' + states.map(function (s) { return '<option' + (s === listState.state ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label>' +
      '<label><span class="sr-only">Filter by status</span><select class="input" id="pst"><option value="">All statuses</option><option value="live"' + (listState.status === 'live' ? ' selected' : '') + '>Published</option><option value="draft"' + (listState.status === 'draft' ? ' selected' : '') + '>Drafts</option><option value="feat"' + (listState.status === 'feat' ? ' selected' : '') + '>Featured</option></select></label>' +
      '</div><p class="hint" id="pcount"></p><ul class="plist" id="plist"></ul></section>';
    var draw = function () {
      var q = listState.q.toLowerCase();
      var list = S.packages.filter(function (p) {
        if (listState.state && p.state !== listState.state) return false;
        if (listState.status === 'live' && !p.published) return false;
        if (listState.status === 'draft' && p.published) return false;
        if (listState.status === 'feat' && !p.featured) return false;
        if (q && [p.title, p.slug, p.state, p.startCity].concat(p.cities || []).join(' ').toLowerCase().indexOf(q) === -1) return false;
        return true;
      });
      $('#pcount').textContent = list.length + ' of ' + S.packages.length + ' packages';
      $('#plist').innerHTML = list.length ? list.map(row).join('') : '<li class="empty-note">No packages match. <a href="#/new">Create one</a>.</li>';
    };
    $('#pq').addEventListener('input', function (e) { listState.q = e.target.value; draw(); });
    $('#ps').addEventListener('change', function (e) { listState.state = e.target.value; draw(); });
    $('#pst').addEventListener('change', function (e) { listState.status = e.target.value; draw(); });
    draw();
  }

  /* ==========================================================================
     Saving packages (with conflict handling)
     ========================================================================== */
  // mutate(list) receives the LATEST packages from GitHub and returns the new list.
  async function commitPackages(mutate, message, extraFiles) {
    extraFiles = extraFiles || [];
    for (var attempt = 0; attempt < 3; attempt++) {
      busy(attempt ? 'Someone else saved just now — merging and retrying…' : 'Checking for newer changes…');
      var latest = await GH.getFile(PKG_PATH);
      if (latest.sha !== S.pkgSha && attempt === 0) toast('Packages were changed elsewhere since you opened them.', 'ok', 'Your edit was applied on top of the latest version.');
      var list = mutate(clone(Array.isArray(latest.json) ? latest.json : []));
      var text = toJSON(list);
      try {
        var commit = await GH.commit([{ path: PKG_PATH, text: text }].concat(extraFiles), message, busy);
        S.packages = list;
        S.pkgSha = await gitSha(text);
        S.commits.unshift({ html_url: commit.html_url, commit: { message: message, author: { name: 'You (admin)', date: new Date().toISOString() } } });
        S.commits = S.commits.slice(0, 6);
        busy(null);
        return commit;
      } catch (e) {
        // 422 = branch moved while we were committing (not a fast-forward). Retry on the new head.
        if (e.status === 422 && attempt < 2) continue;
        busy(null);
        throw e;
      }
    }
  }
  function upsert(pkg) {
    return function (list) {
      var clash = list.find(function (p) { return p.slug === pkg.slug && p.id !== pkg.id; });
      if (clash) throw new GHError(0, 'Another package (“' + plain(clash.title) + '”) already uses the slug “' + pkg.slug + '”. Choose a different slug.');
      var i = list.findIndex(function (p) { return p.id === pkg.id; });
      if (i > -1) list[i] = pkg; else list.push(pkg);
      return list;
    };
  }
  function savedToast(commit, extra) {
    toast('Saved ' + icon('a-check') + ' Live in ~1 minute', 'ok',
      (extra ? extra + ' ' : '') + 'Cloudflare is rebuilding the site. ' + (commit && commit.html_url ? '<a href="' + esc(commit.html_url) + '" target="_blank" rel="noopener">View commit</a>' : ''), 8000);
  }

  async function deletePackage(id) {
    var p = S.packages.find(function (x) { return x.id === id; });
    if (!p) return;
    if (!confirm('Delete “' + plain(p.title) + '”?\n\nIt will be removed from the website after the next deploy. Photos stay in the repository.')) return;
    try {
      var c = await commitPackages(function (list) { return list.filter(function (x) { return x.id !== id; }); }, 'Delete package: ' + plain(p.title) + ' (via admin)');
      savedToast(c, 'Package deleted.');
      S.dirty = false;
      if (/^#\/(edit|dup)\//.test(location.hash)) location.hash = '#/packages'; else route();
    } catch (e) { busy(null); toast('Could not delete', 'err', esc(e.message)); }
  }

  /* ==========================================================================
     Package editor
     ========================================================================== */
  function blankPackage() {
    return {
      id: '', slug: '', title: '', state: '', cities: [], themes: [], nights: 3, days: 4, startCity: '', minPeople: 2,
      mealPlan: 'Breakfast only (CP)', price: 0, salePrice: 0, featured: false, published: false, coverImage: '', gallery: [],
      shortDescription: '', itinerary: [], inclusions: [], exclusions: [], seoTitle: '', seoDescription: '', updatedAt: ''
    };
  }
  function normalise(p) {
    var b = blankPackage();
    var out = Object.assign(b, clone(p));
    ['cities', 'themes', 'gallery', 'itinerary', 'inclusions', 'exclusions'].forEach(function (k) { if (!Array.isArray(out[k])) out[k] = []; });
    return out;
  }
  function autoSlug(d) {
    var base = slugify(plain(d.title));
    return base ? base + (d.nights || d.days ? '-' + (d.nights || 0) + 'n-' + (d.days || 0) + 'd' : '') : '';
  }

  function viewEditor(id, duplicate) {
    var src = id ? S.packages.find(function (p) { return p.id === id; }) : null;
    if (id && !src) { setTop('Not found'); $('#view').innerHTML = '<section class="panel"><p>That package no longer exists. <a href="#/packages">Back to packages</a></p></section>'; return; }
    var d = normalise(src || blankPackage());
    var isNew = !src || duplicate;
    if (duplicate) {
      d.id = ''; d.title = plain(d.title) + ' (copy)'; d.published = false; d.featured = false; d.updatedAt = '';
      d.slug = autoSlug(d);
    }
    S.draft = d;
    S.isNew = isNew;
    S.slugTouched = !isNew;
    S.daysTouched = !isNew;

    setTop(isNew ? (duplicate ? 'Duplicate package' : 'New package') : esc(plain(d.title)),
      (!isNew && d.published ? '<a class="btn btn--ghost btn--sm" href="/tours/' + esc(d.slug) + '/" target="_blank" rel="noopener">' + icon('a-eye') + '<span class="hide-sm">View</span></a>' : '') +
      '<button class="btn btn--primary btn--sm" type="button" data-action="save">' + icon('a-check') + '<span>Save</span></button>');

    var v = $('#view');
    v.innerHTML =
      '<form class="editor" id="editor" novalidate>' +
      '<div class="editor__main">' +

      // Basics
      '<section class="panel"><div class="panel__head"><h2>Basics</h2></div>' +
      field('Title', '<input class="input" id="f-title" data-f="title" value="' + esc(d.title) + '" placeholder="e.g. Kerala: Tea Hills to Backwaters" maxlength="120">', 'Wrap one word in *asterisks* to highlight it in orange on the package page; otherwise the last word is highlighted.', { req: true, key: 'title', id: 'f-title' }) +
      field('URL slug', '<div class="prefix"><span>/tours/</span><input class="input" id="f-slug" data-f="slug" value="' + esc(d.slug) + '" autocapitalize="off" spellcheck="false"></div>', 'Created from the title automatically. Changing it later changes the page address.', { req: true, key: 'slug', id: 'f-slug' }) +
      '<div class="grid2">' +
      field('State', '<input class="input" id="f-state" data-f="state" list="dl-states" value="' + esc(d.state) + '" placeholder="Start typing…">', '', { req: true, key: 'state', id: 'f-state' }) +
      field('Starting city', '<input class="input" id="f-start" data-f="startCity" value="' + esc(d.startCity) + '" placeholder="e.g. Kochi">', '', { req: true, key: 'startCity', id: 'f-start' }) +
      '</div>' +
      field('Cities covered', '<div class="tags" id="tags-cities"></div>', 'Press Enter or comma after each city.', { key: 'cities' }) +
      '<div class="f" data-err-for="themes"><span class="f__label">Themes</span><div class="checks" id="themes"></div><span class="f__err"></span></div>' +
      '<div class="grid3">' +
      field('Nights', '<input class="input" id="f-nights" data-f="nights" data-type="int" type="number" inputmode="numeric" min="0" max="60" value="' + esc(d.nights) + '">', '', { req: true, key: 'nights', id: 'f-nights' }) +
      field('Days', '<input class="input" id="f-days" data-f="days" data-type="int" type="number" inputmode="numeric" min="1" max="61" value="' + esc(d.days) + '">', '', { req: true, key: 'days', id: 'f-days' }) +
      field('Min. people', '<input class="input" id="f-minp" data-f="minPeople" data-type="int" type="number" inputmode="numeric" min="1" max="99" value="' + esc(d.minPeople) + '">', '', { key: 'minPeople', id: 'f-minp' }) +
      '</div>' +
      field('Meal plan', '<input class="input" id="f-meal" data-f="mealPlan" list="dl-meals" value="' + esc(d.mealPlan) + '">', '', { key: 'mealPlan', id: 'f-meal' }) +
      '</section>' +

      // Price & visibility
      '<section class="panel"><div class="panel__head"><h2>Price &amp; visibility</h2></div>' +
      '<div class="grid2">' +
      field('Price per person (₹)', '<input class="input" id="f-price" data-f="price" data-type="int" type="number" inputmode="numeric" min="0" step="1" value="' + esc(d.price || '') + '">', 'Regular price, shown struck through when a sale price is set.', { req: true, key: 'price', id: 'f-price' }) +
      field('Sale price per person (₹)', '<input class="input" id="f-sale" data-f="salePrice" data-type="int" type="number" inputmode="numeric" min="0" step="1" value="' + esc(d.salePrice || '') + '">', '<span id="discount">Optional. Leave empty for no discount.</span>', { key: 'salePrice', id: 'f-sale' }) +
      '</div>' +
      '<div class="grid2">' +
      '<label class="toggle"><input type="checkbox" data-f="published" data-type="bool"' + (d.published ? ' checked' : '') + '><span class="toggle__track"></span><span>Published<small>Visible on the website</small></span></label>' +
      '<label class="toggle"><input type="checkbox" data-f="featured" data-type="bool"' + (d.featured ? ' checked' : '') + '><span class="toggle__track"></span><span>Featured<small>Shown on the home page</small></span></label>' +
      '</div></section>' +

      // Photos
      '<section class="panel" data-err-for="coverImage"><div class="panel__head"><div><h2>Photos</h2><p>Resized to max ' + IMG_MAX + 'px and converted to WebP in your browser before upload.</p></div></div>' +
      '<label class="dropzone" id="drop">' + icon('a-upload') + '<strong>Add photos</strong><span class="hint">Tap to choose, or drag &amp; drop. JPG, PNG, WebP or HEIC.</span><input type="file" id="file" accept="image/*" multiple class="sr-only"></label>' +
      '<ul class="thumbs" id="thumbs"></ul><span class="f__err"></span>' +
      '<p class="hint">The first photo with the orange ring is the cover. Removing a photo here only unlinks it — the file stays in the repository.</p></section>' +

      // Description
      '<section class="panel"><div class="panel__head"><h2>Description</h2></div>' +
      field('Short description', '<textarea class="input" id="f-desc" data-f="shortDescription" rows="4" maxlength="600">' + esc(d.shortDescription) + '</textarea>', 'Shown on the package page and in search results. 160–320 characters works best.', { req: true, key: 'shortDescription', id: 'f-desc', counter: 'shortDescription' }) +
      '</section>' +

      // Itinerary
      '<section class="panel" data-err-for="itinerary"><div class="panel__head"><div><h2>Day-by-day itinerary</h2><p>Days are numbered automatically.</p></div><button class="btn btn--ghost btn--sm" type="button" data-action="it-fill">Match ' + '<span id="fill-days">' + d.days + '</span> days</button></div>' +
      '<ol class="days" id="days"></ol><span class="f__err"></span>' +
      '<button class="btn btn--outline btn--block" type="button" data-action="it-add">' + icon('a-plus') + ' Add day</button></section>' +

      // Inclusions / exclusions
      '<section class="panel"><div class="panel__head"><h2>Inclusions &amp; exclusions</h2></div><div class="lists">' +
      listBlock('inclusions', 'Included', 'e.g. Daily breakfast') + listBlock('exclusions', 'Not included', 'e.g. Flights to Kochi') +
      '</div></section>' +

      // SEO
      '<section class="panel"><div class="panel__head"><div><h2>Search engines (SEO)</h2><p>Leave empty to generate from the title and description.</p></div><button class="btn btn--ghost btn--sm" type="button" data-action="seo-suggest">Suggest</button></div>' +
      field('SEO title', '<input class="input" id="f-seot" data-f="seoTitle" value="' + esc(d.seoTitle) + '" maxlength="120">', 'Aim for 50–60 characters.', { key: 'seoTitle', id: 'f-seot', counter: 'seoTitle' }) +
      field('SEO description', '<textarea class="input" id="f-seod" data-f="seoDescription" rows="3" maxlength="300">' + esc(d.seoDescription) + '</textarea>', 'Aim for 140–160 characters.', { key: 'seoDescription', id: 'f-seod', counter: 'seoDescription' }) +
      '<div class="serp" id="serp" aria-label="Google preview"></div></section>' +

      // Translations
      '<section class="panel" id="tr-panel"><div class="panel__head"><div><h2>Translations</h2><p>Marathi and Hindi text for this package. Anything left empty shows the English text on that language’s page.</p></div></div>' +
      '<div class="tabs" role="tablist" aria-label="Translation language">' + TR_LANGS.map(function (l, i) { return '<button type="button" role="tab" class="tab" data-action="tr-tab" data-lang="' + l[0] + '" aria-selected="' + (i === 0) + '">' + l[1] + ' <span class="tab__count" data-tr-count="' + l[0] + '"></span></button>'; }).join('') + '</div>' +
      '<div id="tr-body"></div></section>' +

      '<div class="savebar"><span class="savebar__dirty">Unsaved</span>' + (isNew ? '' : '<button class="btn btn--ghost" type="button" data-action="delete" data-id="' + esc(d.id) + '" aria-label="Delete package">' + icon('a-trash') + '</button>') +
      '<button class="btn btn--primary" type="button" data-action="save">' + icon('a-check') + ' Save</button></div>' +
      '</div>' +

      // Side: preview + meta
      '<aside class="editor__side">' +
      '<section class="panel preview"><details open><summary>Live card preview</summary><div id="preview" style="margin-top:12px"></div></details></section>' +
      '<section class="panel"><div class="meta-list" id="meta"></div>' +
      '<div class="side-save"><button class="btn btn--primary btn--block" type="button" data-action="save">' + icon('a-check') + ' Save &amp; publish changes</button>' +
      (isNew ? '' : '<a class="btn btn--ghost btn--block" href="#/dup/' + encodeURIComponent(d.id) + '">' + icon('a-copy') + ' Duplicate</a><button class="btn btn--danger btn--block" type="button" data-action="delete" data-id="' + esc(d.id) + '">' + icon('a-trash') + ' Delete</button>') +
      '</div></section></aside>' +
      '<datalist id="dl-states">' + STATES.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>' +
      '<datalist id="dl-meals">' + MEALS.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>' +
      '</form>';

    renderTags(); renderThemes(); renderThumbs(); renderDays(); renderList('inclusions'); renderList('exclusions');
    S.trLang = S.trLang || 'mr'; renderTr();
    refreshDerived();
    bindEditor();
    if (duplicate) markDirty();
  }

  function listBlock(name, label, ph) {
    return '<div class="f"><span class="f__label">' + label + '</span><ul class="li-rows" id="list-' + name + '"></ul>' +
      '<div class="li-add"><input class="input" data-li-new="' + name + '" placeholder="' + esc(ph) + '" aria-label="Add to ' + label.toLowerCase() + '"><button class="btn btn--outline btn--sm" type="button" data-action="li-add" data-list="' + name + '">' + icon('a-plus') + ' Add</button></div></div>';
  }

  /* ----- Dynamic sections ----- */
  function renderTags() {
    var box = $('#tags-cities');
    box.innerHTML = S.draft.cities.map(function (c, i) {
      return '<span class="tag">' + esc(c) + '<button type="button" data-action="tag-remove" data-idx="' + i + '" aria-label="Remove ' + esc(c) + '">' + icon('a-x') + '</button></span>';
    }).join('') + '<input id="tag-input" placeholder="' + (S.draft.cities.length ? 'Add city' : 'e.g. Munnar') + '" aria-label="Add city">';
  }
  function renderThemes() {
    $('#themes').innerHTML = THEMES.map(function (t) {
      return '<label class="check-chip"><input type="checkbox" data-theme="' + esc(t) + '"' + (S.draft.themes.indexOf(t) > -1 ? ' checked' : '') + '><span>' + esc(t) + '</span></label>';
    }).join('');
  }
  function renderThumbs(busyCount) {
    var d = S.draft;
    if (d.coverImage && d.gallery.indexOf(d.coverImage) === -1) d.gallery.unshift(d.coverImage);
    $('#thumbs').innerHTML = d.gallery.map(function (g, i) {
      var cover = g === d.coverImage;
      return '<li class="thumb' + (cover ? ' is-cover' : '') + '"><div class="thumb__img"><img src="' + esc(imgSrc(g)) + '" alt="Photo ' + (i + 1) + '" loading="lazy"></div>' +
        (cover ? '<span class="badge thumb__cover">Cover</span>' : '') + (S.pending[g] ? '<span class="badge badge--navy thumb__new">New</span>' : '') +
        '<div class="thumb__bar">' +
        '<button class="ibtn" type="button" data-action="img-left" data-idx="' + i + '" aria-label="Move left"' + (i === 0 ? ' disabled' : '') + '>' + icon('a-left') + '</button>' +
        '<button class="ibtn" type="button" data-action="img-cover" data-idx="' + i + '" aria-label="Set as cover" title="Set as cover"' + (cover ? ' disabled' : '') + '>' + icon('a-star') + '</button>' +
        '<button class="ibtn" type="button" data-action="img-remove" data-idx="' + i + '" aria-label="Remove photo" title="Remove">' + icon('a-trash') + '</button>' +
        '<button class="ibtn" type="button" data-action="img-right" data-idx="' + i + '" aria-label="Move right"' + (i === d.gallery.length - 1 ? ' disabled' : '') + '>' + icon('a-right') + '</button>' +
        '</div></li>';
    }).join('') + (busyCount ? Array.from({ length: busyCount }, function () { return '<li class="thumb thumb--busy"><div class="thumb__img"><span class="spinner"></span>Optimising…</div></li>'; }).join('') : '');
  }
  function renderDays() {
    var d = S.draft;
    $('#days').innerHTML = d.itinerary.length ? d.itinerary.map(function (day, i) {
      return '<li class="day"><span class="day__num" aria-hidden="true">' + (i + 1) + '</span>' +
        '<div class="day__tools"><span class="meta" style="margin-right:auto;align-self:center">Day ' + (i + 1) + '</span>' +
        '<button class="ibtn" type="button" data-action="it-up" data-idx="' + i + '" aria-label="Move day ' + (i + 1) + ' up"' + (i === 0 ? ' disabled' : '') + '>' + icon('a-up') + '</button>' +
        '<button class="ibtn" type="button" data-action="it-down" data-idx="' + i + '" aria-label="Move day ' + (i + 1) + ' down"' + (i === d.itinerary.length - 1 ? ' disabled' : '') + '>' + icon('a-down') + '</button>' +
        '<button class="ibtn" type="button" data-action="it-remove" data-idx="' + i + '" aria-label="Remove day ' + (i + 1) + '">' + icon('a-trash') + '</button></div>' +
        '<input class="input" data-it="title" data-idx="' + i + '" value="' + esc(day.title) + '" placeholder="Title, e.g. Kochi → Munnar · Into the hills" aria-label="Day ' + (i + 1) + ' title">' +
        '<textarea class="input" data-it="description" data-idx="' + i + '" rows="3" placeholder="What happens on this day?" aria-label="Day ' + (i + 1) + ' description">' + esc(day.description) + '</textarea></li>';
    }).join('') : '<li class="empty-note">No days yet. Use “Match days” or “Add day”.</li>';
  }
  function renderList(name) {
    $('#list-' + name).innerHTML = S.draft[name].map(function (x, i) {
      return '<li class="li-row"><input class="input" data-li="' + name + '" data-idx="' + i + '" value="' + esc(x) + '" aria-label="' + name + ' item ' + (i + 1) + '"><button class="ibtn" type="button" data-action="li-remove" data-list="' + name + '" data-idx="' + i + '" aria-label="Remove item">' + icon('a-x') + '</button></li>';
    }).join('');
  }
  function renderPreview() {
    var d = S.draft;
    var sale = d.salePrice && d.salePrice < d.price ? d.salePrice : 0;
    var meta = [d.startCity].concat(d.themes.slice(0, 2)).filter(Boolean).join(' · ');
    var route = (d.cities.length ? d.cities : [d.startCity || 'City']).map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('');
    $('#preview').innerHTML =
      '<article class="pcard"><div class="pcard__media">' +
      (d.coverImage ? '<img src="' + esc(imgSrc(d.coverImage)) + '" alt="">' : '<div style="display:grid;place-items:center;height:100%;color:var(--navy-700)">' + icon('a-image') + '</div>') +
      '<span class="stamp"><span>' + esc(stateShort(d.state) || 'State') + '</span></span>' +
      (d.featured ? '<span class="badge badge--navy pcard__flag">Bestseller</span>' : '') +
      '<span class="pcard__duration">' + icon('i-clock') + (d.nights || 0) + 'N / ' + (d.days || 0) + 'D</span></div>' +
      '<div class="pcard__body"><p class="meta">' + esc(meta || 'City · Theme') + '</p><h3 class="pcard__title">' + esc(plain(d.title) || 'Package title') + '</h3><p class="pcard__route">' + route + '</p></div>' +
      '<div class="pcard__stub"><div class="price"><span class="price__label">Per person from</span>' + (sale ? '<span class="price__was">' + inr(d.price) + '</span>' : '') + '<span class="price__now">' + inr(sale || d.price) + '</span></div><span class="pcard__go" aria-hidden="true">' + icon('i-arrow') + '</span></div></article>' +
      '<p class="hint" style="text-align:center">' + (d.published ? 'Will be visible on the website.' : 'Draft — hidden from the website.') + '</p>';
  }
  function stateShort(s) { return { 'Jammu & Kashmir': 'Kashmir', 'Andaman & Nicobar Islands': 'Andaman', 'Himachal Pradesh': 'Himachal', 'Arunachal Pradesh': 'Arunachal', 'Andhra Pradesh': 'Andhra' }[s] || s; }
  function suggestSeo(d) {
    var dur = (d.nights || 0) + 'N/' + (d.days || 0) + 'D';
    var place = stateShort(d.state) || '';
    var title = (place ? place + ' Tour Package ' : plain(d.title) + ' ') + dur + (d.cities.length ? ' – ' + d.cities.slice(0, 3).join(', ') : '') + ' | ' + (S.site.name || 'My Yatra');
    var desc = d.nights + ' nights / ' + d.days + ' days ' + (place ? place + ' tour' : 'tour') + (d.cities.length ? ' covering ' + d.cities.slice(0, 4).join(', ') : '') + '. ' + (d.mealPlan ? d.mealPlan + '. ' : '') + 'Plan on WhatsApp.';
    return { title: title.slice(0, 120), desc: desc.slice(0, 300) };
  }
  function refreshDerived() {
    var d = S.draft;
    renderPreview();
    [['shortDescription', 160, 320], ['seoTitle', 0, 60], ['seoDescription', 0, 160]].forEach(function (c) {
      var el = $('[data-counter-for="' + c[0] + '"]'); if (!el) return;
      var n = String(d[c[0]] || '').length;
      el.textContent = n + (c[2] ? ' / ' + c[2] : '');
      el.classList.toggle('is-over', n > c[2]);
    });
    var sug = suggestSeo(d);
    var url = (S.site.url || 'https://myyatra.co.in').replace(/\/+$/, '') + '/tours/' + (d.slug || 'your-slug') + '/';
    $('#serp').innerHTML = '<span class="serp__url">' + esc(url) + '</span><span class="serp__title">' + esc(d.seoTitle || sug.title) + '</span><span class="serp__desc">' + esc(d.seoDescription || d.shortDescription || sug.desc) + '</span>';
    var disc = $('#discount');
    if (disc) disc.textContent = d.salePrice && d.price && d.salePrice < d.price ? 'Saving ' + inr(d.price - d.salePrice) + ' (' + Math.round((1 - d.salePrice / d.price) * 100) + '% off)' : (d.salePrice && d.salePrice >= d.price ? 'Sale price must be lower than the price to show a discount.' : 'Optional. Leave empty for no discount.');
    var fd = $('#fill-days'); if (fd) fd.textContent = d.days || 0;
    $('#meta').innerHTML =
      '<span>ID: <b>' + esc(d.id || 'assigned on first save') + '</b></span>' +
      '<span>Last updated: <b>' + fmtDate(d.updatedAt) + '</b></span>' +
      '<span>Status: <b>' + (d.published ? 'Published' : 'Draft') + (d.featured ? ' · Featured' : '') + '</b></span>' +
      '<span>Photos: <b>' + d.gallery.length + '</b>' + (Object.keys(S.pending).length ? ' (' + Object.keys(S.pending).length + ' new, uploaded on save)' : '') + '</span>';
  }
  function markDirty() {
    S.dirty = true;
    $('#editor') && $('#editor').classList.add('is-dirty');
  }

  /* ----- Editor events ----- */
  var rafId = 0;
  function bindEditor() {
    var form = $('#editor');
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    form.addEventListener('input', function (e) {
      var t = e.target, d = S.draft;
      if (t.dataset.f) {
        var key = t.dataset.f, val = t.dataset.type === 'bool' ? t.checked : t.dataset.type === 'int' ? (t.value === '' ? 0 : Math.max(0, parseInt(t.value, 10) || 0)) : t.value;
        d[key] = val;
        if (key === 'slug') { S.slugTouched = true; }
        if (key === 'days') S.daysTouched = true;
        if (key === 'nights' && !S.daysTouched) { d.days = val + 1; $('#f-days').value = d.days; clearErr($('#f-days')); }
        if ((key === 'title' || key === 'nights' || key === 'days') && !S.slugTouched) { d.slug = autoSlug(d); $('#f-slug').value = d.slug; clearErr($('#f-slug')); }
        clearErr(t);
      } else if (t.dataset.it) {
        d.itinerary[+t.dataset.idx][t.dataset.it] = t.value;
      } else if (t.dataset.tr) {
        setTr(t.dataset.tr, t.dataset.kind, t.value, t.dataset.idx);
        updateTrCounts();
      } else if (t.dataset.li) {
        d[t.dataset.li][+t.dataset.idx] = t.value;
      } else if (t.dataset.theme) {
        var th = t.dataset.theme, i = d.themes.indexOf(th);
        if (t.checked && i === -1) d.themes.push(th); else if (!t.checked && i > -1) d.themes.splice(i, 1);
        d.themes.sort(function (a, b) { return THEMES.indexOf(a) - THEMES.indexOf(b); });
      } else return;
      markDirty();
      cancelAnimationFrame(rafId); rafId = requestAnimationFrame(refreshDerived);
    });

    // Cities tag input
    form.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t.id === 'tag-input') {
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(t.value); }
        else if (e.key === 'Backspace' && !t.value && S.draft.cities.length) { S.draft.cities.pop(); renderTags(); $('#tag-input').focus(); markDirty(); refreshDerived(); }
      } else if (t.dataset.liNew && e.key === 'Enter') { e.preventDefault(); addListItem(t.dataset.liNew); }
      else if (e.key === 'Enter' && t.tagName === 'INPUT') e.preventDefault();
    });
    form.addEventListener('focusout', function (e) { if (e.target.id === 'tag-input' && e.target.value.trim()) addTag(e.target.value); });
    form.addEventListener('paste', function (e) {
      if (e.target.id !== 'tag-input') return;
      var text = (e.clipboardData || window.clipboardData).getData('text');
      if (/[,\n]/.test(text)) { e.preventDefault(); addTag(text); }
    });

    // Photos
    var file = $('#file'), drop = $('#drop');
    file.addEventListener('change', function () { handleFiles(file.files); file.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files); });
  }
  function addTag(text) {
    var added = String(text).split(/[,\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
    added.forEach(function (c) { if (S.draft.cities.indexOf(c) === -1) S.draft.cities.push(c); });
    renderTags(); $('#tag-input').focus(); clearErr($('#tags-cities'));
    if (added.length) { markDirty(); refreshDerived(); }
  }
  function addListItem(name) {
    var inp = $('[data-li-new="' + name + '"]');
    var v = inp.value.trim(); if (!v) { inp.focus(); return; }
    S.draft[name].push(v); inp.value = '';
    renderList(name); inp.focus(); markDirty();
  }

  /* ----- Image processing: resize + WebP in the browser ----- */
  var webpOK = null;
  function canEncodeWebp() {
    if (webpOK === null) { var c = document.createElement('canvas'); c.width = c.height = 1; webpOK = c.toDataURL('image/webp').indexOf('data:image/webp') === 0; }
    return webpOK;
  }
  function loadImage(fileObj) {
    if (window.createImageBitmap) return createImageBitmap(fileObj, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(fileObj); }).catch(viaImg);
    return viaImg();
    function viaImg() {
      return new Promise(function (res, rej) {
        var url = URL.createObjectURL(fileObj), im = new Image();
        im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('This file could not be read as an image.')); };
        im.src = url;
      });
    }
  }
  function encode(src, w, h, mime) {
    return new Promise(function (res, rej) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, w, h);
      c.toBlob(function (b) { b ? res(b) : rej(new Error('Image encoding failed.')); }, mime, IMG_QUALITY);
    });
  }
  async function processImage(f, baseName) {
    if (f.size > 40 * 1024 * 1024) throw new Error(f.name + ' is larger than 40 MB.');
    var src = await loadImage(f);
    var W = src.width, H = src.height;
    var scale = Math.min(1, IMG_MAX / Math.max(W, H));
    var w = Math.round(W * scale), h = Math.round(H * scale);
    var webp = canEncodeWebp(), mime = webp ? 'image/webp' : 'image/jpeg', ext = webp ? 'webp' : 'jpg';
    var name = (baseName || 'photo') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    var main = await encode(src, w, h, mime);
    var out = [{ path: 'images/' + name + '.' + ext, blob: main }];
    for (var i = 0; i < IMG_VARIANTS.length; i++) {
      var vw = IMG_VARIANTS[i];
      if (w > vw) out.push({ path: 'images/' + name + '-' + vw + '.' + ext, blob: await encode(src, vw, Math.round(h * vw / w), mime) });
    }
    if (src.close) src.close();
    for (var j = 0; j < out.length; j++) out[j].base64 = await blobToB64(out[j].blob);
    return { path: out[0].path, url: URL.createObjectURL(main), files: out, kb: Math.round(main.size / 1024), webp: webp };
  }
  async function handleFiles(list) {
    var files = Array.prototype.filter.call(list, function (f) { return /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name); });
    if (!files.length) return;
    var d = S.draft;
    var base = slugify(d.slug || plain(d.title) || d.state || 'photo').slice(0, 50) || 'photo';
    renderThumbs(files.length);
    var done = 0, fellBack = false;
    for (var i = 0; i < files.length; i++) {
      try {
        var r = await processImage(files[i], base);
        r.files.forEach(function (f) { S.pending[f.path] = { base64: f.base64, group: r.path }; });
        S.localUrls[r.path] = r.url;
        d.gallery.push(r.path);
        if (!d.coverImage) d.coverImage = r.path;
        if (!r.webp) fellBack = true;
        done++;
        renderThumbs(files.length - i - 1);
      } catch (e) {
        toast('Could not process ' + esc(files[i].name), 'err', esc(e.message));
        renderThumbs(files.length - i - 1);
      }
    }
    renderThumbs();
    if (done) { markDirty(); refreshDerived(); clearErr($('#thumbs')); toast(done + (done === 1 ? ' photo' : ' photos') + ' ready', 'ok', 'They upload when you save.' + (fellBack ? ' This browser cannot create WebP, so JPEG was used.' : ''), 4000); }
  }
  function pendingFilesFor(gallery) {
    return Object.keys(S.pending).filter(function (p) { return gallery.indexOf(S.pending[p].group) > -1; })
      .map(function (p) { return { path: p, base64: S.pending[p].base64 }; });
  }

  /* ----- Validation & save ----- */
  function clearErr(el) { var f = el && el.closest('[data-err-for]'); if (f) f.classList.remove('is-invalid'); }
  function showErrors(errs) {
    $$('[data-err-for].is-invalid').forEach(function (f) { f.classList.remove('is-invalid'); });
    errs.forEach(function (e) {
      var f = $('[data-err-for="' + e[0] + '"]');
      if (f) { f.classList.add('is-invalid'); var m = $('.f__err', f); if (m) m.textContent = e[1]; }
    });
    var first = errs.length && $('[data-err-for="' + errs[0][0] + '"]');
    if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); var inp = $('input, textarea', first); if (inp) setTimeout(function () { inp.focus({ preventScroll: true }); }, 350); }
  }
  function cleanDraft(d) {
    var out = {};
    var t = function (s) { return String(s == null ? '' : s).trim(); };
    var p = clone(d);
    p.title = t(p.title); p.slug = slugify(p.slug); p.state = t(p.state); p.startCity = t(p.startCity); p.mealPlan = t(p.mealPlan);
    p.shortDescription = t(p.shortDescription); p.seoTitle = t(p.seoTitle); p.seoDescription = t(p.seoDescription);
    p.cities = p.cities.map(t).filter(Boolean);
    p.inclusions = p.inclusions.map(t).filter(Boolean);
    p.exclusions = p.exclusions.map(t).filter(Boolean);
    var keptDays = [];
    p.itinerary = p.itinerary.map(function (x, i) { return { day: i + 1, title: t(x.title), description: t(x.description), _i: i }; }).filter(function (x) { return x.title || x.description; })
      .map(function (x, i) { keptDays.push(x._i); delete x._i; x.day = i + 1; return x; });
    // Translations: drop empty fields; keep translated days aligned with the English days that remain.
    var trOut = {};
    Object.keys(p.translations || {}).forEach(function (lang) {
      var src = p.translations[lang] || {}, o = {};
      ['title', 'startCity', 'mealPlan', 'shortDescription', 'seoTitle', 'seoDescription'].forEach(function (k) { if (t(src[k])) o[k] = t(src[k]); });
      ['cities', 'inclusions', 'exclusions'].forEach(function (k) { var a = (src[k] || []).map(t).filter(Boolean); if (a.length) o[k] = a; });
      var days = keptDays.map(function (i) { var x = (src.itinerary || [])[i] || {}; return { title: t(x.title), description: t(x.description) }; });
      if (days.some(function (x) { return x.title || x.description; })) o.itinerary = days;
      if (Object.keys(o).length) trOut[lang] = o;
    });
    p.translations = Object.keys(trOut).length ? trOut : undefined;
    p.gallery = p.gallery.filter(Boolean);
    if (p.gallery.length && p.gallery.indexOf(p.coverImage) === -1) p.coverImage = p.gallery[0];
    if (!p.gallery.length) p.coverImage = '';
    ['nights', 'days', 'minPeople', 'price', 'salePrice'].forEach(function (k) { p[k] = Math.max(0, parseInt(p[k], 10) || 0); });
    p.featured = !!p.featured; p.published = !!p.published;
    FIELD_ORDER.forEach(function (k) { if (p[k] !== undefined) out[k] = p[k]; });
    return out;
  }

  /* ----- Package translations (Marathi / Hindi) ----- */
  function trObj(lang) {
    var d = S.draft;
    if (!d.translations || typeof d.translations !== 'object') d.translations = {};
    if (!d.translations[lang]) d.translations[lang] = {};
    return d.translations[lang];
  }
  function eachTrDays(fn) {
    var tr = S.draft.translations || {};
    Object.keys(tr).forEach(function (lang) { if (Array.isArray(tr[lang].itinerary)) fn(tr[lang].itinerary); });
  }
  function setTr(path, kind, value, idx) {
    var parts = path.split('.'), o = trObj(parts[0]), key = parts[1];
    if (kind === 'lines') o[key] = value.split('\n');
    else if (kind === 'csv') o[key] = value.split(',').map(function (s) { return s.trim(); });
    else if (kind === 'day') {
      if (!Array.isArray(o.itinerary)) o.itinerary = [];
      while (o.itinerary.length <= +idx) o.itinerary.push({ title: '', description: '' });
      o.itinerary[+idx][key] = value;
    } else o[key] = value;
  }
  function trFilled(lang) {
    var d = S.draft, o = (d.translations || {})[lang] || {}, total = 0, done = 0;
    var has = function (v) { return Array.isArray(v) ? v.some(function (x) { return String(x || '').trim(); }) : String(v || '').trim(); };
    ['title', 'shortDescription', 'startCity', 'mealPlan', 'cities', 'inclusions', 'exclusions'].forEach(function (k) { if (has(d[k])) { total++; if (has(o[k])) done++; } });
    d.itinerary.forEach(function (day, i) { total++; var x = (o.itinerary || [])[i] || {}; if (String(x.title || '').trim() && String(x.description || '').trim()) done++; });
    return [done, total];
  }
  function updateTrCounts() {
    TR_LANGS.forEach(function (l) {
      var el = $('[data-tr-count="' + l[0] + '"]'); if (!el) return;
      var c = trFilled(l[0]);
      el.textContent = c[0] + '/' + c[1];
      el.classList.toggle('is-done', c[1] > 0 && c[0] === c[1]);
    });
  }
  function renderTr() {
    var box = $('#tr-body'); if (!box) return;
    var lang = S.trLang || 'mr', d = S.draft, o = (d.translations || {})[lang] || {};
    var name = TR_LANGS.filter(function (l) { return l[0] === lang; })[0];
    var ref = function (txt) { return txt ? '<small class="tr-ref"><b>English:</b> ' + esc(String(txt).slice(0, 220)) + (String(txt).length > 220 ? '…' : '') + '</small>' : ''; };
    var inp = function (key, label, eng, area, rows) {
      return '<div class="f"><label for="tr-' + key + '">' + label + '</label>' +
        (area ? '<textarea class="input" id="tr-' + key + '" rows="' + (rows || 3) + '" data-tr="' + lang + '.' + key + '" lang="' + lang + '">' + esc(o[key] || '') + '</textarea>'
          : '<input class="input" id="tr-' + key + '" data-tr="' + lang + '.' + key + '" lang="' + lang + '" value="' + esc(o[key] || '') + '">') + ref(eng) + '</div>';
    };
    var lines = function (key, label, eng) {
      return '<div class="f"><label for="tr-' + key + '">' + label + ' <span class="hint">(one per line)</span></label><textarea class="input" id="tr-' + key + '" rows="' + Math.max(3, eng.length) + '" data-tr="' + lang + '.' + key + '" data-kind="lines" lang="' + lang + '">' + esc((o[key] || []).join('\n')) + '</textarea>' + ref(eng.join(' · ')) + '</div>';
    };
    box.innerHTML =
      '<p class="hint">Writing the ' + name[2] + ' (' + name[1] + ') version. Days follow the English order — reorder days in the itinerary above and the translations move with them.</p>' +
      inp('title', 'Title', d.title) +
      '<div class="grid2">' + inp('startCity', 'Starting city', d.startCity) + inp('mealPlan', 'Meal plan', d.mealPlan) + '</div>' +
      '<div class="f"><label for="tr-cities">Cities covered <span class="hint">(comma separated)</span></label><input class="input" id="tr-cities" data-tr="' + lang + '.cities" data-kind="csv" lang="' + lang + '" value="' + esc((o.cities || []).join(', ')) + '">' + ref(d.cities.join(', ')) + '</div>' +
      inp('shortDescription', 'Short description', d.shortDescription, true, 4) +
      '<div class="f"><span class="f__label">Day-by-day itinerary</span><ol class="days">' +
      (d.itinerary.length ? d.itinerary.map(function (day, i) {
        var x = (o.itinerary || [])[i] || {};
        return '<li class="day"><span class="day__num" aria-hidden="true">' + (i + 1) + '</span>' +
          '<input class="input" data-tr="' + lang + '.title" data-kind="day" data-idx="' + i + '" lang="' + lang + '" value="' + esc(x.title || '') + '" aria-label="Day ' + (i + 1) + ' title (' + name[2] + ')">' + ref(day.title) +
          '<textarea class="input" rows="3" data-tr="' + lang + '.description" data-kind="day" data-idx="' + i + '" lang="' + lang + '" aria-label="Day ' + (i + 1) + ' description (' + name[2] + ')">' + esc(x.description || '') + '</textarea>' + ref(day.description) + '</li>';
      }).join('') : '<li class="empty-note">Add days to the English itinerary first.</li>') + '</ol></div>' +
      '<div class="lists">' + lines('inclusions', 'Included', d.inclusions) + lines('exclusions', 'Not included', d.exclusions) + '</div>' +
      inp('seoTitle', 'SEO title', '') + inp('seoDescription', 'SEO description', '', true, 2) +
      '<p class="hint">SEO fields can stay empty — they are generated from the translated title and description.</p>';
    updateTrCounts();
  }
  function validate(p) {
    var e = [];
    if (!p.title) e.push(['title', 'Add a title.']);
    if (!p.slug) e.push(['slug', 'Add a URL slug.']);
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)) e.push(['slug', 'Use lowercase letters, numbers and hyphens only.']);
    else {
      var clash = S.packages.find(function (x) { return x.slug === p.slug && x.id !== p.id; });
      if (clash) e.push(['slug', 'Already used by “' + plain(clash.title) + '”.']);
    }
    if (!p.state) e.push(['state', 'Choose a state.']);
    if (!p.days) e.push(['days', 'Days must be at least 1.']);
    if (p.nights > p.days) e.push(['nights', 'Nights cannot be more than days.']);
    if (!p.price) e.push(['price', 'Enter the price per person.']);
    if (p.salePrice && p.salePrice >= p.price) e.push(['salePrice', 'Sale price must be lower than the price (or leave it empty).']);
    if (!p.coverImage) e.push(['coverImage', 'Add at least one photo.']);
    if (p.published) {
      if (!p.startCity) e.push(['startCity', 'Add the starting city (needed when published).']);
      if (!p.themes.length) e.push(['themes', 'Pick at least one theme (needed when published).']);
      if (!p.shortDescription) e.push(['shortDescription', 'Add a short description (needed when published).']);
      if (!p.itinerary.length) e.push(['itinerary', 'Add at least one day (needed when published).']);
    }
    return e;
  }
  async function saveDraft() {
    var p = cleanDraft(S.draft);
    var errs = validate(p);
    if (errs.length) { showErrors(errs); toast('Please fix ' + errs.length + (errs.length === 1 ? ' field' : ' fields') + ' before saving', 'err', errs.map(function (x) { return esc(x[1]); }).join('<br>')); return; }
    var isNew = !p.id || !S.packages.some(function (x) { return x.id === p.id; });
    if (!p.id) p.id = 'pkg-' + p.slug.slice(0, 40) + '-' + Date.now().toString(36);
    var sug = suggestSeo(p);
    if (!p.seoTitle) p.seoTitle = sug.title;
    if (!p.seoDescription) p.seoDescription = (p.shortDescription || sug.desc).slice(0, 160);
    p.updatedAt = today();
    var images = pendingFilesFor(p.gallery);
    var photos = images.filter(function (f) { return !/-(800|480)\.\w+$/.test(f.path); }).length;
    var msg = (isNew ? 'Add' : 'Update') + ' package: ' + plain(p.title) + (photos ? ' (+' + photos + (photos === 1 ? ' photo' : ' photos') + ')' : '') + (p.published ? '' : ' [draft]') + ' (via admin)';
    $$('[data-action="save"]').forEach(function (b) { b.disabled = true; });
    try {
      var c = await commitPackages(upsert(p), msg, images);
      images.forEach(function (f) { delete S.pending[f.path]; });
      discardPending();
      S.dirty = false;
      S.draft = normalise(p);
      savedToast(c, p.published ? '' : 'Saved as a draft (not visible on the site).');
      if (isNew) location.hash = '#/edit/' + encodeURIComponent(p.id);
      else viewEditor(p.id);
    } catch (e) {
      toast('Save failed', 'err', esc(e.message) + (e.status ? '' : ''));
      $$('[data-action="save"]').forEach(function (b) { b.disabled = false; });
    }
  }

  /* ==========================================================================
     Site settings (site.json)
     ========================================================================== */
  function viewSettings() {
    var s = S.siteDraft = clone(S.site);
    s.address = s.address || {}; s.socials = s.socials || {}; s.stats = s.stats || {}; s.promo = s.promo || { enabled: false, packageId: (S.packages[0] || {}).id, until: '' };
    s.faqs = Array.isArray(s.faqs) ? s.faqs : []; s.testimonials = Array.isArray(s.testimonials) ? s.testimonials : [];
    setTop('Site settings', '<button class="btn btn--primary btn--sm" type="button" data-action="save-site">' + icon('a-check') + '<span>Save</span></button>');
    var inp = function (path, label, opts) {
      opts = opts || {};
      var v = getPath(s, path);
      var ctl = opts.area ? '<textarea class="input" data-s="' + path + '" rows="' + (opts.rows || 3) + '">' + esc(v) + '</textarea>'
        : '<input class="input" data-s="' + path + '"' + (opts.type ? ' type="' + opts.type + '"' : '') + (opts.num ? ' data-type="int" inputmode="numeric"' : '') + ' value="' + esc(v == null ? '' : v) + '"' + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + ' autocapitalize="off">';
      return field(label, ctl, opts.hint, { key: 's:' + path, req: opts.req });
    };
    $('#view').innerHTML =
      '<form class="editor" id="site-form" novalidate style="grid-template-columns:minmax(0,1fr)"><div class="editor__main">' +
      '<section class="panel"><div class="panel__head"><div><h2>Brand</h2></div></div>' +
      '<div class="grid2">' + inp('name', 'Brand name', { req: true }) + inp('tagline', 'Tagline') + '</div>' +
      inp('description', 'Site description', { area: true, hint: 'Used for the home page meta description and footer.' }) +
      inp('url', 'Website address', { type: 'url', req: true, hint: 'e.g. https://myyatra.co.in — used for canonical links and the sitemap.' }) +
      '</section>' +
      '<section class="panel"><div class="panel__head"><h2>Contact details</h2></div>' +
      '<div class="grid2">' + inp('phone', 'Phone (display)', { type: 'tel', req: true, ph: '+91 70571 18058' }) + inp('whatsapp', 'WhatsApp number', { type: 'tel', req: true, hint: 'Digits only with country code, e.g. 917057118058' }) + '</div>' +
      '<div class="grid2">' + inp('email', 'Email', { type: 'email', req: true }) + inp('hours', 'Working hours') + '</div>' +
      inp('whatsappGreeting', 'Default WhatsApp message') +
      '<div class="grid2">' + inp('address.street', 'Street address') + inp('address.city', 'City') + '</div>' +
      '<div class="grid2">' + inp('address.region', 'State') + inp('address.postalCode', 'PIN code') + '</div>' +
      '</section>' +
      '<section class="panel"><div class="panel__head"><div><h2>Social links</h2><p>Leave empty to hide an icon.</p></div></div>' +
      inp('socials.instagram', 'Instagram URL', { type: 'url', ph: 'https://instagram.com/…' }) + inp('socials.facebook', 'Facebook URL', { type: 'url', ph: 'https://facebook.com/…' }) + inp('socials.youtube', 'YouTube URL', { type: 'url', ph: 'https://youtube.com/@…' }) +
      '</section>' +
      '<section class="panel"><div class="panel__head"><h2>Home page numbers</h2></div><div class="grid2">' +
      inp('stats.travellers', 'Happy travellers', { num: true, type: 'number' }) + inp('stats.yearsPlanning', 'Years planning trips', { num: true, type: 'number' }) + '</div></section>' +
      '<section class="panel"><div class="panel__head"><div><h2>Testimonials</h2><p>Only publish genuine reviews, with permission.</p></div><button class="btn btn--ghost btn--sm" type="button" data-action="t-add">' + icon('a-plus') + ' Add</button></div><ul class="repeat" id="rep-t"></ul></section>' +
      '<section class="panel"><div class="panel__head"><h2>FAQs</h2><button class="btn btn--ghost btn--sm" type="button" data-action="q-add">' + icon('a-plus') + ' Add</button></div><ul class="repeat" id="rep-q"></ul></section>' +
      '<section class="panel"><div class="panel__head"><div><h2>Offer popup</h2><p>A popup that appears once per visit to promote one trip (for example a Diwali offer). It shows the trip’s price and sale price, and hides itself automatically after the end date. The popup text is in data/i18n under “promo”.</p></div></div>' +
      '<label class="toggle"><input type="checkbox" data-s="promo.enabled" data-type="bool"' + (s.promo && s.promo.enabled ? ' checked' : '') + '><span class="toggle__track"></span><span>Show the offer popup<small>Turn off to hide it everywhere</small></span></label>' +
      '<div class="grid2">' +
      field('Trip to promote', '<select class="input" data-s="promo.packageId">' + S.packages.map(function (p) { return '<option value="' + esc(p.id) + '"' + (s.promo && s.promo.packageId === p.id ? ' selected' : '') + '>' + esc(plain(p.title)) + (p.published ? '' : ' (draft)') + '</option>'; }).join('') + '</select>', 'Set its sale price in the package editor.') +
      field('Show until (last day)', '<input class="input" type="date" data-s="promo.until" value="' + esc((s.promo && s.promo.until) || '') + '">', 'Leave empty to keep it running.', { key: 's:promo.until' }) +
      '</div></section>' +
      '<section class="panel"><div class="panel__head"><div><h2>Translations</h2><p>Marathi and Hindi versions of the text above. Empty fields show the English text.</p></div></div>' +
      '<div class="tabs" role="tablist" aria-label="Translation language">' + TR_LANGS.map(function (l, i) { return '<button type="button" role="tab" class="tab" data-action="st-tab" data-lang="' + l[0] + '" aria-selected="' + (i === 0) + '">' + l[1] + '</button>'; }).join('') + '</div>' +
      '<div id="st-body"></div></section>' +
      '<div class="savebar" style="display:flex"><span class="savebar__dirty">Unsaved</span><button class="btn btn--primary" type="button" data-action="save-site">' + icon('a-check') + ' Save settings</button></div>' +
      '</div></form>';
    s.translations = s.translations && typeof s.translations === 'object' ? s.translations : {};
    S.stLang = 'mr';
    renderRepeats(); renderSiteTr();
    var form = $('#site-form');
    form.addEventListener('input', function (e) {
      var t = e.target;
      if (t.dataset.s) setPath(s, t.dataset.s, t.dataset.type === 'int' ? (parseInt(t.value, 10) || 0) : t.dataset.type === 'bool' ? t.checked : t.value);
      else if (t.dataset.st) setPath(siteTr(), t.dataset.st, t.value);
      else if (t.dataset.stl) {
        var o = siteTr(), list = o[t.dataset.stl] = o[t.dataset.stl] || [];
        while (list.length <= +t.dataset.idx) list.push({});
        list[+t.dataset.idx][t.dataset.k] = t.value;
      }
      else if (t.dataset.rep) {
        var arr = t.dataset.rep === 't' ? s.testimonials : s.faqs;
        arr[+t.dataset.idx][t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
      } else return;
      clearErr(t); S.dirty = true; form.classList.add('is-dirty');
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); });
  }
  function siteTr() {
    var tr = S.siteDraft.translations, lang = S.stLang || 'mr';
    if (!tr[lang]) tr[lang] = {};
    if (!Array.isArray(tr[lang].faqs)) tr[lang].faqs = [];
    if (!Array.isArray(tr[lang].testimonials)) tr[lang].testimonials = [];
    return tr[lang];
  }
  function renderSiteTr() {
    var box = $('#st-body'); if (!box) return;
    var s = S.siteDraft, lang = S.stLang || 'mr', o = siteTr();
    var ref = function (txt) { return txt ? '<small class="tr-ref"><b>English:</b> ' + esc(String(txt).slice(0, 220)) + '</small>' : ''; };
    var inp = function (path, label, eng, area) {
      var v = getPath(o, path);
      return '<div class="f"><label>' + label + '</label>' + (area ? '<textarea class="input" rows="3" data-st="' + path + '" lang="' + lang + '">' + esc(v || '') + '</textarea>' : '<input class="input" data-st="' + path + '" lang="' + lang + '" value="' + esc(v || '') + '">') + ref(eng) + '</div>';
    };
    var item = function (list, i, k, label, eng, area) {
      var v = ((o[list] || [])[i] || {})[k] || '';
      return '<div class="f"><label>' + label + '</label>' + (area ? '<textarea class="input" rows="3" data-stl="' + list + '" data-idx="' + i + '" data-k="' + k + '" lang="' + lang + '">' + esc(v) + '</textarea>' : '<input class="input" data-stl="' + list + '" data-idx="' + i + '" data-k="' + k + '" lang="' + lang + '" value="' + esc(v) + '">') + ref(eng) + '</div>';
    };
    box.innerHTML =
      inp('description', 'Site description', s.description, true) +
      '<div class="grid2">' + inp('hours', 'Working hours', s.hours) + inp('whatsappGreeting', 'Default WhatsApp message', s.whatsappGreeting) + '</div>' +
      '<div class="grid2">' + inp('address.city', 'City', s.address.city) + inp('address.region', 'State', s.address.region) + '</div>' +
      '<div class="f"><span class="f__label">Testimonials (same order as above)</span><ul class="repeat">' + (s.testimonials.length ? s.testimonials.map(function (t, i) {
        return '<li><div class="repeat__head">' + esc(t.name || 'Testimonial ' + (i + 1)) + '</div><div class="grid2">' + item('testimonials', i, 'name', 'Name', t.name) + item('testimonials', i, 'city', 'City', t.city) + '</div>' + item('testimonials', i, 'trip', 'Trip', t.trip) + item('testimonials', i, 'quote', 'Quote', t.quote, true) + '</li>';
      }).join('') : '<li class="empty-note">No testimonials.</li>') + '</ul></div>' +
      '<div class="f"><span class="f__label">FAQs <span class="hint">(if empty, the English FAQs are shown)</span></span><ul class="repeat">' + o.faqs.map(function (q, i) {
        var en = s.faqs[i] || {};
        return '<li><div class="repeat__head">Question ' + (i + 1) + '<button class="ibtn" type="button" data-action="stq-remove" data-idx="' + i + '" aria-label="Remove question">' + icon('a-trash') + '</button></div>' + item('faqs', i, 'q', 'Question', en.q) + item('faqs', i, 'a', 'Answer', en.a, true) + '</li>';
      }).join('') + '</ul><div class="checks">' +
      (o.faqs.length ? '' : '<button class="btn btn--outline btn--sm" type="button" data-action="stq-copy">Start from the English list</button>') +
      '<button class="btn btn--ghost btn--sm" type="button" data-action="stq-add">' + icon('a-plus') + ' Add question</button></div></div>';
  }
  function cleanSiteTr(tr) {
    var out = {};
    Object.keys(tr || {}).forEach(function (lang) {
      var src = tr[lang] || {}, o = {}, t = function (v) { return String(v == null ? '' : v).trim(); };
      ['tagline', 'description', 'hours', 'whatsappGreeting'].forEach(function (k) { if (t(src[k])) o[k] = t(src[k]); });
      var addr = {}; ['city', 'region'].forEach(function (k) { if (src.address && t(src.address[k])) addr[k] = t(src.address[k]); });
      if (Object.keys(addr).length) o.address = addr;
      var tm = (src.testimonials || []).map(function (x) { var y = {}; ['name', 'city', 'trip', 'quote'].forEach(function (k) { if (x && t(x[k])) y[k] = t(x[k]); }); return y; });
      if (tm.some(function (x) { return Object.keys(x).length; })) o.testimonials = tm;
      var fq = (src.faqs || []).map(function (x) { return { q: t(x && x.q), a: t(x && x.a) }; }).filter(function (x) { return x.q && x.a; });
      if (fq.length) o.faqs = fq;
      if (Object.keys(o).length) out[lang] = o;
    });
    return Object.keys(out).length ? out : undefined;
  }
  function renderRepeats() {
    var s = S.siteDraft;
    $('#rep-t').innerHTML = s.testimonials.map(function (t, i) {
      var f = function (k, label, area) { return field(label, area ? '<textarea class="input" rows="3" data-rep="t" data-idx="' + i + '" data-k="' + k + '">' + esc(t[k]) + '</textarea>' : '<input class="input" data-rep="t" data-idx="' + i + '" data-k="' + k + '" value="' + esc(t[k] || '') + '">'); };
      return '<li><div class="repeat__head">Testimonial ' + (i + 1) + '<button class="ibtn" type="button" data-action="t-remove" data-idx="' + i + '" aria-label="Remove testimonial">' + icon('a-trash') + '</button></div>' +
        '<div class="grid2">' + f('name', 'Name') + f('city', 'City') + '</div><div class="grid2">' + f('trip', 'Trip') + f('image', 'Photo path (e.g. images/x.webp)') + '</div>' + f('quote', 'Quote', true) +
        '<label class="toggle"><input type="checkbox" data-rep="t" data-idx="' + i + '" data-k="sample"' + (t.sample ? ' checked' : '') + '><span class="toggle__track"></span><span>Sample text<small>Placeholder — replace with a real review before launch</small></span></label></li>';
    }).join('') || '<li class="empty-note">No testimonials.</li>';
    $('#rep-q').innerHTML = s.faqs.map(function (q, i) {
      return '<li><div class="repeat__head">Question ' + (i + 1) + '<span><button class="ibtn" type="button" data-action="q-up" data-idx="' + i + '" aria-label="Move up"' + (i ? '' : ' disabled') + '>' + icon('a-up') + '</button><button class="ibtn" type="button" data-action="q-remove" data-idx="' + i + '" aria-label="Remove question">' + icon('a-trash') + '</button></span></div>' +
        field('Question', '<input class="input" data-rep="q" data-idx="' + i + '" data-k="q" value="' + esc(q.q) + '">') +
        field('Answer', '<textarea class="input" rows="3" data-rep="q" data-idx="' + i + '" data-k="a">' + esc(q.a) + '</textarea>') + '</li>';
    }).join('') || '<li class="empty-note">No questions.</li>';
  }
  async function saveSite() {
    var s = clone(S.siteDraft), e = [];
    ['name', 'tagline', 'description', 'url', 'phone', 'whatsapp', 'email', 'hours', 'whatsappGreeting'].forEach(function (k) { if (typeof s[k] === 'string') s[k] = s[k].trim(); });
    s.whatsapp = String(s.whatsapp || '').replace(/\D/g, '');
    s.url = String(s.url || '').replace(/\/+$/, '');
    if (!s.name) e.push(['s:name', 'Add the brand name.']);
    if (!/^https?:\/\/[^\s.]+\.[^\s]+$/.test(s.url)) e.push(['s:url', 'Enter a full address starting with https://']);
    if (!s.phone) e.push(['s:phone', 'Add a phone number.']);
    if (!/^\d{10,15}$/.test(s.whatsapp)) e.push(['s:whatsapp', 'Use 10–15 digits including the country code, e.g. 917057118058.']);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email || '')) e.push(['s:email', 'Enter a valid email address.']);
    ['instagram', 'facebook', 'youtube'].forEach(function (k) { if (s.socials[k] && !/^https?:\/\//.test(s.socials[k])) e.push(['s:socials.' + k, 'Use a full link starting with https://']); });
    s.faqs = s.faqs.filter(function (q) { return String(q.q || '').trim() && String(q.a || '').trim(); });
    s.testimonials = s.testimonials.filter(function (t) { return String(t.quote || '').trim() && String(t.name || '').trim(); });
    s.translations = cleanSiteTr(s.translations);
    if (!s.translations) delete s.translations;
    if (e.length) { showErrors(e); toast('Please fix ' + e.length + (e.length === 1 ? ' field' : ' fields'), 'err', e.map(function (x) { return esc(x[1]); }).join('<br>')); return; }
    $$('[data-action="save-site"]').forEach(function (b) { b.disabled = true; });
    try {
      busy('Checking for newer changes…');
      var latest = await GH.getFile(SITE_PATH);
      if (latest.sha !== S.siteSha) {
        busy(null);
        if (!confirm('Site settings were changed elsewhere since you opened this page.\n\nOK = overwrite with your version\nCancel = reload the latest settings')) { S.site = latest.json; S.siteSha = latest.sha; S.dirty = false; viewSettings(); return; }
      }
      var text = toJSON(s);
      for (var attempt = 0; attempt < 3; attempt++) {
        try { var c = await GH.commit([{ path: SITE_PATH, text: text }], 'Update site settings (via admin)', busy); break; }
        catch (err) { if (err.status === 422 && attempt < 2) continue; throw err; }
      }
      busy(null);
      S.site = s; S.siteSha = await gitSha(text); S.dirty = false;
      savedToast(c);
      viewSettings();
    } catch (err) {
      busy(null);
      toast('Save failed', 'err', esc(err.message));
      $$('[data-action="save-site"]').forEach(function (b) { b.disabled = false; });
    }
  }

  /* ==========================================================================
     Global click actions
     ========================================================================== */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    var a = b.dataset.action, i = +b.dataset.idx, d = S.draft;
    var move = function (arr, from, to) { if (to < 0 || to >= arr.length) return; arr.splice(to, 0, arr.splice(from, 1)[0]); };
    switch (a) {
      case 'logout':
        if (S.dirty && !confirm('You have unsaved changes. Log out anyway?')) return;
        if (!confirm('Log out and remove the GitHub token from this device?')) return;
        S.dirty = false; clearCfg(); location.hash = ''; location.reload(); return;
      case 'refresh':
        if (S.dirty && !confirm('Discard unsaved changes and reload data from GitHub?')) return;
        S.dirty = false; busy('Loading latest data…');
        loadData().then(function () { busy(null); currentHash = null; route(); toast('Data reloaded', 'ok', '', 2500); })
          .catch(function (err) { busy(null); toast('Reload failed', 'err', esc(err.message)); });
        return;
      case 'delete': deletePackage(b.dataset.id); return;
      case 'save': saveDraft(); return;
      case 'save-site': saveSite(); return;
      case 'seo-suggest': {
        var sug = suggestSeo(d);
        d.seoTitle = sug.title; d.seoDescription = (d.shortDescription || sug.desc).slice(0, 160);
        $('#f-seot').value = d.seoTitle; $('#f-seod').value = d.seoDescription; break;
      }
      case 'tag-remove': d.cities.splice(i, 1); renderTags(); break;
      case 'img-cover': d.coverImage = d.gallery[i]; move(d.gallery, i, 0); renderThumbs(); break;
      case 'img-remove': {
        var removed = d.gallery.splice(i, 1)[0];
        if (d.coverImage === removed) d.coverImage = d.gallery[0] || '';
        renderThumbs(); break;
      }
      case 'img-left': move(d.gallery, i, i - 1); renderThumbs(); break;
      case 'img-right': move(d.gallery, i, i + 1); renderThumbs(); break;
      case 'it-add': d.itinerary.push({ day: d.itinerary.length + 1, title: '', description: '' }); renderDays(); renderTr(); clearErr($('#days'));
        setTimeout(function () { var x = $$('[data-it="title"]').pop(); if (x) x.focus(); }, 30); break;
      case 'it-fill': {
        var n = d.days || 0;
        if (d.itinerary.length > n && !confirm('Remove the last ' + (d.itinerary.length - n) + ' day(s) to match ' + n + ' days?')) return;
        while (d.itinerary.length < n) d.itinerary.push({ day: d.itinerary.length + 1, title: '', description: '' });
        d.itinerary.length = n; renderDays(); renderTr(); break;
      }
      case 'it-remove':
        if ((d.itinerary[i].title || d.itinerary[i].description) && !confirm('Remove day ' + (i + 1) + '?')) return;
        d.itinerary.splice(i, 1); eachTrDays(function (days) { days.splice(i, 1); }); renderDays(); renderTr(); break;
      case 'it-up': move(d.itinerary, i, i - 1); eachTrDays(function (days) { move(days, i, i - 1); }); renderDays(); renderTr(); break;
      case 'it-down': move(d.itinerary, i, i + 1); eachTrDays(function (days) { move(days, i, i + 1); }); renderDays(); renderTr(); break;
      case 'tr-tab':
        S.trLang = b.dataset.lang;
        $$('[data-action="tr-tab"]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        renderTr(); return;
      case 'st-tab':
        S.stLang = b.dataset.lang;
        $$('[data-action="st-tab"]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
        renderSiteTr(); return;
      case 'stq-add': siteTr().faqs.push({ q: '', a: '' }); renderSiteTr(); siteDirty(); return;
      case 'stq-remove': siteTr().faqs.splice(i, 1); renderSiteTr(); siteDirty(); return;
      case 'stq-copy': siteTr().faqs = S.siteDraft.faqs.map(function () { return { q: '', a: '' }; }); renderSiteTr(); siteDirty(); return;
      case 'li-add': addListItem(b.dataset.list); return;
      case 'li-remove': d[b.dataset.list].splice(i, 1); renderList(b.dataset.list); break;
      case 't-add': S.siteDraft.testimonials.push({ name: '', city: '', trip: '', image: '', quote: '' }); renderRepeats(); siteDirty(); return;
      case 't-remove': S.siteDraft.testimonials.splice(i, 1); Object.keys(S.siteDraft.translations || {}).forEach(function (l) { var x = S.siteDraft.translations[l]; if (x && Array.isArray(x.testimonials)) x.testimonials.splice(i, 1); }); renderRepeats(); renderSiteTr(); siteDirty(); return;
      case 'q-add': S.siteDraft.faqs.push({ q: '', a: '' }); renderRepeats(); siteDirty(); return;
      case 'q-remove': S.siteDraft.faqs.splice(i, 1); renderRepeats(); siteDirty(); return;
      case 'q-up': move(S.siteDraft.faqs, i, i - 1); renderRepeats(); siteDirty(); return;
      default: return;
    }
    markDirty(); refreshDerived();
  });
  function siteDirty() { S.dirty = true; var f = $('#site-form'); if (f) f.classList.add('is-dirty'); }

  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('hashchange', function () { if (S.cfg) route(); });

  /* ---------- Boot ---------- */
  var cfg = loadCfg();
  if (cfg && cfg.token) start(cfg); else renderSetup();
})();
