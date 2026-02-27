# BILM Full Rebuild — Phase 7 (QA + Bug Fixes)

## Fixes applied
- Fixed Games catalog/play flow regression:
  - normalized `games/catalog.json` entries that use `embed`/`tags` fields,
  - restored launch compatibility by writing selected game payloads to `sessionStorage` (`bilm:games:selection`),
  - linked game cards to `games/play.html?game=<id>` IDs expected by `games/play.js`.
- Hardened service worker for non-root deployments:
  - switched app-shell cache entries to scope-resolved URLs,
  - adjusted offline HTML fallback to scope-aware `index.html`.

## QA executed
- Static JS parse checks across rebuilt domain scripts and service worker.
- Route smoke checks for key pages (`/games/`, `/games/play.html`, `/settings/`, `/settings/history/`).
- Browser smoke sweep across entry/home/search/movies/tv/games/settings/account/history.

## Notes
- Browser account-page smoke test surfaced external Firebase access-control errors in this local environment; account page keeps graceful fallback messaging when auth service is unavailable.
