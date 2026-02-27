# BILM Full Rebuild — Phase 0 (Discovery + Freeze)

## Goal
Phase 0 locks **full-site rebuild scope** before implementation. We preserve feature parity while replacing architecture, layout, and page organization.

## Non-negotiables
- Rebuild the entire site (all page groups and shared modules), not only `home/`.
- Keep core product behavior: browse movies/TV, search, open details/watch views, save/manage lists, settings controls, games section, and utility pages.
- Execute in phases with approval checkpoints.

## Current Page/Route Inventory
### Root
- `/` splash/loading entry (`index.html`)

### Discovery + home
- `/home/` (`home/index.html`, `home/script.js`, `home/style.css`)
- `/search/` (`search/index.html`)

### Movies
- `/movies/` listing (`movies/index.html`, `movies/script.js`, `movies/style.css`)
- `/movies/category.html` (`movies/category.html`, `movies/category.js`, `movies/category.css`)
- `/movies/show.html` (`movies/show.html`, `movies/movie.js`, `movies/movie.css`)
- `/movies/watch/viewer.html` (`movies/watch/viewer.html`, `movies/watch/viewer.js`, `movies/watch/viewer.css`)

### TV
- `/tv/` listing (`tv/index.html`, `tv/script.js`, `tv/style.css`)
- `/tv/category.html` (`tv/category.html`, `tv/category.js`, `tv/category.css`)
- `/tv/show.html` (`tv/show.html`, `tv/movie.js`, `tv/movie.css`)
- `/tv/viewer.html` (`tv/viewer.html`, `tv/viewer.js`, `tv/viewer.css`)
- `/tv/watch/viewer.html` (`tv/watch/viewer.html`, `tv/watch/viewer.js`, `tv/watch/viewer.css`)

### Games
- `/games/` (`games/index.html`, `games/script.js`, `games/style.css`)
- `/games/play.html` (`games/play.html`, `games/play.js`, `games/play.css`)

### Settings
- `/settings/` (`settings/index.html`)
- `/settings/account/` (`settings/account/index.html`, `settings/account/script.js`, `settings/account/style.css`)
- `/settings/history/` (`settings/history/index.html`, `settings/history/script.js`, `settings/history/style.css`)

### Utility + internal
- `/random/rng.html`, `/random/reset.html`
- `/test/` and nested test pages (`test/*`)

### Shared/PWA
- Shared UI/utilities under `shared/*`
- `manifest.json`, `sw.js`, `icon.png`

## Feature Parity Freeze Checklist
Each item is frozen and must be preserved or intentionally replaced with equivalent UX.

1. Global navigation across primary sections.
2. Search workflow with query handoff and history behavior (respecting settings/incognito behavior).
3. Movie discovery sections (trending/popular/top-rated/etc.) and category browsing.
4. TV discovery sections and category browsing.
5. Detail pages for movie and TV with metadata display.
6. Viewer/watch pages for movie and TV routes.
7. Local list management: Continue Watching, Favorites, Watch Later.
8. Type filtering and edit/remove flows for saved lists.
9. Theme/settings persistence.
10. Games catalog and play flow.
11. Random utility pages (RNG/reset) or explicit deprecation plan.
12. PWA basics (manifest/service worker/app icon).

## Rebuild Phase Plan
- **Phase 0:** Discovery, freeze, architecture blueprint (this document).
- **Phase 1:** Shared foundation (design tokens, layout shell, shared components/utilities).
- **Phase 2:** Entry/discovery pages (`/`, `/home/`, `/search/`).
- **Phase 3:** Content domains (`/movies/*`, `/tv/*`).
- **Phase 4:** Games + utility domains (`/games/*`, `/random/*`, `/test/*` disposition).
- **Phase 5:** Settings/account/history full rebuild.
- **Phase 6:** Shared infrastructure hardening (`shared/*`, manifest, sw).
- **Phase 7:** QA, bug bash, parity signoff.

## Definition of Done for Phase 0
- Full route inventory captured.
- Feature parity checklist frozen.
- Phase boundaries approved.
- No production behavior changes introduced in this phase.
