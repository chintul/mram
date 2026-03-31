# Blob Direct Fetch & Export Payload Fix

**Date:** 2026-03-31
**Status:** Approved

## Problem

The `/api/export` POST route receives all GeoJSON data in the request body. When exporting all 7 layers, the payload exceeds Vercel's 4.5MB serverless function limit, causing `FUNCTION_PAYLOAD_TOO_LARGE` errors.

Additionally, all layer data currently flows through serverless functions (`/api/data`) even when it's already cached in Vercel Blob with public access — wasting function invocations and bandwidth.

## Solution

Two changes:

1. **Frontend fetches GeoJSON directly from Vercel Blob** when cached, bypassing serverless functions
2. **Export route fetches data server-side** from blob/source instead of receiving it in the request body

## Design

### 1. New endpoint: `GET /api/layers`

Returns blob URLs and cache status for all (or requested) layers.

**File:** `app/api/layers/route.ts`

```ts
// Response shape
{
  "aimags": { "url": "https://xyz.blob.vercel-storage.com/cache/aimags.json", "cached": true },
  "soums": { "url": null, "cached": false }
}
```

Implementation:
- Uses `list()` from `@vercel/blob` with the `cache/` prefix to find all cached layer blobs
- Maps each known layer key to its blob URL (if present) or `null`
- Lightweight — no data fetching, just blob metadata

### 2. Frontend data fetching refactor

**File:** `app/page.tsx` (modifications to `fetchLayer` and `handleExport`)

Layer loading flow:
1. Call `GET /api/layers` to get blob URLs (can be called once on mount or per-layer)
2. If layer has a blob URL → fetch GeoJSON directly from the blob URL (no serverless function involved)
3. If layer has no blob URL → fall back to `GET /api/data?layer=X` (which fetches live, caches to blob, returns data)

Export flow:
- `handleExport` sends only layer keys and style config to `/api/export`:
  ```json
  {
    "format": "kml",
    "layers": [
      { "key": "aimags", "name": "Аймгууд", "color": "ff0000ff", "width": 3 },
      { "key": "soums", "name": "Сумд", "color": "ffff8800", "width": 1 }
    ]
  }
  ```
- No GeoJSON in the request body

### 3. Export route refactor

**File:** `app/api/export/route.ts`

New flow:
1. Receive layer keys + style config (small payload)
2. For each layer key:
   - Try `getCached(key)` from Vercel Blob
   - If cache miss, call `LAYER_HANDLERS[key]()` to fetch live
3. Assemble layers, convert to KML/KMZ via existing `geojsonToKml()`, return file

Requires importing `getCached` from cache module and `LAYER_HANDLERS` from data route.

### 4. Cache module addition

**File:** `app/lib/cache.ts`

Add a `listCachedUrls()` function that returns a map of layer keys to their public blob URLs. Used by `/api/layers`.

## Files Changed

| File | Change |
|------|--------|
| `app/api/layers/route.ts` | **New** — returns blob URLs for cached layers |
| `app/api/export/route.ts` | **Modified** — fetch data server-side instead of from request body |
| `app/page.tsx` | **Modified** — fetch from blob URLs when available, slim export payload |
| `app/lib/cache.ts` | **Modified** — add `listCachedUrls()` helper |

## Files Unchanged

- `app/api/data/route.ts` — still used as fallback for uncached layers
- `app/lib/geojson-to-kml.ts` — untouched
- All components (`MapView`, `BottomSheet`, `LayerPanel`, `FeatureDetail`) — untouched
- `app/lib/layers.ts` — untouched

## Edge Cases

- **Cold cache on export:** If a layer hasn't been fetched yet, the export route fetches it live via `LAYER_HANDLERS`. May be slow for CMCS (~2,800 licenses) but works within the 60s `maxDuration`.
- **Stale cache:** The existing stale-while-revalidate logic in `/api/data` handles this. Direct blob fetches serve whatever is cached; freshness is managed when `/api/data` is called.
- **CORS on blob URLs:** Vercel Blob public URLs are served with permissive CORS headers, so direct browser fetches work.
