# Map Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the KML-export-only homepage with a full-screen interactive Leaflet map viewer that shows Mongolia's GIS layers, cached via Vercel Blob for instant loading.

**Architecture:** Full-screen Leaflet map with a draggable bottom sheet for layer toggles and feature details. API route wraps existing government API fetchers with a Vercel Blob caching layer using stale-while-revalidate (via Next.js `after()`). Aimag/soum layers auto-load; heavy layers load on-demand.

**Tech Stack:** Next.js 16, React 19, Leaflet (vanilla, no react-leaflet), Vercel Blob, Tailwind CSS v4, TypeScript.

---

## File Structure

```
app/
├── page.tsx                      # New: full-screen map page (client component)
├── components/
│   ├── MapView.tsx               # Leaflet map initialization + layer rendering
│   ├── BottomSheet.tsx           # Draggable bottom sheet (collapsed/layers/detail)
│   ├── LayerPanel.tsx            # Layer toggles with loading states
│   └── FeatureDetail.tsx         # Feature detail view in bottom sheet
├── api/
│   └── data/
│       └── route.ts              # Modified: add Blob caching wrapper
├── lib/
│   ├── layers.ts                 # New: extracted layer config (shared)
│   ├── cache.ts                  # New: Vercel Blob read/write helpers
│   └── geojson-to-kml.ts        # Unchanged
```

---

### Task 1: Install dependencies and extract layer config

**Files:**
- Create: `app/lib/layers.ts`
- Modify: `package.json`

- [ ] **Step 1: Install leaflet and @vercel/blob**

Run:
```bash
npm install leaflet @vercel/blob
npm install -D @types/leaflet
```
Expected: packages added to package.json, no errors.

- [ ] **Step 2: Create shared layer config**

Create `app/lib/layers.ts`:

```ts
export interface LayerConfig {
  key: string;
  apiKey: string;
  label: string;
  description: string;
  source: string;
  kmlName: string;
  color: string;
  colorHex: string;
  width: number;
  autoLoad: boolean;
}

export const LAYERS: LayerConfig[] = [
  {
    key: "aimags",
    apiKey: "aimags",
    label: "Аймгуудын хил",
    description: "21 аймгийн засаг захиргааны хил хязгаар",
    source: "geoBoundaries.org",
    kmlName: "Аймгууд",
    color: "ff0000ff",
    colorHex: "#ff0000",
    width: 3,
    autoLoad: true,
  },
  {
    key: "soums",
    apiKey: "soums",
    label: "Сумдын хил",
    description: "330+ сумын засаг захиргааны хил хязгаар",
    source: "geoBoundaries.org",
    kmlName: "Сумд",
    color: "ffff8800",
    colorHex: "#0088ff",
    width: 1,
    autoLoad: true,
  },
  {
    key: "spa",
    apiKey: "spa",
    label: "Тусгай хамгаалалттай газар нутаг",
    description: "Байгалийн цогцолборт газар, дархан цаазат газар, дурсгалт газар",
    source: "egazar.gov.mn",
    kmlName: "Тусгай хамгаалалттай газар",
    color: "ff00cc00",
    colorHex: "#00cc00",
    width: 3,
    autoLoad: false,
  },
  {
    key: "protection_zones",
    apiKey: "protection_zones",
    label: "Хамгаалалтын бүс, зурвас газар",
    description: "Ус, ой, дэд бүтцийн хамгаалалтын бүс (5,700+ бүс)",
    source: "egazar.gov.mn",
    kmlName: "Хамгаалалтын бүс",
    color: "ffcc00cc",
    colorHex: "#cc00cc",
    width: 2,
    autoLoad: false,
  },
  {
    key: "land_parcels",
    apiKey: "land_parcels",
    label: "Газар эзэмшлийн зөвшөөрөл",
    description: "Газар эзэмших, ашиглах эрхийн нэгж талбарууд (10,000 хүртэл)",
    source: "egazar.gov.mn",
    kmlName: "Газар эзэмшил",
    color: "ff00ddff",
    colorHex: "#ffdd00",
    width: 1,
    autoLoad: false,
  },
  {
    key: "mining",
    apiKey: "mining_conservation",
    label: "Уул уурхайн хамгаалалтын бүс",
    description: "Уул уурхайн нөхөн сэргээлтийн болон хамгаалалтын талбай",
    source: "egazar.gov.mn",
    kmlName: "Уул уурхайн хамгаалалт",
    color: "ff0088ff",
    colorHex: "#ff8800",
    width: 2,
    autoLoad: false,
  },
  {
    key: "cmcs_licenses",
    apiKey: "cmcs_licenses",
    label: "Уул уурхайн тусгай зөвшөөрөл (CMCS)",
    description: "Хайгуулын болон ашиглалтын тусгай зөвшөөрлүүд (2,800+)",
    source: "cmcs.mrpam.gov.mn",
    kmlName: "Уул уурхайн ТЗ",
    color: "ff3366ff",
    colorHex: "#ff6633",
    width: 2,
    autoLoad: false,
  },
];

export type GeoJSONFeature = {
  type: string;
  properties: Record<string, string>;
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
};

export type GeoJSONData = {
  type: string;
  features: GeoJSONFeature[];
};
```

- [ ] **Step 3: Commit**

```bash
git add app/lib/layers.ts package.json package-lock.json
git commit -m "feat: install leaflet + vercel/blob, extract layer config"
```

---

### Task 2: Vercel Blob caching layer

**Files:**
- Create: `app/lib/cache.ts`
- Modify: `app/api/data/route.ts`

- [ ] **Step 1: Create cache helpers**

Create `app/lib/cache.ts`:

```ts
import { put, head } from "@vercel/blob";

const CACHE_PREFIX = "cache/";
const STALE_MS = 60 * 60 * 1000; // 1 hour

export async function getCached(
  layerKey: string
): Promise<{ data: string; isStale: boolean } | null> {
  try {
    const blobUrl = `${CACHE_PREFIX}${layerKey}.json`;
    const meta = await head(blobUrl, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const age = Date.now() - new Date(meta.uploadedAt).getTime();
    const isStale = age > STALE_MS;

    const res = await fetch(meta.url);
    if (!res.ok) return null;
    const data = await res.text();
    return { data, isStale };
  } catch {
    return null;
  }
}

export async function setCache(layerKey: string, data: string): Promise<void> {
  await put(`${CACHE_PREFIX}${layerKey}.json`, data, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}
```

- [ ] **Step 2: Update API route with caching**

Replace `app/api/data/route.ts` with the caching wrapper. The existing fetch functions stay unchanged. Add this at the top of the file after imports:

```ts
import { after } from "next/server";
import { getCached, setCache } from "@/app/lib/cache";
```

Replace the `GET` handler:

```ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const layer = searchParams.get("layer");

  if (!layer || !LAYER_HANDLERS[layer]) {
    return NextResponse.json(
      { error: `Unknown layer. Available: ${Object.keys(LAYER_HANDLERS).join(", ")}` },
      { status: 400 }
    );
  }

  // Try cache first
  const cached = await getCached(layer);
  if (cached) {
    if (cached.isStale) {
      // Serve stale, refresh in background
      after(async () => {
        try {
          const fresh = await LAYER_HANDLERS[layer]();
          await setCache(layer, JSON.stringify(fresh));
        } catch {
          // Background refresh failed, stale cache remains
        }
      });
    }
    return new Response(cached.data, {
      headers: { "Content-Type": "application/json" },
    });
  }

  // No cache — fetch, cache, return
  try {
    const data = await LAYER_HANDLERS[layer]();
    const json = JSON.stringify(data);
    after(async () => {
      await setCache(layer, json);
    });
    return new Response(json, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: message, features: [], type: "FeatureCollection" },
      { status: 200 }
    );
  }
}
```

- [ ] **Step 3: Add BLOB_READ_WRITE_TOKEN to .env.local**

Create `.env.local` (if it doesn't exist) and add:

```
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_XXXXXXX
```

Get this token from: Vercel Dashboard → Project → Storage → Create Blob Store → Copy token.

Note: Add `.env.local` to `.gitignore` if not already there.

- [ ] **Step 4: Verify build compiles**

Run:
```bash
npm run build
```
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add app/lib/cache.ts app/api/data/route.ts .gitignore
git commit -m "feat: add Vercel Blob caching with stale-while-revalidate"
```

---

### Task 3: MapView component (Leaflet)

**Files:**
- Create: `app/components/MapView.tsx`

- [ ] **Step 1: Create the Leaflet map component**

Create `app/components/MapView.tsx`:

```tsx
"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJSONData, GeoJSONFeature, LayerConfig } from "@/app/lib/layers";

// Fix default marker icon path issue in bundlers
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface MapViewProps {
  activeLayers: Map<string, { config: LayerConfig; data: GeoJSONData }>;
  onFeatureClick: (feature: GeoJSONFeature, layerConfig: LayerConfig) => void;
}

export default function MapView({ activeLayers, onFeatureClick }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const geoJsonLayersRef = useRef<Map<string, L.GeoJSON>>(new Map());

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
    }).setView([47.0, 105.0], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 18,
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const handleFeatureClick = useCallback(
    (feature: GeoJSONFeature, config: LayerConfig) => {
      onFeatureClick(feature, config);
    },
    [onFeatureClick]
  );

  // Sync active layers to map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentKeys = new Set(activeLayers.keys());
    const renderedKeys = new Set(geoJsonLayersRef.current.keys());

    // Remove layers no longer active
    for (const key of renderedKeys) {
      if (!currentKeys.has(key)) {
        const layer = geoJsonLayersRef.current.get(key)!;
        map.removeLayer(layer);
        geoJsonLayersRef.current.delete(key);
      }
    }

    // Add new layers
    for (const [key, { config, data }] of activeLayers) {
      if (renderedKeys.has(key)) continue;

      const geoJsonLayer = L.geoJSON(data as unknown as GeoJSON.GeoJsonObject, {
        style: () => ({
          color: config.colorHex,
          weight: config.width,
          fillColor: config.colorHex,
          fillOpacity: 0.08,
        }),
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};
          const name = props.shapeName || props.NAME || props.name || "Тодорхойгүй";
          const type = props.type || config.label;

          layer.bindPopup(
            `<div style="font-family:sans-serif">
              <div style="font-weight:600;font-size:14px">${name}</div>
              <div style="color:#666;font-size:12px;margin-top:2px">${type}</div>
              ${props.description ? `<div style="color:#888;font-size:11px;margin-top:4px">${props.description}</div>` : ""}
              <div style="color:#2563eb;font-size:12px;margin-top:8px;cursor:pointer" class="detail-link">Дэлгэрэнгүй ↓</div>
            </div>`,
            { closeButton: true, maxWidth: 280 }
          );

          layer.on("popupopen", (e: L.LeafletEvent) => {
            const popupEl = (e as L.PopupEvent).popup.getElement();
            const link = popupEl?.querySelector(".detail-link");
            link?.addEventListener("click", () => {
              map.closePopup();
              handleFeatureClick(feature as unknown as GeoJSONFeature, config);
            });
          });
        },
      });

      geoJsonLayer.addTo(map);
      geoJsonLayersRef.current.set(key, geoJsonLayer);
    }
  }, [activeLayers, handleFeatureClick]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ zIndex: 0 }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/MapView.tsx
git commit -m "feat: add Leaflet MapView component with GeoJSON layer support"
```

---

### Task 4: BottomSheet component

**Files:**
- Create: `app/components/BottomSheet.tsx`

- [ ] **Step 1: Create the draggable bottom sheet**

Create `app/components/BottomSheet.tsx`:

```tsx
"use client";

import { useRef, useState, useCallback, useEffect } from "react";

type SheetState = "collapsed" | "half" | "full";

interface BottomSheetProps {
  state: SheetState;
  onStateChange: (state: SheetState) => void;
  children: React.ReactNode;
}

const SNAP_POINTS: Record<SheetState, string> = {
  collapsed: "4rem",
  half: "45vh",
  full: "85vh",
};

export default function BottomSheet({ state, onStateChange, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  const handleDragStart = useCallback((clientY: number) => {
    if (!sheetRef.current) return;
    dragRef.current = {
      startY: clientY,
      startHeight: sheetRef.current.getBoundingClientRect().height,
    };
  }, []);

  const handleDragMove = useCallback((clientY: number) => {
    if (!dragRef.current) return;
    const diff = dragRef.current.startY - clientY;
    const newHeight = Math.max(64, dragRef.current.startHeight + diff);
    setDragHeight(newHeight);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!dragRef.current || dragHeight === null) {
      dragRef.current = null;
      return;
    }
    dragRef.current = null;

    const vh = window.innerHeight;
    if (dragHeight < vh * 0.2) {
      onStateChange("collapsed");
    } else if (dragHeight < vh * 0.6) {
      onStateChange("half");
    } else {
      onStateChange("full");
    }
    setDragHeight(null);
  }, [dragHeight, onStateChange]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleDragMove(e.clientY);
    const handleMouseUp = () => handleDragEnd();
    const handleTouchMove = (e: TouchEvent) => handleDragMove(e.touches[0].clientY);
    const handleTouchEnd = () => handleDragEnd();

    if (dragRef.current) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleTouchEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleDragMove, handleDragEnd]);

  const height = dragHeight !== null ? `${dragHeight}px` : SNAP_POINTS[state];

  return (
    <div
      ref={sheetRef}
      className="absolute bottom-0 left-0 right-0 bg-neutral-900 rounded-t-2xl transition-[height] duration-300 ease-out overflow-hidden"
      style={{
        height,
        zIndex: 1000,
        transition: dragHeight !== null ? "none" : undefined,
      }}
    >
      {/* Drag handle */}
      <div
        className="flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
        onMouseDown={(e) => handleDragStart(e.clientY)}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
      >
        <div className="w-10 h-1 bg-neutral-600 rounded-full" />
      </div>

      {/* Content */}
      <div className="overflow-y-auto px-4 pb-8" style={{ maxHeight: "calc(100% - 3rem)" }}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/BottomSheet.tsx
git commit -m "feat: add draggable BottomSheet component with snap points"
```

---

### Task 5: LayerPanel component

**Files:**
- Create: `app/components/LayerPanel.tsx`

- [ ] **Step 1: Create the layer toggle panel**

Create `app/components/LayerPanel.tsx`:

```tsx
"use client";

import { LAYERS } from "@/app/lib/layers";

interface LayerPanelProps {
  activeKeys: Set<string>;
  loadingKeys: Set<string>;
  onToggle: (key: string) => void;
  onExportKml: () => void;
  exportDisabled: boolean;
}

export default function LayerPanel({
  activeKeys,
  loadingKeys,
  onToggle,
  onExportKml,
  exportDisabled,
}: LayerPanelProps) {
  return (
    <div>
      <h2 className="text-neutral-300 text-sm font-semibold mb-3">Давхаргууд</h2>
      <div className="space-y-1">
        {LAYERS.map((layer) => (
          <label
            key={layer.key}
            className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-neutral-800/50 transition-colors cursor-pointer"
          >
            <input
              type="checkbox"
              checked={activeKeys.has(layer.key)}
              onChange={() => onToggle(layer.key)}
              className="w-4 h-4 accent-blue-500 shrink-0"
            />
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: layer.colorHex }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-neutral-200 text-sm">{layer.label}</div>
              <div className="text-neutral-500 text-xs">{layer.description}</div>
            </div>
            {loadingKeys.has(layer.key) && (
              <span className="text-blue-400 text-xs animate-pulse">...</span>
            )}
          </label>
        ))}
      </div>

      <button
        onClick={onExportKml}
        disabled={exportDisabled || activeKeys.size === 0}
        className="w-full mt-4 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
      >
        KML татах ({activeKeys.size} давхарга)
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/LayerPanel.tsx
git commit -m "feat: add LayerPanel with toggle and KML export button"
```

---

### Task 6: FeatureDetail component

**Files:**
- Create: `app/components/FeatureDetail.tsx`

- [ ] **Step 1: Create the feature detail view**

Create `app/components/FeatureDetail.tsx`:

```tsx
"use client";

import type { GeoJSONFeature, LayerConfig } from "@/app/lib/layers";

interface FeatureDetailProps {
  feature: GeoJSONFeature;
  layerConfig: LayerConfig;
  onClose: () => void;
}

export default function FeatureDetail({ feature, layerConfig, onClose }: FeatureDetailProps) {
  const props = feature.properties || {};
  const name = props.shapeName || props.NAME || props.name || "Тодорхойгүй";
  const type = props.type || layerConfig.label;
  const description = props.description || "";
  const area = props.area || "";

  return (
    <div>
      <div className="flex justify-between items-start mb-3">
        <div>
          <span
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: layerConfig.colorHex }}
          >
            {type}
          </span>
          <h2 className="text-neutral-100 text-lg font-bold mt-1">{name}</h2>
          {description && (
            <p className="text-neutral-400 text-sm mt-1">{description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-neutral-500 hover:text-neutral-300 text-xl p-1 cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        {area && (
          <div className="bg-neutral-800 rounded-lg p-3">
            <div className="text-neutral-500 text-xs uppercase">Талбай</div>
            <div className="text-neutral-200 text-sm font-semibold mt-0.5">
              {area} га
            </div>
          </div>
        )}
        <div className="bg-neutral-800 rounded-lg p-3">
          <div className="text-neutral-500 text-xs uppercase">Эх сурвалж</div>
          <div className="text-neutral-200 text-sm font-semibold mt-0.5">
            {layerConfig.source}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/FeatureDetail.tsx
git commit -m "feat: add FeatureDetail component for bottom sheet"
```

---

### Task 7: Wire everything together in page.tsx

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Rewrite page.tsx as the map viewer**

Replace `app/page.tsx` entirely:

```tsx
"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useRef } from "react";
import { LAYERS, type GeoJSONData, type GeoJSONFeature, type LayerConfig } from "@/app/lib/layers";
import { geojsonToKml } from "@/app/lib/geojson-to-kml";
import BottomSheet from "@/app/components/BottomSheet";
import LayerPanel from "@/app/components/LayerPanel";
import FeatureDetail from "@/app/components/FeatureDetail";

const MapView = dynamic(() => import("@/app/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-neutral-950 flex items-center justify-center">
      <span className="text-neutral-500 text-sm">Газрын зураг ачаалж байна...</span>
    </div>
  ),
});

type SheetState = "collapsed" | "half" | "full";

async function fetchLayer(apiKey: string): Promise<GeoJSONData> {
  const res = await fetch(`/api/data?layer=${apiKey}`);
  if (!res.ok) throw new Error(`Алдаа: ${apiKey}`);
  return res.json();
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(
    new Set(LAYERS.filter((l) => l.autoLoad).map((l) => l.key))
  );
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const [layerData, setLayerData] = useState<Map<string, { config: LayerConfig; data: GeoJSONData }>>(new Map());
  const [sheetState, setSheetState] = useState<SheetState>("collapsed");
  const [selectedFeature, setSelectedFeature] = useState<{
    feature: GeoJSONFeature;
    layerConfig: LayerConfig;
  } | null>(null);

  const fetchedRef = useRef<Set<string>>(new Set());

  const loadLayer = useCallback(async (layer: LayerConfig) => {
    if (fetchedRef.current.has(layer.key)) return;
    fetchedRef.current.add(layer.key);

    setLoadingKeys((prev) => new Set(prev).add(layer.key));
    try {
      const data = await fetchLayer(layer.apiKey);
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

  // Auto-load layers on mount
  const autoLoadedRef = useRef(false);
  if (!autoLoadedRef.current) {
    autoLoadedRef.current = true;
    LAYERS.filter((l) => l.autoLoad).forEach((l) => loadLayer(l));
  }

  const handleToggle = useCallback(
    (key: string) => {
      setActiveKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
          const layer = LAYERS.find((l) => l.key === key);
          if (layer) loadLayer(layer);
        }
        return next;
      });
    },
    [loadLayer]
  );

  const handleFeatureClick = useCallback(
    (feature: GeoJSONFeature, layerConfig: LayerConfig) => {
      setSelectedFeature({ feature, layerConfig });
      setSheetState("half");
    },
    []
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedFeature(null);
    setSheetState("collapsed");
  }, []);

  const handleExportKml = useCallback(() => {
    const kmlLayers: { name: string; geojson: GeoJSONData; color: string; width: number }[] = [];

    for (const key of activeKeys) {
      const entry = layerData.get(key);
      if (entry && entry.data.features?.length > 0) {
        kmlLayers.push({
          name: entry.config.kmlName,
          geojson: entry.data,
          color: entry.config.color,
          width: entry.config.width,
        });
      }
    }

    if (kmlLayers.length === 0) return;
    const kml = geojsonToKml(kmlLayers);
    downloadFile(kml, "mongolia-gazryn-medeelel.kml");
  }, [activeKeys, layerData]);

  // Build map of only active+loaded layers
  const activeLayers = new Map<string, { config: LayerConfig; data: GeoJSONData }>();
  for (const key of activeKeys) {
    const entry = layerData.get(key);
    if (entry) activeLayers.set(key, entry);
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-neutral-950">
      <MapView activeLayers={activeLayers} onFeatureClick={handleFeatureClick} />

      {/* Tap to open layer panel */}
      {sheetState === "collapsed" && (
        <button
          onClick={() => setSheetState("half")}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-neutral-900/90 backdrop-blur text-neutral-300 text-sm px-4 py-2 rounded-full border border-neutral-700 cursor-pointer z-[1001]"
        >
          Давхаргууд ({activeKeys.size})
        </button>
      )}

      <BottomSheet state={sheetState} onStateChange={setSheetState}>
        {selectedFeature ? (
          <FeatureDetail
            feature={selectedFeature.feature}
            layerConfig={selectedFeature.layerConfig}
            onClose={handleCloseDetail}
          />
        ) : (
          <LayerPanel
            activeKeys={activeKeys}
            loadingKeys={loadingKeys}
            onToggle={handleToggle}
            onExportKml={handleExportKml}
            exportDisabled={loadingKeys.size > 0}
          />
        )}
      </BottomSheet>
    </main>
  );
}
```

- [ ] **Step 2: Update layout.tsx to remove body flex**

In `app/layout.tsx`, the body currently has `min-h-full flex flex-col`. The map page uses `h-screen` so this is fine — no change needed. Verify by checking the layout doesn't conflict.

- [ ] **Step 3: Verify build**

Run:
```bash
npm run build
```
Expected: Build succeeds. There will be a warning about dynamic import — that's expected.

- [ ] **Step 4: Test locally**

Run:
```bash
npm run dev
```
Expected:
- Map loads centered on Mongolia (lat 47, lng 105, zoom 5)
- Aimag and soum borders auto-load (may be slow first time without Blob cache, which requires Vercel deployment)
- Bottom sheet drags up to show layer toggles
- Toggling a layer on fetches and displays it
- Clicking a polygon shows popup with "Дэлгэрэнгүй ↓" link
- Clicking link opens feature detail in bottom sheet
- KML export works for active layers

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: replace KML export page with interactive map viewer"
```

---

### Task 8: Vercel deployment config

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Ensure .env.local and .superpowers are gitignored**

Check `.gitignore` and add if missing:

```
.env.local
.superpowers/
```

- [ ] **Step 2: Set environment variable on Vercel**

In Vercel Dashboard → Project Settings → Environment Variables, add:
- Key: `BLOB_READ_WRITE_TOKEN`
- Value: (from Vercel Blob Store setup)

This is a manual step — create the Blob store first:
1. Vercel Dashboard → Storage → Create → Blob
2. Connect to your project
3. The `BLOB_READ_WRITE_TOKEN` is auto-added to your project's env vars

- [ ] **Step 3: Deploy and verify**

Run:
```bash
git push
```
Expected: Vercel deploys automatically. First load of each layer will be slow (fetching from gov APIs), subsequent loads instant (served from Blob cache).

- [ ] **Step 4: Commit gitignore changes**

```bash
git add .gitignore
git commit -m "chore: add .env.local and .superpowers to gitignore"
```
