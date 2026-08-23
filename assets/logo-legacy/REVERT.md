# Legacy logo (black tile + eight-point star)

Everything the old mark shipped as, kept verbatim so the swap to the supplied
purple four-point icon can be undone without going through git history.

| File here | Was |
| --- | --- |
| `icon-source.svg` | `assets/icon-source.svg` (deleted — the source is a PNG now) |
| `icon.png` | `assets/icon.png` |
| `adaptive-icon.png` | `assets/adaptive-icon.png` |
| `splash-icon.png` | `assets/splash-icon.png` |
| `site-icon-180.png` | `docs/assets/icon-180.png` |
| `site-icon-192.png` | `docs/assets/icon-192.png` |
| `site-icon-512.png` | `docs/assets/icon-512.png` |
| `StarLogo.js` | `components/StarLogo.js` |

## Reverting

```sh
cp assets/logo-legacy/icon-source.svg   assets/icon-source.svg
cp assets/logo-legacy/icon.png          assets/icon.png
cp assets/logo-legacy/adaptive-icon.png assets/adaptive-icon.png
cp assets/logo-legacy/splash-icon.png   assets/splash-icon.png
cp assets/logo-legacy/site-icon-180.png docs/assets/icon-180.png
cp assets/logo-legacy/site-icon-192.png docs/assets/icon-192.png
cp assets/logo-legacy/site-icon-512.png docs/assets/icon-512.png
cp assets/logo-legacy/StarLogo.js       components/StarLogo.js
```

That last one matters most: the current `StarLogo.js` renders an `<Image>`,
because the new mark is a raster with a glow rather than a shape a path can
describe. The legacy file draws its star as inline SVG and needs
`react-native-svg`, which is still a dependency, so it drops straight back in.

Then four things the copies above don't cover:

1. **`app.json`** — put the two backgrounds back to the old near-black:
   `android.adaptiveIcon.backgroundColor` and `splash.backgroundColor` both to
   `#080614`. `App.js`'s JS splash overlay went light to match them and wants
   `#000000` with `#FFFFFF` / `#B18CFF` / `#9C99B8` text again.

2. **The site.** Every page under `docs/` used to carry the mark inline, twice:
   a `<link rel="icon">` data URI in the head and an `<svg>` in the nav brand.
   Both are now `<img>` tags pointing at real files, and each page's
   `.brand svg` rule was widened to `.brand svg, .brand img`.
   `scripts/generateCatalogPages.mjs` emits all three for the generated catalog
   pages, so change it too or the next run undoes the revert. The old pair was:

   ```html
   <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024'%3E%3Cpath d='M512,70 L560,444 L920,512 L560,580 L512,954 L464,580 L104,512 L464,444 Z' fill='%237B5CFF'/%3E%3Ccircle cx='512' cy='512' r='46' fill='%230E0820'/%3E%3C/svg%3E" />
   ```

   ```html
   <svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512,70 L560,444 L920,512 L560,580 L512,954 L464,580 L104,512 L464,444 Z" fill="#7B5CFF" /><circle cx="512" cy="512" r="46" fill="#0E0820" /></svg>
   ```

   `docs/index.html` additionally has the big hero mark and
   `docs/catalog/index.html` a 16px MangaRecap stamp that used `currentColor` —
   `git log -p` on those two is the quickest way back.

3. **`docs/sw.js`** — bump `CACHE_NAME` again on the way back, or returning
   visitors keep serving the new icons out of the v6 cache. `favicon.png` can
   come off the precache list at the same time.

4. **New files with no legacy counterpart**: `assets/logo-source.png` (the
   icon exactly as supplied, 1254px — the source everything else is rendered
   from), `assets/logo-round.png`, `assets/favicon.png`,
   `docs/assets/favicon.png`, and `scripts/renderLogo.mjs`. Harmless to leave;
   the script only does anything when run.

`docs/assets/og-image.png` was never regenerated for the new mark, so it still
shows the old star either way. Nothing to revert there.
