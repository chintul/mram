# Vercel Blob Cache + Server-side KML Export

## Problem

1. GIS layer caching via Vercel Blob is wired up but broken — `head()` is called with a path prefix instead of a full blob URL, so cache never hits.
2. KML export happens client-side, requiring all layer data to be loaded in the browser first.

## Goals

- Fix GIS data caching so layers are served from blob on repeat requests (stale-while-revalidate, 1 hour TTL)
- Move KML generation server-side so exports can pull from blob cache directly, without needing data loaded in the client
- Stay well under Vercel Blob hobby plan limit (500 MB)

## Storage Budget

- 7 GIS layer blobs as JSON: ~30-60 MB total
- No KML caching in blob (KML is generated on-the-fly from cached GeoJSON)
- Comfortable margin under 500 MB

## Design

### 1. Fix `app/lib/cache.ts`

Replace `head(path)` with `list({ prefix })` to find cached blobs by path.

**`getCached(layerKey)`:**
- Call `list({ prefix: "cache/<layerKey>.json", limit: 1, token })` 
- If no blobs found, return null
- Check `uploadedAt` against 1-hour TTL to determine staleness
- Fetch blob content via its `url`
- Return `{ data, isStale }`

**`setCache(layerKey, data)`:** No changes needed — `put()` with `addRandomSuffix: false` already works correctly, overwrites previous version.

### 2. New `app/api/export/route.ts`

**`POST /api/export`**

Request body:
```json
{ "layers": ["aimags", "soums"] }
```

Logic:
1. Validate requested layers against known layer keys
2. For each layer, read GeoJSON from blob cache via `getCached()`
3. If cache miss, fetch fresh from source via existing `LAYER_HANDLERS` (and cache result)
4. Build KML layers array with config from `LAYERS` (name, color, width)
5. Call `geojsonToKml()` to produce KML string
6. Return as `application/vnd.google-earth.kml+xml` with `Content-Disposition: attachment` header

No blob storage for KML output — generated on the fly.

`maxDuration = 60` (same as data route). Should be fast when GeoJSON is cached.

### 3. Update `app/page.tsx`

Replace client-side KML generation in `handleExportKml`:
- POST to `/api/export` with `{ layers: [...activeKeys] }`
- Receive KML blob response
- Trigger browser download from response blob

Remove the client-side `geojsonToKml` import (it moves to server-only usage).

## Files Changed

| File | Action |
|------|--------|
| `app/lib/cache.ts` | Fix `getCached` to use `list()` instead of `head()` |
| `app/api/export/route.ts` | New — server-side KML generation endpoint |
| `app/page.tsx` | Update `handleExportKml` to call server API |

## Non-Goals

- KML caching in blob (storage cost too high for combinatorial layer selections)
- Shareable KML download URLs
- Changes to the data API route (already correctly uses cache module)
