# BILM Full Rebuild — Phase 3 (Movies + TV Domains)

## Goal
Rebuild top-level browsing surfaces for Movies and TV on the shared foundation while preserving compatibility with existing detail/category routes.

## Implemented
- Rebuilt `movies/index.html` + `movies/style.css` + `movies/script.js`.
- Rebuilt `tv/index.html` + `tv/style.css` + `tv/script.js`.
- Removed legacy inline/duplicated patterns from the old index pages and aligned both domains to shared foundation/navbar assets.
- Preserved deep-route compatibility:
  - `/movies/?id=...` redirects to `/movies/show.html?id=...`
  - `/tv/?id=...` redirects to `/tv/show.html?id=...`
- Preserved category navigation (`category.html`) via “View more” links per section.

## Domain behavior in this phase
- Both pages provide:
  - section quick-filters
  - curated TMDB shelves (Trending, Popular, etc.)
  - card-to-detail navigation
- The rebuild intentionally focuses on top-level browse surfaces; existing detail/watch/category pages remain compatible and will be modernized in subsequent phases.
