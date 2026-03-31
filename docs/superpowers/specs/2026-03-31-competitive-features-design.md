# Competitive Feature Set — Design Spec

## Overview

Three feature directions to differentiate the Mongolia Map tool from government GIS portals and competing Mongolian mapping apps. Target users: mining companies doing due diligence and environmental NGOs monitoring protected areas.

Core principle: keep it simple. Client-side computation where possible, avoid burning Vercel free tier limits.

## Direction A: Overlap Intelligence

### A1. Search & Filter

Client-side search bar in the LayerPanel. Searches across all loaded layers by `shapeName`, `description`, license code, holder name. Debounced input, max 50 results. Tapping a result flies the map to the feature and selects it.

Aimag/soum dropdown filter narrows any layer to features spatially contained within a selected aimag or soum (using loaded boundary data + Turf.js `booleanPointInPolygon` on centroids).

No server-side search. Only works on loaded layers.

### A2. Overlap Detection

"Давхцал шалгах" button in FeatureDetail. Runs `turf.intersect()` against all features in other loaded layers. Results shown inline in the bottom sheet:
- Overlapping feature name + layer name
- Overlap percentage of the selected feature's area

Tapping an overlap result highlights both polygons on the map.

Hint shown when not all layers are loaded: "Илүү олон давхарга нэмж давхцлыг бүрэн шалгана уу"

Dependencies: `@turf/intersect`, `@turf/area`, `@turf/boolean-point-in-polygon`, `@turf/centroid` (~50KB gzipped total).

### A3. Conflict Report (CSV)

"Тайлан татах" button appears after overlap detection runs. Generates a CSV client-side:
- Row per overlapping feature
- Columns: selected feature name, selected layer, selected area (ha), overlapping feature name, overlapping layer, overlap area (ha), overlap %, timestamp

Built from in-memory overlap results. No server calls.

### A4. Area Display

Show area in hectares via `turf.area()` in the FeatureDetail view. Single line addition, no new UI.

## Direction B: Field-First Export

### B1. Selective Export (Draw Rectangle)

Leaflet draw plugin adds a "draw rectangle" control on the map. After drawing, only features intersecting the rectangle are included in the export. Uses `turf.bboxClip` or `turf.booleanIntersects` client-side to filter before calling the export API.

Existing "export all active layers" button remains unchanged.

### B2. KMZ Compressed Export

KMZ = zipped KML. Use `fflate` library (~3KB gzipped) to compress the KML client-side before download. Produces `.kmz` file. Significantly smaller for large exports.

### B3. GPX — Skipped

GPX is for tracks/waypoints, not polygons. AlpineQuest handles KML/KMZ. No benefit.

## Direction C: Data Monitoring

### C1. Weekly GitHub Action

A GitHub Actions workflow runs weekly (cron schedule). It:
1. Fetches each layer's feature list (IDs + names only, not geometries)
2. Compares against the previous snapshot stored as JSON in a `data-snapshots` branch
3. If changes detected (new features, removed features), sends an email notification
4. Commits the updated snapshot to `data-snapshots` branch

Snapshot format per layer:
```json
{
  "layer": "cmcs_licenses",
  "timestamp": "2026-03-31T00:00:00Z",
  "featureCount": 2847,
  "features": [
    { "id": "MV-12345", "name": "Лиценз нэр" },
    ...
  ]
}
```

Lightweight — no geometries stored.

### C2. Email Notifications

Use `nodemailer` with Gmail SMTP (app password). Email contains:
- Which layer changed
- Number of features added/removed
- Names/codes of changed features
- Link back to the app

Recipients configured via environment variable `MONITOR_EMAIL_RECIPIENTS`.

### C3. Freshness Indicators

Each layer card in LayerPanel shows relative time since last cache update: "Сүүлд шинэчлэгдсэн: 2 өдрийн өмнө". Pulled from the Vercel Blob cache metadata timestamp. Requires a lightweight API endpoint or including the timestamp in the existing `/api/data` response headers.

### C4. Historical Comparison — Deferred

Snapshots exist in git history, so a diff viewer is possible later. Not in scope for v1.

## New Dependencies

- `@turf/turf` (or individual modules: intersect, area, boolean-point-in-polygon, centroid, bbox-clip, boolean-intersects)
- `fflate` — KMZ compression
- `leaflet-draw` — rectangle drawing on map
- `nodemailer` — email sending (GitHub Action only, not in the Next.js app)

## Vercel Free Tier Impact

- **Serverless functions:** No new endpoints except possibly a lightweight freshness metadata endpoint. All overlap/search/filter is client-side.
- **Bandwidth:** No meaningful increase. KMZ actually reduces bandwidth.
- **Blob storage:** No increase. Freshness uses existing cache metadata.
- **Cron/monitoring:** Runs on GitHub Actions (2,000 free min/month), not Vercel.

## Implementation Order

1. Direction A (Overlap Intelligence) — highest value, moderate effort
2. Direction B (Field-First Export) — pairs with A, low effort
3. Direction C (Data Monitoring) — independent, can be built in parallel via GitHub Actions
