# Blob Direct Fetch & Export Payload Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the `FUNCTION_PAYLOAD_TOO_LARGE` error by having the export route fetch data server-side, and optimize layer fetching to read directly from Vercel Blob when cached.

**Architecture:** Add `listCachedUrls()` to cache module, expose it via a new `/api/layers` endpoint, update the frontend to fetch from blob URLs when available, and refactor the export route to pull data server-side instead of receiving it in the POST body.

**Tech Stack:** Next.js 16 (App Router), `@vercel/blob`, TypeScript, React 19

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `app/lib/cache.ts` | Modify | Add `listCachedUrls()` to return blob URLs for all cached layers |
| `app/api/layers/route.ts` | Create | Lightweight GET endpoint returning blob URLs per layer |
| `app/api/export/route.ts` | Modify | Fetch data server-side from blob/source instead of request body |
| `app/page.tsx` | Modify | Fetch from blob URLs when available, slim export payload |

---

### Task 1: Add `listCachedUrls()` to cache module

**Files:**
- Modify: `app/lib/cache.ts`

- [ ] **Step 1: Add `listCachedUrls` function**

Add this function after the existing `setCache` function in `app/lib/cache.ts`:

```ts
export async function listCachedUrls(): Promise<Record<string, string>> {
  try {
    const { blobs } = await list({
      prefix: CACHE_PREFIX,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    const urls: Record<string, string> = {};
    for (const blob of blobs) {
      // blob.pathname is "cache/aimags.json" — extract "aimags"
      const match = blob.pathname.match(/^cache\/(.+)\.json$/);
      if (match) {
        urls[match[1]] = blob.url;
      }
    }
    return urls;
  } catch {
    return {};
  }
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/cache.ts
git commit -m "feat: add listCachedUrls to cache module"
```

---

### Task 2: Create `/api/layers` endpoint

**Files:**
- Create: `app/api/layers/route.ts`

- [ ] **Step 1: Create the route file**

Create `app/api/layers/route.ts`:

```ts
import { NextResponse } from "next/server";
import { listCachedUrls } from "@/app/lib/cache";
import { LAYERS } from "@/app/lib/layers";

export async function GET() {
  const cachedUrls = await listCachedUrls();

  const result: Record<string, { url: string | null; cached: boolean }> = {};
  for (const layer of LAYERS) {
    const url = cachedUrls[layer.apiKey] || null;
    result[layer.apiKey] = { url, cached: url !== null };
  }

  return NextResponse.json(result);
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 3: Test manually**

Run: `npm run dev`
Visit: `http://localhost:3000/api/layers`
Expected: JSON object with layer keys, each having `url` (string or null) and `cached` (boolean). Layers you've previously fetched should have blob URLs.

- [ ] **Step 4: Commit**

```bash
git add app/api/layers/route.ts
git commit -m "feat: add /api/layers endpoint for blob URLs"
```

---

### Task 3: Refactor export route to fetch data server-side

**Files:**
- Modify: `app/api/export/route.ts`

- [ ] **Step 1: Replace the export route**

Replace the entire contents of `app/api/export/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { geojsonToKml } from "@/app/lib/geojson-to-kml";
import { getCached } from "@/app/lib/cache";
import { LAYER_HANDLERS } from "@/app/api/data/route";
import JSZip from "jszip";

export const maxDuration = 60;

interface ExportLayerRequest {
  key: string;
  name: string;
  color: string;
  width: number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const format: "kml" | "kmz" = body.format === "kmz" ? "kmz" : "kml";
    const layers: ExportLayerRequest[] = body.layers;

    if (!Array.isArray(layers) || layers.length === 0) {
      return NextResponse.json(
        { error: "layers array is required" },
        { status: 400 }
      );
    }

    // Fetch GeoJSON for each layer from cache or live
    const kmlLayers: { name: string; geojson: { type: string; features: Array<{ type: string; properties: Record<string, string>; geometry: { type: string; coordinates: number[][][] | number[][][][] } }> }; color: string; width: number }[] = [];

    for (const layer of layers) {
      if (!LAYER_HANDLERS[layer.key]) continue;

      let geojson: unknown;

      // Try cache first
      const cached = await getCached(layer.key);
      if (cached) {
        geojson = JSON.parse(cached.data);
      } else {
        // Fetch live
        geojson = await LAYER_HANDLERS[layer.key]();
      }

      const data = geojson as { type: string; features: Array<{ type: string; properties: Record<string, string>; geometry: { type: string; coordinates: number[][][] | number[][][][] } }> };

      if (data?.features?.length > 0) {
        kmlLayers.push({
          name: layer.name,
          geojson: data,
          color: layer.color,
          width: layer.width,
        });
      }
    }

    if (kmlLayers.length === 0) {
      return NextResponse.json(
        { error: "No data available for requested layers" },
        { status: 404 }
      );
    }

    const kml = geojsonToKml(kmlLayers);

    if (format === "kmz") {
      const zip = new JSZip();
      zip.file("doc.kml", kml);
      const kmzBuffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
      return new Response(kmzBuffer, {
        headers: {
          "Content-Type": "application/vnd.google-earth.kmz",
          "Content-Disposition": 'attachment; filename="mongolia-gazryn-medeelel.kmz"',
        },
      });
    }

    return new Response(kml, {
      headers: {
        "Content-Type": "application/vnd.google-earth.kml+xml",
        "Content-Disposition": 'attachment; filename="mongolia-gazryn-medeelel.kml"',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify the import from data route works**

The export route imports `LAYER_HANDLERS` from `app/api/data/route.ts`. This is already exported as a named export (`export const LAYER_HANDLERS`), so no changes to the data route are needed.

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/export/route.ts
git commit -m "feat: export route fetches data server-side from blob cache"
```

---

### Task 4: Update frontend to use blob URLs and slim export payload

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace `fetchLayer` and update `handleExport`**

In `app/page.tsx`, make these changes:

**a) Add blob URL cache state** — add after the `fetchedRef` declaration (line 40):

```ts
const blobUrlsRef = useRef<Record<string, string>>({});
const blobUrlsFetchedRef = useRef(false);
```

**b) Add blob URL fetching function** — add after the `blobUrlsRef` declarations:

```ts
const fetchBlobUrls = useCallback(async () => {
  if (blobUrlsFetchedRef.current) return;
  blobUrlsFetchedRef.current = true;
  try {
    const res = await fetch("/api/layers");
    if (!res.ok) return;
    const data: Record<string, { url: string | null; cached: boolean }> = await res.json();
    for (const [key, value] of Object.entries(data)) {
      if (value.url) {
        blobUrlsRef.current[key] = value.url;
      }
    }
  } catch {
    // Blob URL fetch failed — will fall back to /api/data
  }
}, []);
```

**c) Replace the existing `fetchLayer` function** (the standalone async function at the top, before the component) with an inline version inside the component. Remove the standalone `fetchLayer` function (lines 21-25) and replace the `loadLayer` callback with:

```ts
const loadLayer = useCallback(async (layer: LayerConfig) => {
  if (fetchedRef.current.has(layer.key)) return;
  fetchedRef.current.add(layer.key);

  setLoadingKeys((prev) => new Set(prev).add(layer.key));
  try {
    // Try blob URL first, fall back to API
    const blobUrl = blobUrlsRef.current[layer.apiKey];
    let data: GeoJSONData;
    if (blobUrl) {
      const res = await fetch(blobUrl);
      if (!res.ok) throw new Error(`Blob fetch failed: ${layer.apiKey}`);
      data = await res.json();
    } else {
      const res = await fetch(`/api/data?layer=${layer.apiKey}`);
      if (!res.ok) throw new Error(`Алдаа: ${layer.apiKey}`);
      data = await res.json();
    }

    if (data.features?.length > 0) {
      setLayerData((prev) => {
        const next = new Map(prev);
        next.set(layer.key, { config: layer, data });
        return next;
      });
    }
  } catch {
    fetchedRef.current.delete(layer.key);
  } finally {
    setLoadingKeys((prev) => {
      const next = new Set(prev);
      next.delete(layer.key);
      return next;
    });
  }
}, []);
```

**d) Update the auto-load block** (lines 68-72) to fetch blob URLs first:

```ts
const autoLoadedRef = useRef(false);
if (!autoLoadedRef.current) {
  autoLoadedRef.current = true;
  fetchBlobUrls().then(() => {
    LAYERS.filter((l) => l.autoLoad).forEach((l) => loadLayer(l));
  });
}
```

**e) Replace `handleExport`** to send only keys + style config:

```ts
const handleExport = useCallback(async (format: "kml" | "kmz") => {
  const exportLayers: { key: string; name: string; color: string; width: number }[] = [];
  for (const key of activeKeys) {
    const entry = layerData.get(key);
    if (entry && entry.data.features?.length > 0) {
      exportLayers.push({
        key: entry.config.apiKey,
        name: entry.config.kmlName,
        color: entry.config.color,
        width: entry.config.width,
      });
    }
  }
  if (exportLayers.length === 0) return;

  setExporting(true);
  try {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layers: exportLayers, format }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Export failed");
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mongolia-gazryn-medeelel.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("Export failed:", e);
  } finally {
    setExporting(false);
  }
}, [activeKeys, layerData]);
```

- [ ] **Step 2: Remove the standalone `fetchLayer` function**

Delete the standalone function at lines 21-25:

```ts
// DELETE THIS:
async function fetchLayer(apiKey: string): Promise<GeoJSONData> {
  const res = await fetch(`/api/data?layer=${apiKey}`);
  if (!res.ok) throw new Error(`Алдаа: ${apiKey}`);
  return res.json();
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: fetch layers from blob URLs, slim export payload"
```

---

### Task 5: End-to-end manual testing

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test layer loading**

1. Open `http://localhost:3000`
2. Verify aimags and soums auto-load on the map (these are `autoLoad: true`)
3. Toggle on a few more layers (e.g., SPA, protection zones)
4. Verify they appear on the map

- [ ] **Step 3: Test `/api/layers` endpoint**

Visit: `http://localhost:3000/api/layers`
Verify: Previously-fetched layers show `cached: true` with blob URLs.

- [ ] **Step 4: Test export with all layers**

1. Toggle on all 7 layers and wait for them to load
2. Click "KML татах" — verify a `.kml` file downloads
3. Click "KMZ татах" — verify a `.kmz` file downloads
4. Open Network tab and confirm the POST to `/api/export` has a small payload (just keys + styles, no GeoJSON)

- [ ] **Step 5: Test cold cache export**

If possible, test with a layer that hasn't been cached yet. The export route should fetch it live.

- [ ] **Step 6: Production build test**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
