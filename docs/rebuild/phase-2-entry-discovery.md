# BILM Full Rebuild — Phase 2 (Entry + Discovery)

## Goal
Rebuild the entry and discovery surfaces (`/`, `/search/`, and homepage wiring) on top of the Phase 1 shared foundation.

## Implemented
- Rebuilt root entry page (`index.html`) into a cleaner splash flow with fast continue path, loading preference toggle, and foundation-based routing.
- Added `splash.css` and `splash.js` to move splash behavior/styles out of large inline blocks.
- Rebuilt search page into modular assets:
  - `search/index.html` (structure)
  - `search/style.css` (styling)
  - `search/script.js` (TMDB movie + TV unified results, filters, sorting, incognito token resolution)
- Wired search and splash pages to `shared/foundation.js` and `shared/foundation.css`.

## Notes
- Search now uses a single-provider baseline (TMDB movie + TV) for predictable linking to rebuilt detail routes.
- Existing navbar/theme/access integrations remain intact.
