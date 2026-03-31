# Map Viewer with Cached Layers — Design Spec

## Overview

Transform the current KML-export-only tool into an interactive map viewer as the new homepage. The map displays Mongolia's geographic/cadastre data layers on a full-screen Leaflet map with a mobile-first bottom sheet UI. Layer data is cached in Vercel Blob with stale-while-revalidate to eliminate user-facing latency from slow government APIs.

## Architecture

### Current → New

- **Current**: Single page (`/`) with checkboxes → fetch from gov APIs → download KML
- **New**: Full-screen map homepage (`/`) with layer toggles, feature popups, bottom sheet details, and KML export as a feature within the map UI
- The current KML export page is removed as a standalone page; its functionality moves into the map viewer

### Stack

- **Map**: Leaflet + OpenStreetMap tiles (zero cost, zero API keys)
- **Cache**: Vercel Blob (free tier: 250MB storage, unlimited reads)
- **Framework**: Next.js 16 App Router (unchanged)
- **Styling**: Tailwind CSS v4 (unchanged)

### Data flow

```
[Government APIs]
   egazar.gov.mn WFS
   geoBoundaries.org
   cmcs.mrpam.gov.mn
        │
        ▼
[API Route: /api/data?layer=X]
        │
        ├─ Check Vercel Blob for cached GeoJSON
        │   ├─ Cache exists & fresh (< 1 hour) → return cached data
        │   ├─ Cache exists & stale (> 1 hour) → return cached data + trigger background refresh
        │   └─ No cache → fetch from gov API, store in Blob, return
        │
        ▼
[Client: Leaflet map]
        │
        ├─ Page load → auto-fetch aimags + soums (small, gives map context)
        ├─ User toggles layer on → fetch that layer from /api/data
        └─ All data rendered as GeoJSON layers on Leaflet
```

### Vercel Blob caching

Each layer is stored as a single Blob object:
- Key: `cache/{layer_name}.json`
- Value: Full GeoJSON FeatureCollection
- Metadata: `{ cachedAt: ISO timestamp }`

Stale-while-revalidate logic in the API route:
1. `head()` the Blob to check if it exists and read `cachedAt` from metadata
2. If exists and `cachedAt` < 1 hour ago → return Blob content directly
3. If exists and `cachedAt` > 1 hour ago → return Blob content, then fire-and-forget re-fetch from gov API and overwrite Blob
4. If not exists → fetch from gov API, store in Blob, return

The background refresh uses `waitUntil()` from Next.js to continue after the response is sent (available in Vercel serverless functions).

### Layer loading strategy

**Auto-load on page open** (small, fast):
- `aimags` — 21 features, ~200KB
- `soums` — 330 features, ~2MB

**On-demand when user toggles on** (large, slower first fetch):
- `spa` — protected areas
- `protection_zones` — 5,700+ zones
- `land_parcels` — up to 10,000 parcels
- `mining_conservation` — mining conservation areas
- `cmcs_licenses` — 2,800+ licenses (heaviest layer)

## UI Design

### Layout: Full-screen map + bottom sheet

- Map occupies 100% of viewport
- Bottom sheet (collapsed by default) contains layer toggles and KML export
- Search bar floats at top of map
- Zoom controls float at top-right

### Bottom sheet states

1. **Collapsed** — only drag handle visible, map fully visible
2. **Layer panel** — swipe up to reveal layer toggles (7 layers with color dots, checkboxes, descriptions). KML export button at bottom.
3. **Feature detail** — when user taps "Дэлгэрэнгүй" from a popup, sheet shows: feature name, type, area, source, and overlapping layer tags. Close button to dismiss.

### Feature interaction

1. User taps a polygon on the map
2. **Popup appears** above the feature: name, type (2-3 lines)
3. Popup contains "Дэлгэрэнгүй ↓" link
4. Tapping the link slides up the bottom sheet with full details:
   - Layer type badge (color-coded)
   - Feature name (large)
   - Description
   - Area (if available)
   - Source
   - Overlap tags (which other active layers intersect this feature) — future paid feature, placeholder for now

### Layer toggle behavior

- Each layer has: color dot, name, checkbox
- Toggling on a layer that isn't cached yet shows a loading spinner on that toggle
- Once loaded, polygons appear on the map with the layer's color (stroke) and transparent fill
- Toggling off removes polygons from the map (data stays in memory)

### KML export

- Button in the bottom sheet layer panel: "KML татах (N давхарга)"
- Exports currently visible (toggled-on) layers
- Uses existing `geojsonToKml()` function unchanged

## Component structure

```
app/
├── page.tsx                    # Full-screen map + bottom sheet (client component)
├── components/
│   ├── Map.tsx                 # Leaflet map wrapper
│   ├── BottomSheet.tsx         # Draggable bottom sheet
│   ├── LayerPanel.tsx          # Layer toggles inside bottom sheet
│   ├── FeaturePopup.tsx        # Popup content for clicked features
│   └── FeatureDetail.tsx       # Bottom sheet detail view for a feature
├── api/
│   └── data/
│       └── route.ts            # Updated: Vercel Blob caching + stale-while-revalidate
├── lib/
│   ├── geojson-to-kml.ts       # Unchanged
│   ├── cache.ts                # Vercel Blob read/write helpers
│   └── layers.ts               # Layer config (extracted from current page.tsx)
```

## Dependencies to add

- `leaflet` + `@types/leaflet` — map rendering
- `@vercel/blob` — Vercel Blob storage SDK

No other new dependencies. Leaflet is loaded client-side only (dynamic import with `ssr: false`).

## Migration plan

- Current `page.tsx` UI (checkbox list + export button) is replaced by the map viewer
- Layer config (`LAYERS` array) extracted to `lib/layers.ts` and shared between map UI and API route
- `geojson-to-kml.ts` stays unchanged
- API route `app/api/data/route.ts` updated to add Blob caching layer; all existing fetch functions preserved
- No data model changes — GeoJSON in, GeoJSON out

## What this does NOT include (future work)

- Overlap/conflict analysis (paid feature)
- User accounts or payment integration
- Search by license code or place name
- Satellite tile toggle
- PDF report export
