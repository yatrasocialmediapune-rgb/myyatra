# My Yatra — Miles of Smiles

Static website and admin panel for **My Yatra**, an India-only tour packages business in Pune.

- **₹0 to run:** a static site on Cloudflare Pages (free tier). There is no database and no server.
- **Plain HTML, CSS and vanilla JavaScript.** There are no frameworks and no npm packages.
- **One build script** (`build.js`, Node 20+, zero dependencies) reads the JSON data and writes the finished site to `/dist`.
- **Admin panel** at `/admin/`. It saves by committing to GitHub, and Cloudflare Pages republishes automatically, usually within about a minute.

---

## Contents

1. [Folder structure](#folder-structure)
2. [Run the site locally](#1-run-the-site-locally)
3. [Put it on GitHub and Cloudflare Pages](#2-put-it-on-github-and-cloudflare-pages)
4. [Create the GitHub token for the admin panel](#3-create-the-github-token-for-the-admin-panel)
5. [Protect /admin with Cloudflare Access](#4-protect-admin-with-cloudflare-access)
6. [Add or edit packages and images](#5-add-or-edit-packages-and-images)
7. [Before you launch: checklist](#before-you-launch-checklist)
8. [How it works (for developers)](#how-it-works-for-developers)
9. [Troubleshooting](#troubleshooting)

---

## Folder structure

```
data/packages.json      All tour packages (single source of truth)
data/site.json          Brand name, phone, WhatsApp, email, address, socials, stats, testimonials, FAQs
images/                 Package photos (WebP). The included .svg files are placeholder artwork.
templates/              HTML templates: layout, home, tours, package, collection (state/theme), page, 404
templates/partials/     Reusable pieces (the package card)
templates/pages/        Body content for About, Contact, FAQ and the policy pages
admin/                  Admin panel (index.html, admin.js, admin.css), copied to /dist/admin as-is
assets/css/main.css     Design system: tokens, components, page styles
assets/js/main.js       Site behaviour (menu, reveal, parallax, itinerary route, gallery, WhatsApp planner)
assets/js/tours.js      Search, filters and sorting on /tours/
assets/svg/             Logo, icons, rangoli, block-print tile, route line, hero silhouettes
build.js                The generator (plus a local preview server)
dist/                   Build output (created by build.js, never edit or commit it)
```

Pages that `build.js` generates:

| URL | What it is |
| --- | --- |
| `/` | Home: hero search, featured trips, themes, state map, why us, testimonials, stats |
| `/tours/` | All packages with search, filters (state, theme, duration, budget) and sort |
| `/tours/{slug}/` | One page per published package |
| `/states/{state}/` | Packages in a state (only for states that have packages) |
| `/themes/{theme}/` | Packages for a theme (empty themes show "coming soon" and are `noindex`) |
| `/about/`, `/contact/`, `/faq/` | Static pages |
| `/privacy-policy/`, `/terms/`, `/cancellation-refund/` | Policy pages (placeholder text) |
| `/404.html` | Custom "lost boarding pass" page |
| `/sitemap.xml`, `/robots.txt`, `/_headers` | SEO and Cloudflare caching/security headers |

Only packages with `"published": true` appear on the public site. Drafts are never copied into `/dist`.

---

## 1. Run the site locally

You need **Node.js 20 or newer** ([nodejs.org](https://nodejs.org)). Nothing else needs to be installed.

Build the site once:

```bash
node build.js
```

To build, serve and rebuild automatically while you edit:

```bash
node build.js --serve
```

Then open **http://localhost:8080**. Each time you save a file in `data/`, `templates/`, `assets/`, `images/`, `admin/` or `build.js`, the site rebuilds; refresh the browser to see the change. To use a different port, add `--port 3000`.

Check the terminal output: the build prints a warning for anything missing, such as an image path that doesn't exist, and stops with a clear message for real errors like duplicate slugs or invalid JSON.

> The admin panel also opens at http://localhost:8080/admin/, but it always saves to GitHub, never to your local files.

---

## 2. Put it on GitHub and Cloudflare Pages

### 2a. Push the project to GitHub

1. Create a free account at [github.com](https://github.com) if you don't have one.
2. Create a **new repository**, for example `myyatra`. It can be **private**. Don't add a README or .gitignore, because the project already has them.
3. In a terminal inside the project folder, run these commands one at a time (replace `YOUR-USERNAME`):

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "My Yatra website"
```

```bash
git branch -M main
```

```bash
git remote add origin https://github.com/YOUR-USERNAME/myyatra.git
```

```bash
git push -u origin main
```

`.gitignore` already excludes `dist/`; Cloudflare builds it for you.

### 2b. Connect Cloudflare Pages

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Go to **Workers & Pages → Create → Pages → Connect to Git**.
3. Authorise GitHub and pick your `myyatra` repository.
4. Use these build settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | **None** |
| Build command | `node build.js` |
| Build output directory | `dist` |
| Environment variable (optional) | `NODE_VERSION` = `20` |

5. Click **Save and Deploy**. After a minute your site is live at `https://<project>.pages.dev`.

From now on, every commit to `main` (from your computer **or** from the admin panel) triggers a new deploy automatically.

### 2c. Add your domain (myyatra.co.in)

1. Buy `myyatra.co.in` from any registrar.
2. Recommended: add the domain to Cloudflare (**Add a domain → Free plan**) and, at your registrar, change the nameservers to the two Cloudflare shows you. This can take a few hours.
3. In your Pages project, go to **Custom domains → Set up a custom domain** and enter `myyatra.co.in`, then repeat for `www.myyatra.co.in`. Cloudflare creates the DNS records and the free SSL certificate.
4. Optional: make `www` redirect to the main domain using **Rules → Redirect Rules** (Cloudflare has a ready-made "Redirect from WWW to root" template).
5. Make sure `"url"` in `data/site.json` is `https://myyatra.co.in`. It is used for canonical links, the sitemap and social previews. You can also change it from **Admin → Site settings**.

Afterwards, submit `https://myyatra.co.in/sitemap.xml` in [Google Search Console](https://search.google.com/search-console).

---

## 3. Create the GitHub token for the admin panel

The admin panel talks to GitHub using a **fine-grained personal access token** that can only touch this one repository.

1. On GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** (direct link: <https://github.com/settings/personal-access-tokens/new>).
2. **Token name:** `My Yatra admin`
3. **Expiration:** choose a date, for example 90 days. When it expires, create a new one and log in again.
4. **Resource owner:** your account.
5. **Repository access:** *Only select repositories* → pick **myyatra**.
6. **Permissions → Repository permissions → Contents → Read and write.** Leave everything else as *No access*. GitHub automatically adds *Metadata: Read-only*, which is fine.
7. Click **Generate token** and copy it. It starts with `github_pat_`, and GitHub shows it only once.

Then open `https://myyatra.co.in/admin/` and enter:

- **GitHub owner:** your GitHub username
- **Repository:** `myyatra`
- **Branch:** `main`
- **Token:** the token you copied

The token is stored **only in that browser on that device** (localStorage). Use **Log out / clear token** in the sidebar (or the Settings tab on mobile) to remove it. If a phone or laptop is lost, delete the token on GitHub right away from the same Fine-grained tokens page.

---

## 4. Protect /admin with Cloudflare Access

The admin page is `noindex`, but anyone could still open it. Cloudflare Access puts a free email login in front of it: only email addresses you list can reach `/admin/`, and they sign in with a one-time PIN sent to their inbox.

1. In the Cloudflare dashboard, open **Zero Trust**.
   - The first time, choose a **team name** (anything, e.g. `myyatra`) and select the **Free** plan, which covers up to 50 users. Cloudflare may ask for a payment method to activate Zero Trust even on the Free plan; you are not charged on Free.
2. Check the login method: go to **Settings → Authentication → Login methods**. **One-time PIN** is normally enabled already; if it isn't, click **Add new → One-time PIN**.
3. Go to **Access → Applications → Add an application → Self-hosted**.
4. Fill in:
   - **Application name:** `My Yatra Admin`
   - **Session duration:** `24 hours` (or what you prefer)
   - **Application domain:** domain `myyatra.co.in`, path `admin`
   - Click **Add domain** and add a second entry: domain `<project>.pages.dev`, path `admin`, so the Pages URL is protected too.
   - Optionally add a third: `*.<project>.pages.dev`, path `admin`, for preview deployments.
5. **Identity providers:** tick **One-time PIN** (you can turn on *Instant Auth* if it's the only one).
6. Click **Next** and create a policy:
   - **Policy name:** `Owners`
   - **Action:** `Allow`
   - **Include → Emails:** `yatrasocialmedia.pune@gmail.com` (add teammates' emails here too)
7. Click **Next → Add application**.

Test it in a private browser window: `https://myyatra.co.in/admin/` should show a Cloudflare login page. Enter your email, type the PIN from your inbox, and the admin panel appears. Any email not on the list is refused.

> The public site is untouched; only paths starting with `/admin` are protected.

---

## 5. Add or edit packages and images

### Using the admin panel (recommended, also works on a phone)

1. Open `/admin/` → **Packages** → **New**, or tap a package to edit it.
2. Fill in the form:
   - **Title:** the slug (URL) is created automatically, e.g. `goa-beach-weekend-2n-3d`. Wrap a word in `*asterisks*` to choose which word is highlighted in orange on the package page.
   - **State, starting city, cities, themes, nights/days, minimum people, meal plan**
   - **Price** and an optional **sale price**, both per person in ₹. The old price is shown struck through.
   - **Published:** turn it off to keep a package as a hidden draft. **Featured** shows it on the home page.
   - **Photos:** tap *Add photos* and pick images from the gallery or camera. Each photo is resized to a maximum of 1600 px and converted to **WebP** in the browser, along with 800 px and 480 px copies for fast mobile loading. ★ sets the cover, ‹ › reorder, and 🗑 unlinks a photo (the file stays in the repository).
   - **Itinerary:** *Add day* or *Match N days*, then fill in each day's title and description. Use ⌃/⌄ to reorder; days renumber themselves.
   - **Inclusions / exclusions:** type an item and press Enter.
   - **SEO:** leave empty to auto-generate, or tap *Suggest*.
3. Watch the **live card preview**, then tap **Save**. One commit is made with the package and all its new photos. You'll see "Saved ✓ Live in ~1 minute".

Other actions: **Duplicate** (creates a draft copy), **Delete** (removes the package; its photos stay in `images/`), and **Site settings** (phone, WhatsApp, email, address, socials, home page numbers, testimonials and FAQs).

If two people save at the same time, the panel re-reads the latest data from GitHub, re-applies your change on top and retries, so nobody's edit is silently lost. For site settings it asks before overwriting.

### Editing the JSON by hand

Edit `data/packages.json`, then commit and push. Each package looks like this:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Unique, never changes (e.g. `pkg-kerala-01`) |
| `slug` | string | URL: `/tours/{slug}/`. Lowercase letters, numbers, hyphens. Must be unique |
| `title` | string | `*word*` highlights a word |
| `state` | string | e.g. `Kerala`, `Jammu & Kashmir` |
| `cities` | string[] | Shown as the route |
| `themes` | string[] | Any of: Pilgrimage, Honeymoon, Family, Hill Station, Beach, Wildlife, Weekend |
| `nights`, `days`, `minPeople` | number | |
| `startCity`, `mealPlan` | string | |
| `price`, `salePrice` | number | Per person, INR. `salePrice` 0 = no discount |
| `featured`, `published` | boolean | |
| `coverImage` | string | e.g. `images/kerala-backwaters.webp` |
| `gallery` | string[] | Image paths; first ones show in the mosaic |
| `shortDescription` | string | |
| `itinerary` | `{ day, title, description }[]` | |
| `inclusions`, `exclusions` | string[] | |
| `seoTitle`, `seoDescription` | string | Optional |
| `updatedAt` | `YYYY-MM-DD` | Used in the sitemap |

### Images

- Put photos in `images/`. **WebP, about 1600 px wide**, is ideal. Use landscape (3:2 or 4:3) photos; they are cropped to fill cards and heroes.
- Optional smaller copies named `photo-800.webp` and `photo-480.webp` next to `photo.webp` are picked up automatically for `srcset`. The admin panel creates these for you.
- Only use photos you own or have a licence for.
- The `.svg` files in `images/` are **placeholder illustrations** in the brand colours. Replace them with real photos and update the paths, either in the admin panel or in `packages.json`.
- Theme tile images are set in `THEME_INFO` at the top of `build.js`. The home hero image is `heroImage` in `site.json`.

---

## Before you launch: checklist

- [ ] **Testimonials** in `site.json` are marked `"sample": true`. Replace them with **real reviews** (with permission) or delete them. Never publish invented reviews.
- [ ] **Home page numbers** (`stats.travellers`, `stats.yearsPlanning`) reflect reality.
- [ ] **Policy pages** (`templates/pages/privacy-policy.html`, `terms.html`, `cancellation-refund.html`) are reviewed. The cancellation percentages are examples only.
- [ ] **About page** story: replace the placeholder callout in `templates/pages/about.html`.
- [ ] **Social preview image:** WhatsApp, Facebook and others don't display SVG. Add a 1200×630 JPG or PNG (e.g. `images/og-default.jpg`) and set `defaultOgImage` in `site.json`. Package pages use their cover image, so use real JPG/WebP photos there.
- [ ] **Socials**, **street address** and **PIN code** are filled in (Admin → Site settings).
- [ ] **Cloudflare Access** protects `/admin` (section 4).
- [ ] Sitemap submitted in Google Search Console.

---

## How it works (for developers)

**Build (`build.js`).** It loads and validates both JSON files and filters to published packages. It copies `assets/`, `images/` and `admin/` to `dist/`, minifies the CSS, and renders the templates with a tiny engine:

| Syntax | Meaning |
| --- | --- |
| `{{key}}` | escaped value (dot paths like `site.phone`) |
| `{{{key}}}` | raw HTML |
| `{{> name}}` | `templates/partials/name.html` |
| `{{svg name}}` | inlines `assets/svg/name.svg` |

It also reads image dimensions (WebP, JPEG, PNG, SVG) to set `width`/`height`, builds `srcset` from `-800`/`-480` variants, and writes JSON-LD: `TravelAgency` and `WebSite` on home, `TouristTrip` and `BreadcrumbList` on packages, `FAQPage` on FAQ, and `ItemList` on listings. It also writes `sitemap.xml`, `robots.txt` and the Cloudflare `_headers` file. CSS and JS URLs carry a content hash (`?v=…`), so they can be cached for a year safely.

**Design system (`assets/css/main.css`).** Colours are the three brand colours only: `--navy #0B2D50`, `--orange #F7941D` and `--white`, plus tints and shades derived from them. Orange buttons always use navy text. Type is Fraunces (display) and Manrope (UI) with fluid `clamp()` sizes. Breakpoints are 420 / 760 / 1080 / 1440 px, mobile-first. Signature components:

- postage-stamp badges
- ticket-style cards with notches and a price stub
- a boarding-pass price block
- a self-drawing dotted itinerary route
- an original tile map of India
- polaroid testimonials
- block-print and rangoli dividers

**Motion.** Motion animates only `transform` and `opacity`, with scroll work throttled through `requestAnimationFrame`. `prefers-reduced-motion` turns off parallax, route drawing and reveals.

**Performance.** There are no frameworks and no render-blocking third-party CSS (Google Fonts load asynchronously with `display=swap`). Images below the fold are lazy-loaded with fixed dimensions, and `content-visibility: auto` is set on long sections. CSS is about 12 KB gzipped and JS about 4 KB gzipped per page.

**Admin (`admin/admin.js`).** It reads files with the GitHub Contents API. It writes with the Git Data API (blobs → tree → commit → move branch), so a package and its photos land in **one** commit, which means one deploy. On a conflict (the branch moved), it re-reads the latest JSON, re-applies the change and retries.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Cloudflare build fails | Open the deploy log. The build stops with a readable message, e.g. invalid JSON or duplicate slug. Fix it in GitHub or the admin panel and commit again |
| "Image not found" warning | The path in `packages.json` doesn't match a file in `images/` (paths are case-sensitive) |
| Admin says token rejected | The token expired or was deleted. Create a new one (section 3) and log in again |
| Admin says no permission | The token needs **Contents: Read and write** on this repository |
| Saved, but the site didn't change | Wait 1–2 minutes and check **Workers & Pages → your project → Deployments**. Hard-refresh the page (Ctrl+Shift+R) |
| A package isn't on the site | Check that **Published** is on |
| Photos look like JPEG, not WebP | Some browsers (older Safari) can't create WebP, so the admin falls back to JPEG automatically. Both work |
