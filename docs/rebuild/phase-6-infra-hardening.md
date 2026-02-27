# BILM Full Rebuild — Phase 6 (Shared Infra + PWA Hardening)

## Implemented
- Updated `manifest.json` metadata (description, colors, icon purpose declarations).
- Updated `sw.js` to a new cache strategy:
  - app-shell precache
  - network-first for HTML navigations with cache fallback
  - cache-first for same-origin static GET requests
  - stale cache cleanup on activate

## Goal
Improve installability and offline resilience while maintaining compatibility with rebuilt phased pages.
