# BILM Full Rebuild — Phase 1 (Shared Foundation)

## Goal
Create shared, reusable foundation primitives that all later page rebuild phases consume.

## Implemented in this phase

### 1) Shared JavaScript foundation
Added `shared/foundation.js` with:
- `detectBasePath()` for deployment-safe base path resolution.
- `withBase(path)` for consistent routed URL construction.
- `getCurrentSection()` for route/section identity.
- `initPage()` to stamp section metadata and optional body classes.

### 2) Shared CSS foundation
Added `shared/foundation.css` with reusable primitives:
- layout containers (`.page-frame`, `.page-stack`)
- panel surface baseline (`.surface-panel`)
- reusable controls (`.control-pill`)
- section labeling utility (`.section-label`)

### 3) Foundation wiring in active homepage + navbar
- `home/index.html` now loads `shared/foundation.css` and `shared/foundation.js` before feature scripts.
- `home/script.js` uses foundation helpers for page init + base-aware route navigation.
- `shared/navbar.js` now consumes foundation helpers when available (with fallback behavior).

## Why this matters for subsequent phases
- Removes duplicated base-path logic across page scripts.
- Establishes stable cross-page styling primitives before large page rewrites.
- Reduces risk when replacing entire domains (`movies`, `tv`, `games`, `settings`) in later phases.
