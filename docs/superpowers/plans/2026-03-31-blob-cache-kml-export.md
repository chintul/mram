# Blob Cache Fix + Server-side KML Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken Vercel Blob GIS caching and add a server-side KML export endpoint that reads from cache.

**Architecture:** Fix `getCached()` to use `list()` instead of `head()`. Export `LAYER_HANDLERS` from the data route so the new export route can fetch on cache miss. New `POST /api/export` route reads cached GeoJSON, converts to KML, streams the file back. Client export button calls the new API instead of generating KML locally.

**Tech Stack:** Next.js 16 (App Router), @vercel/blob, TypeScript

---

### Task 1: Fix `getCached` in `app/lib/cache.ts`

**Files:**
- Modify: `app/lib/cache.ts`

- [ ] **Step 1: Replace `head` import with `list`**

In `app/lib/cache.ts`, change the import and rewrite `getCached`:

```ts
import { put, list } from "@vercel/blob";

const CACHE_PREFIX = "cache/";
const STALE_MS = 60 * 60 * 1000; // 1 hour

export async function getCached(
  layerKey: string
): Promise<{ data: string; isStale: boolean } | null> {
  try {
    const { blobs } = await list({
      prefix: `${CACHE_PREFIX}${layerKey}.json`,
      limit: 1,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (blobs.length === 0) return null;

    const blob = blobs[0];
    const age = Date.now() - new Date(blob.uploadedAt).getTime();
    const isStale = age > STALE_MS;

    const res = await fetch(blob.url);
    if (!res.ok) return null;
    const data = await res.text();
    return { data, isStale };
  } catch {
    return null;
  }
}
```

`setCache` stays unchanged.

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds with no type errors in `cache.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/lib/cache.ts
git commit -m "fix: use list() instead of head() for blob cache lookups"
```

---

### Task 2: Export `LAYER_HANDLERS` from data route

**Files:**
- Modify: `app/api/data/route.ts`

- [ ] **Step 1: Add `export` to `LAYER_HANDLERS`**

In `app/api/data/route.ts`, change line 236 from:

```ts
const LAYER_HANDLERS: Record<string, () => Promise<unknown>> = {
```

to:

```ts
export const LAYER_HANDLERS: Record<string, () => Promise<unknown>> = {
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds. No other file imports this yet, so no side effects.

- [ ] **Step 3: Commit**

```bash
git add app/api/data/route.ts
git commit -m "refactor: export LAYER_HANDLERS for reuse by export route"
```

---

### Task 3: Create `POST /api/export` route

**Files:**
- Create: `app/api/export/route.ts`

- [ ] **Step 1: Create the export route**

Create `app/api/export/route.ts`:

```ts
import { NextResponse } from "next/server";
import { LAYERS } from "@/app/lib/layers";
import { getCached, setCache } from "@/app/lib/cache";
import { LAYER_HANDLERS } from "@/app/api/data/route";
import { geojsonToKml } from "@/app/lib/geojson-to-kml";

export const maxDuration = 60;

// Map from apiKey to layer key for LAYER_HANDLERS lookup
const VALID_API_KEYS = new Set(LAYERS.map((l) => l.apiKey));

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const requestedLayers: string[] = body.layers;

    if (!Array.isArray(requestedLayers) || requestedLayers.length === 0) {
      return NextResponse.json(
        { error: "layers array is required" },
        { status: 400 }
      );
    }

    // Validate all requested layers
    const invalidLayers = requestedLayers.filter((l) => !VALID_API_KEYS.has(l));
    if (invalidLayers.length > 0) {
      return NextResponse.json(
        { error: `Unknown layers: ${invalidLayers.join(", ")}` },
        { status: 400 }
      );
    }

    // Fetch GeoJSON for each layer (from cache or fresh)
    const kmlLayers: {
      name: string;
      geojson: { type: string; features: Array<{ type: string; properties: Record<string, string>; geometry: { type: string; coordinates: number[][][] | number[][][][] } }> };
      color: string;
      width: number;
    }[] = [];

    for (const apiKey of requestedLayers) {
      const layerConfig = LAYERS.find((l) => l.apiKey === apiKey);
      if (!layerConfig) continue;

      let geojsonData: string | null = null;

      // Try cache first
      const cached = await getCached(apiKey);
      if (cached) {
        geojsonData = cached.data;
      } else {
        // Cache miss — fetch fresh
        const handler = LAYER_HANDLERS[apiKey];
        if (!handler) continue;
        const fresh = await handler();
        geojsonData = JSON.stringify(fresh);
        // Cache for next time (fire and forget)
        setCache(apiKey, geojsonData).catch(() => {});
      }

      if (!geojsonData) continue;

      const parsed = JSON.parse(geojsonData);
      if (!parsed.features || parsed.features.length === 0) continue;

      kmlLayers.push({
        name: layerConfig.kmlName,
        geojson: parsed,
        color: layerConfig.color,
        width: layerConfig.width,
      });
    }

    if (kmlLayers.length === 0) {
      return NextResponse.json(
        { error: "No data available for requested layers" },
        { status: 404 }
      );
    }

    const kml = geojsonToKml(kmlLayers);

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

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds with the new route registered.

- [ ] **Step 3: Commit**

```bash
git add app/api/export/route.ts
git commit -m "feat: add server-side KML export endpoint"
```

---

### Task 4: Update client to use server-side export

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Update `handleExportKml` to call the API**

In `app/page.tsx`, replace the `handleExportKml` callback and the `downloadFile` helper. Remove the `geojsonToKml` import.

Remove this import:
```ts
import { geojsonToKml } from "@/app/lib/geojson-to-kml";
```

Remove the `downloadFile` function (lines 29-36).

Replace the `handleExportKml` callback with:

```ts
  const [exporting, setExporting] = useState(false);

  const handleExportKml = useCallback(async () => {
    // Collect apiKeys for active layers that have data OR haven't been loaded yet
    const apiKeys: string[] = [];
    for (const key of activeKeys) {
      const layer = LAYERS.find((l) => l.key === key);
      if (layer) apiKeys.push(layer.apiKey);
    }
    if (apiKeys.length === 0) return;

    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layers: apiKeys }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Export failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mongolia-gazryn-medeelel.kml";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExporting(false);
    }
  }, [activeKeys]);
```

- [ ] **Step 2: Update the export button disabled state**

In the `LayerPanel` component call, change:

```ts
exportDisabled={loadingKeys.size > 0}
```

to:

```ts
exportDisabled={loadingKeys.size > 0 || exporting}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds. No unused imports.

- [ ] **Step 4: Manual test**

Run: `npm run dev`
1. Open the app in a browser
2. Toggle on a couple layers (e.g., aimags, soums)
3. Click the KML export button
4. Verify a `.kml` file downloads
5. Open the KML in a text editor — should contain valid KML with the selected layers

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: use server-side KML export instead of client-side generation"
```
