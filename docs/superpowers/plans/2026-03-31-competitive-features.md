# Competitive Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add overlap intelligence, selective export, and data monitoring to differentiate from government GIS portals.

**Architecture:** Client-side spatial analysis using Turf.js for overlap detection, search, and area filtering. KMZ compression via fflate. GitHub Actions for weekly monitoring with email alerts. No new Vercel serverless functions needed for A or B.

**Tech Stack:** Turf.js, fflate, leaflet-draw, nodemailer (GitHub Action only), GitHub Actions

---

## File Structure

### New files
- `app/lib/overlap.ts` — Overlap detection logic (turf.intersect, area calculation)
- `app/lib/search.ts` — Client-side feature search/filter logic
- `app/lib/kmz.ts` — KMZ compression using fflate
- `app/components/SearchBar.tsx` — Search input + results dropdown
- `app/components/OverlapResults.tsx` — Overlap results list shown in FeatureDetail
- `.github/workflows/monitor.yml` — Weekly data monitoring workflow
- `.github/scripts/monitor.ts` — Monitoring script (fetch, diff, email)

### Modified files
- `app/components/FeatureDetail.tsx` — Add area display, overlap button, overlap results
- `app/components/LayerPanel.tsx` — Add search bar, freshness indicators, export mode toggle
- `app/components/MapView.tsx` — Add leaflet-draw rectangle, highlight overlaps, fly-to from search
- `app/components/BottomSheet.tsx` — No changes needed
- `app/page.tsx` — Wire up search state, overlap state, export-by-area state, pass layerData to search
- `app/api/export/route.ts` — Accept optional bbox parameter to filter features server-side
- `app/api/data/route.ts` — Return `X-Cache-Updated` header with cache timestamp
- `app/lib/cache.ts` — Add `getCacheTimestamp()` function
- `package.json` — Add @turf/turf, fflate, leaflet-draw, @types/leaflet-draw

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install turf, fflate, and leaflet-draw**

```bash
npm install @turf/turf fflate leaflet-draw @types/leaflet-draw
```

- [ ] **Step 2: Verify build still works**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add turf.js, fflate, and leaflet-draw dependencies"
```

---

## Task 2: Search & Filter

**Files:**
- Create: `app/lib/search.ts`
- Create: `app/components/SearchBar.tsx`
- Modify: `app/components/LayerPanel.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create search utility**

Create `app/lib/search.ts`:

```typescript
import type { GeoJSONFeature, LayerConfig } from "@/app/lib/layers";

export interface SearchResult {
  feature: GeoJSONFeature;
  layerConfig: LayerConfig;
  matchField: string;
}

export function searchFeatures(
  query: string,
  layerData: Map<string, { config: LayerConfig; data: { features: GeoJSONFeature[] } }>,
  maxResults: number = 50
): SearchResult[] {
  if (!query || query.length < 2) return [];

  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const [, { config, data }] of layerData) {
    for (const feature of data.features) {
      if (results.length >= maxResults) return results;

      const props = feature.properties || {};
      const fields = [props.shapeName, props.description, props.parcelId, props.area];

      for (const field of fields) {
        if (field && field.toLowerCase().includes(q)) {
          results.push({ feature, layerConfig: config, matchField: field });
          break;
        }
      }
    }
  }

  return results;
}
```

- [ ] **Step 2: Create SearchBar component**

Create `app/components/SearchBar.tsx`:

```tsx
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { GeoJSONData, GeoJSONFeature, LayerConfig } from "@/app/lib/layers";
import { searchFeatures, type SearchResult } from "@/app/lib/search";

interface SearchBarProps {
  layerData: Map<string, { config: LayerConfig; data: GeoJSONData }>;
  onSelect: (feature: GeoJSONFeature, layerConfig: LayerConfig) => void;
}

export default function SearchBar({ layerData, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const r = searchFeatures(value, layerData);
        setResults(r);
        setOpen(r.length > 0);
      }, 200);
    },
    [layerData]
  );

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      setQuery("");
      onSelect(result.feature, result.layerConfig);
    },
    [onSelect]
  );

  // Close dropdown when clicking outside
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative mb-3">
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Хайх... (нэр, код, тайлбар)"
        className="w-full bg-neutral-800 text-neutral-200 text-sm rounded-lg px-3 py-2 border border-neutral-700 focus:border-blue-500 focus:outline-none placeholder:text-neutral-500"
      />
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-neutral-800 border border-neutral-700 rounded-lg max-h-60 overflow-y-auto z-50">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 hover:bg-neutral-700 transition-colors cursor-pointer"
            >
              <div className="text-neutral-200 text-sm truncate">
                {r.feature.properties?.shapeName || "Тодорхойгүй"}
              </div>
              <div className="text-neutral-500 text-xs truncate">
                {r.layerConfig.label}
                {r.feature.properties?.description ? ` — ${r.feature.properties.description}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add SearchBar to LayerPanel**

Modify `app/components/LayerPanel.tsx` — add `layerData` and `onSearchSelect` props, render SearchBar at the top:

```tsx
"use client";

import { LAYERS, type GeoJSONData, type GeoJSONFeature, type LayerConfig } from "@/app/lib/layers";
import SearchBar from "@/app/components/SearchBar";

interface LayerPanelProps {
  activeKeys: Set<string>;
  loadingKeys: Set<string>;
  layerData: Map<string, { config: LayerConfig; data: GeoJSONData }>;
  onToggle: (key: string) => void;
  onSearchSelect: (feature: GeoJSONFeature, layerConfig: LayerConfig) => void;
  onExportKml: () => void;
  exportDisabled: boolean;
}

export default function LayerPanel({
  activeKeys,
  loadingKeys,
  layerData,
  onToggle,
  onSearchSelect,
  onExportKml,
  exportDisabled,
}: LayerPanelProps) {
  return (
    <div>
      <SearchBar layerData={layerData} onSelect={onSearchSelect} />
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

- [ ] **Step 4: Wire up search in page.tsx**

Modify `app/page.tsx` — pass `layerData` and `onSearchSelect` to LayerPanel. The `onSearchSelect` handler should call `handleFeatureClick` to fly to the feature and show detail:

Add to the `<LayerPanel>` component in page.tsx:
```tsx
<LayerPanel
  activeKeys={activeKeys}
  loadingKeys={loadingKeys}
  layerData={layerData}
  onToggle={handleToggle}
  onSearchSelect={handleFeatureClick}
  onExportKml={handleExportKml}
  exportDisabled={loadingKeys.size > 0 || exporting}
/>
```

- [ ] **Step 5: Add fly-to-feature in MapView**

Modify `app/components/MapView.tsx` — add a `selectedFeature` prop. When it changes, fly the map to that feature's bounds:

Add to MapViewProps:
```typescript
interface MapViewProps {
  activeLayers: Map<string, { config: LayerConfig; data: GeoJSONData }>;
  onFeatureClick: (feature: GeoJSONFeature, layerConfig: LayerConfig) => void;
  selectedFeature?: GeoJSONFeature | null;
}
```

Add a useEffect that flies to the feature when selectedFeature changes:
```typescript
useEffect(() => {
  const map = mapRef.current;
  if (!map || !selectedFeature?.geometry) return;

  const tempLayer = L.geoJSON(selectedFeature as unknown as GeoJSON.GeoJsonObject);
  const bounds = tempLayer.getBounds();
  if (bounds.isValid()) {
    map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 12 });
  }
}, [selectedFeature]);
```

Pass `selectedFeature` from page.tsx:
```tsx
<MapView
  activeLayers={activeLayers}
  onFeatureClick={handleFeatureClick}
  selectedFeature={selectedFeature?.feature}
/>
```

- [ ] **Step 6: Verify search works**

```bash
npm run build
```

Run `npm run dev` and test: load aimags layer, type "Улаан" in search, verify results appear and selecting one flies the map.

- [ ] **Step 7: Commit**

```bash
git add app/lib/search.ts app/components/SearchBar.tsx app/components/LayerPanel.tsx app/components/MapView.tsx app/page.tsx
git commit -m "feat: add client-side search across loaded layers"
```

---

## Task 3: Area Display in FeatureDetail

**Files:**
- Modify: `app/components/FeatureDetail.tsx`

- [ ] **Step 1: Add Turf area calculation**

Modify `app/components/FeatureDetail.tsx` — import turf area and compute hectares from the feature geometry:

```tsx
"use client";

import * as turf from "@turf/turf";
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

  // Calculate area from geometry in hectares
  let areaHa = "";
  try {
    if (feature.geometry) {
      const sqMeters = turf.area(feature as unknown as turf.helpers.Feature);
      areaHa = (sqMeters / 10000).toFixed(1);
    }
  } catch {
    // geometry might be invalid
  }

  // Fall back to property if calculation failed
  const displayArea = areaHa || props.area || "";

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
        {displayArea && (
          <div className="bg-neutral-800 rounded-lg p-3">
            <div className="text-neutral-500 text-xs uppercase">Талбай</div>
            <div className="text-neutral-200 text-sm font-semibold mt-0.5">
              {displayArea} га
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

- [ ] **Step 2: Verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app/components/FeatureDetail.tsx
git commit -m "feat: show computed area in hectares in feature detail"
```

---

## Task 4: Overlap Detection

**Files:**
- Create: `app/lib/overlap.ts`
- Create: `app/components/OverlapResults.tsx`
- Modify: `app/components/FeatureDetail.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create overlap utility**

Create `app/lib/overlap.ts`:

```typescript
import * as turf from "@turf/turf";
import type { GeoJSONFeature, GeoJSONData, LayerConfig } from "@/app/lib/layers";

export interface OverlapResult {
  feature: GeoJSONFeature;
  layerConfig: LayerConfig;
  overlapPercent: number;
}

export function findOverlaps(
  target: GeoJSONFeature,
  layerData: Map<string, { config: LayerConfig; data: GeoJSONData }>,
  targetLayerKey: string
): OverlapResult[] {
  const results: OverlapResult[] = [];

  let targetArea: number;
  try {
    targetArea = turf.area(target as unknown as turf.helpers.Feature);
  } catch {
    return results;
  }

  if (targetArea === 0) return results;

  for (const [key, { config, data }] of layerData) {
    if (key === targetLayerKey) continue;

    for (const feature of data.features) {
      if (!feature.geometry) continue;

      try {
        // Convert MultiPolygon to individual polygons for intersection
        const targetPolys = toPolygons(target);
        const candidatePolys = toPolygons(feature);

        let overlapArea = 0;
        for (const tp of targetPolys) {
          for (const cp of candidatePolys) {
            try {
              const intersection = turf.intersect(
                turf.featureCollection([tp, cp])
              );
              if (intersection) {
                overlapArea += turf.area(intersection);
              }
            } catch {
              // Invalid geometry pair, skip
            }
          }
        }

        if (overlapArea > 0) {
          const overlapPercent = Math.round((overlapArea / targetArea) * 100);
          if (overlapPercent >= 1) {
            results.push({ feature, layerConfig: config, overlapPercent });
          }
        }
      } catch {
        // Skip invalid geometries
      }
    }
  }

  results.sort((a, b) => b.overlapPercent - a.overlapPercent);
  return results;
}

function toPolygons(feature: GeoJSONFeature): turf.helpers.Feature<turf.helpers.Polygon>[] {
  if (feature.geometry.type === "Polygon") {
    return [turf.polygon(feature.geometry.coordinates as number[][][])];
  }
  if (feature.geometry.type === "MultiPolygon") {
    return (feature.geometry.coordinates as number[][][][]).map((coords) =>
      turf.polygon(coords)
    );
  }
  return [];
}
```

- [ ] **Step 2: Create OverlapResults component**

Create `app/components/OverlapResults.tsx`:

```tsx
"use client";

import type { OverlapResult } from "@/app/lib/overlap";

interface OverlapResultsProps {
  results: OverlapResult[];
  loading: boolean;
  onSelect: (result: OverlapResult) => void;
}

export default function OverlapResults({ results, loading, onSelect }: OverlapResultsProps) {
  if (loading) {
    return (
      <div className="mt-4 text-neutral-400 text-sm animate-pulse">
        Давхцал шалгаж байна...
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="mt-4 text-neutral-500 text-sm">
        Давхцал олдсонгүй.
      </div>
    );
  }

  return (
    <div className="mt-4">
      <h3 className="text-neutral-400 text-xs font-semibold uppercase mb-2">
        Давхцал ({results.length})
      </h3>
      <div className="space-y-1">
        {results.map((r, i) => (
          <button
            key={i}
            onClick={() => onSelect(r)}
            className="w-full text-left px-3 py-2 bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors cursor-pointer"
          >
            <div className="flex justify-between items-center">
              <div className="min-w-0 flex-1">
                <div className="text-neutral-200 text-sm truncate">
                  {r.feature.properties?.shapeName || "Тодорхойгүй"}
                </div>
                <div className="text-neutral-500 text-xs">{r.layerConfig.label}</div>
              </div>
              <span
                className="text-sm font-bold ml-2 shrink-0"
                style={{ color: r.overlapPercent > 50 ? "#ef4444" : "#f59e0b" }}
              >
                {r.overlapPercent}%
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add overlap to FeatureDetail**

Modify `app/components/FeatureDetail.tsx` — add overlap button and results section. Add new props:

```tsx
"use client";

import { useState, useCallback } from "react";
import * as turf from "@turf/turf";
import type { GeoJSONFeature, GeoJSONData, LayerConfig } from "@/app/lib/layers";
import { findOverlaps, type OverlapResult } from "@/app/lib/overlap";
import OverlapResults from "@/app/components/OverlapResults";

interface FeatureDetailProps {
  feature: GeoJSONFeature;
  layerConfig: LayerConfig;
  layerData: Map<string, { config: LayerConfig; data: GeoJSONData }>;
  onClose: () => void;
  onOverlapSelect: (feature: GeoJSONFeature, layerConfig: LayerConfig) => void;
  onExportCsv: (target: GeoJSONFeature, targetLayer: LayerConfig, overlaps: OverlapResult[]) => void;
}

export default function FeatureDetail({
  feature,
  layerConfig,
  layerData,
  onClose,
  onOverlapSelect,
  onExportCsv,
}: FeatureDetailProps) {
  const [overlaps, setOverlaps] = useState<OverlapResult[] | null>(null);
  const [checkingOverlap, setCheckingOverlap] = useState(false);

  const props = feature.properties || {};
  const name = props.shapeName || props.NAME || props.name || "Тодорхойгүй";
  const type = props.type || layerConfig.label;
  const description = props.description || "";

  let areaHa = "";
  try {
    if (feature.geometry) {
      const sqMeters = turf.area(feature as unknown as turf.helpers.Feature);
      areaHa = (sqMeters / 10000).toFixed(1);
    }
  } catch {}
  const displayArea = areaHa || props.area || "";

  const handleCheckOverlap = useCallback(() => {
    setCheckingOverlap(true);
    // Use setTimeout to avoid blocking UI during heavy computation
    setTimeout(() => {
      const results = findOverlaps(feature, layerData, layerConfig.key);
      setOverlaps(results);
      setCheckingOverlap(false);
    }, 50);
  }, [feature, layerData, layerConfig.key]);

  const handleOverlapSelect = useCallback(
    (result: OverlapResult) => {
      onOverlapSelect(result.feature, result.layerConfig);
    },
    [onOverlapSelect]
  );

  const loadedLayerCount = layerData.size;
  const totalLayerCount = 7; // LAYERS.length

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
        {displayArea && (
          <div className="bg-neutral-800 rounded-lg p-3">
            <div className="text-neutral-500 text-xs uppercase">Талбай</div>
            <div className="text-neutral-200 text-sm font-semibold mt-0.5">
              {displayArea} га
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

      {/* Overlap detection */}
      {overlaps === null && !checkingOverlap && (
        <button
          onClick={handleCheckOverlap}
          className="w-full mt-4 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer"
        >
          Давхцал шалгах
        </button>
      )}

      {(checkingOverlap || overlaps !== null) && (
        <OverlapResults
          results={overlaps || []}
          loading={checkingOverlap}
          onSelect={handleOverlapSelect}
        />
      )}

      {overlaps !== null && overlaps.length > 0 && (
        <button
          onClick={() => onExportCsv(feature, layerConfig, overlaps)}
          className="w-full mt-3 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 font-medium rounded-lg text-sm transition-colors cursor-pointer"
        >
          Тайлан татах (CSV)
        </button>
      )}

      {loadedLayerCount < totalLayerCount && overlaps !== null && (
        <p className="text-neutral-500 text-xs mt-2">
          Илүү олон давхарга нэмж давхцлыг бүрэн шалгана уу ({loadedLayerCount}/{totalLayerCount} ачаалсан)
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire up overlap in page.tsx**

Modify `app/page.tsx` — add CSV export handler and pass new props to FeatureDetail:

Add this CSV export function inside the `Home` component:

```typescript
const handleExportCsv = useCallback(
  (target: GeoJSONFeature, targetLayer: LayerConfig, overlaps: OverlapResult[]) => {
    const targetName = target.properties?.shapeName || "Тодорхойгүй";
    let targetArea = "";
    try {
      const sqMeters = turf.area(target as unknown as turf.helpers.Feature);
      targetArea = (sqMeters / 10000).toFixed(1);
    } catch {}

    const header = "Сонгосон нэр,Сонгосон давхарга,Сонгосон талбай (га),Давхцсан нэр,Давхцсан давхарга,Давхцал %,Огноо";
    const rows = overlaps.map((o) => {
      const oName = o.feature.properties?.shapeName || "Тодорхойгүй";
      return `"${targetName}","${targetLayer.label}","${targetArea}","${oName}","${o.layerConfig.label}","${o.overlapPercent}","${new Date().toISOString()}"`;
    });

    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "davhtsal-tailan.csv";
    a.click();
    URL.revokeObjectURL(url);
  },
  []
);
```

Add imports at the top of page.tsx:
```typescript
import * as turf from "@turf/turf";
import type { OverlapResult } from "@/app/lib/overlap";
```

Update FeatureDetail rendering in page.tsx:
```tsx
<FeatureDetail
  feature={selectedFeature.feature}
  layerConfig={selectedFeature.layerConfig}
  layerData={layerData}
  onClose={handleCloseDetail}
  onOverlapSelect={handleFeatureClick}
  onExportCsv={handleExportCsv}
/>
```

- [ ] **Step 5: Verify**

```bash
npm run build
```

Run `npm run dev`, load 2+ layers, tap a feature, tap "Давхцал шалгах", verify overlap results appear.

- [ ] **Step 6: Commit**

```bash
git add app/lib/overlap.ts app/components/OverlapResults.tsx app/components/FeatureDetail.tsx app/page.tsx
git commit -m "feat: add overlap detection with CSV export"
```

---

## Task 5: Selective Export (Draw Rectangle)

**Files:**
- Modify: `app/components/MapView.tsx`
- Modify: `app/page.tsx`
- Modify: `app/components/LayerPanel.tsx`

- [ ] **Step 1: Add draw rectangle to MapView**

Modify `app/components/MapView.tsx` — add leaflet-draw rectangle control and callback:

Add to imports:
```typescript
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
```

Add to MapViewProps:
```typescript
interface MapViewProps {
  activeLayers: Map<string, { config: LayerConfig; data: GeoJSONData }>;
  onFeatureClick: (feature: GeoJSONFeature, layerConfig: LayerConfig) => void;
  selectedFeature?: GeoJSONFeature | null;
  onBboxDrawn?: (bbox: [number, number, number, number]) => void;
}
```

Add a draw control after map initialization in the first useEffect, before the `return`:
```typescript
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
  position: "topright",
  draw: {
    rectangle: {
      shapeOptions: { color: "#f59e0b", weight: 2, fillOpacity: 0.1 },
    },
    polygon: false,
    polyline: false,
    circle: false,
    marker: false,
    circlemarker: false,
  },
  edit: { featureGroup: drawnItems },
});
map.addControl(drawControl);

map.on(L.Draw.Event.CREATED, (event: L.LeafletEvent) => {
  const e = event as L.DrawEvents.Created;
  drawnItems.clearLayers();
  drawnItems.addLayer(e.layer);
  const bounds = (e.layer as L.Rectangle).getBounds();
  // bbox: [west, south, east, north]
  const bbox: [number, number, number, number] = [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ];
  // Store bbox on the map instance for external access
  (map as unknown as Record<string, unknown>).__exportBbox = bbox;
});

map.on(L.Draw.Event.DELETED, () => {
  (map as unknown as Record<string, unknown>).__exportBbox = null;
});
```

Expose `mapRef` via a callback prop or ref. Simpler approach — add an `onBboxDrawn` callback that fires on draw:

Replace the `L.Draw.Event.CREATED` handler body with:
```typescript
map.on(L.Draw.Event.CREATED, (event: L.LeafletEvent) => {
  const e = event as L.DrawEvents.Created;
  drawnItems.clearLayers();
  drawnItems.addLayer(e.layer);
  const bounds = (e.layer as L.Rectangle).getBounds();
  const bbox: [number, number, number, number] = [
    bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
  ];
  if (onBboxDrawnRef.current) onBboxDrawnRef.current(bbox);
});
```

Use a ref for the callback to avoid re-creating the draw control:
```typescript
const onBboxDrawnRef = useRef(onBboxDrawn);
onBboxDrawnRef.current = onBboxDrawn;
```

- [ ] **Step 2: Add bbox state and export-by-area to page.tsx**

Add to page.tsx:
```typescript
const [exportBbox, setExportBbox] = useState<[number, number, number, number] | null>(null);
```

Pass to MapView:
```tsx
<MapView
  activeLayers={activeLayers}
  onFeatureClick={handleFeatureClick}
  selectedFeature={selectedFeature?.feature}
  onBboxDrawn={setExportBbox}
/>
```

Modify `handleExportKml` to pass bbox to the export API:
```typescript
const handleExportKml = useCallback(async () => {
  const apiKeys: string[] = [];
  for (const key of activeKeys) {
    const layer = LAYERS.find((l) => l.key === key);
    if (layer) apiKeys.push(layer.apiKey);
  }
  if (apiKeys.length === 0) return;

  setExporting(true);
  try {
    const body: { layers: string[]; bbox?: [number, number, number, number] } = { layers: apiKeys };
    if (exportBbox) body.bbox = exportBbox;

    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
}, [activeKeys, exportBbox]);
```

- [ ] **Step 3: Update export API to accept bbox**

Modify `app/api/export/route.ts` — accept optional `bbox` in the request body. If provided, filter features using turf.booleanIntersects before KML generation:

Add at top of file:
```typescript
import * as turf from "@turf/turf";
```

After parsing the body, extract bbox:
```typescript
const bbox: [number, number, number, number] | undefined = body.bbox;
```

After parsing each layer's GeoJSON, add bbox filtering before pushing to kmlLayers:
```typescript
let features = parsed.features;
if (bbox) {
  const bboxPoly = turf.bboxPolygon(bbox);
  features = features.filter((f: { geometry: unknown }) => {
    try {
      return turf.booleanIntersects(
        f as unknown as turf.helpers.Feature,
        bboxPoly
      );
    } catch {
      return false;
    }
  });
}

if (features.length === 0) continue;

kmlLayers.push({
  name: layerConfig.kmlName,
  geojson: { ...parsed, features },
  color: layerConfig.color,
  width: layerConfig.width,
});
```

- [ ] **Step 4: Update export button text in LayerPanel**

Modify `app/components/LayerPanel.tsx` — add `hasBbox` prop and change button text:

Add to props:
```typescript
hasBbox?: boolean;
```

Update button text:
```tsx
<button
  onClick={onExportKml}
  disabled={exportDisabled || activeKeys.size === 0}
  className="w-full mt-4 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
>
  {hasBbox ? "Сонгосон хэсэг KML татах" : `KML татах (${activeKeys.size} давхарга)`}
</button>
```

Pass from page.tsx:
```tsx
hasBbox={exportBbox !== null}
```

- [ ] **Step 5: Verify**

```bash
npm run build
```

Run `npm run dev`, draw a rectangle on the map, verify button text changes, export only contains features in the rectangle.

- [ ] **Step 6: Commit**

```bash
git add app/components/MapView.tsx app/page.tsx app/api/export/route.ts app/components/LayerPanel.tsx
git commit -m "feat: add selective export by drawn rectangle"
```

---

## Task 6: KMZ Compressed Export

**Files:**
- Create: `app/lib/kmz.ts`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create KMZ utility**

Create `app/lib/kmz.ts`:

```typescript
import { zipSync, strToU8 } from "fflate";

export function kmlToKmz(kmlString: string): Uint8Array {
  return zipSync({
    "doc.kml": strToU8(kmlString),
  });
}
```

- [ ] **Step 2: Modify export to produce KMZ**

Modify `app/page.tsx` — after receiving the KML blob from the API, compress it to KMZ:

Replace the blob download section in `handleExportKml`:
```typescript
const kmlText = await res.text();

// Compress to KMZ
const { kmlToKmz } = await import("@/app/lib/kmz");
const kmzData = kmlToKmz(kmlText);
const blob = new Blob([kmzData], { type: "application/vnd.google-earth.kmz" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "mongolia-gazryn-medeelel.kmz";
a.click();
URL.revokeObjectURL(url);
```

- [ ] **Step 3: Verify**

```bash
npm run build
```

Run `npm run dev`, export a layer, verify `.kmz` file downloads and opens in Google Earth or AlpineQuest.

- [ ] **Step 4: Commit**

```bash
git add app/lib/kmz.ts app/page.tsx
git commit -m "feat: export as compressed KMZ instead of KML"
```

---

## Task 7: Freshness Indicators

**Files:**
- Modify: `app/lib/cache.ts`
- Modify: `app/api/data/route.ts`
- Modify: `app/components/LayerPanel.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Add cache timestamp to API response**

Modify `app/lib/cache.ts` — add a function to get cache timestamp:

```typescript
export async function getCacheTimestamp(layerKey: string): Promise<string | null> {
  try {
    const { blobs } = await list({
      prefix: `${CACHE_PREFIX}${layerKey}.json`,
      limit: 1,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (blobs.length === 0) return null;
    return blobs[0].uploadedAt;
  } catch {
    return null;
  }
}
```

Modify `app/api/data/route.ts` — include `X-Cache-Updated` header in responses:

After the `getCached` call, add the timestamp header:
```typescript
if (cached) {
  // ... existing stale-while-revalidate logic ...
  return new Response(cached.data, {
    headers: {
      "Content-Type": "application/json",
      "X-Cache-Updated": cached.uploadedAt || "",
    },
  });
}
```

Update `getCached` return type to include `uploadedAt`. Modify `app/lib/cache.ts`:

```typescript
export async function getCached(
  layerKey: string
): Promise<{ data: string; isStale: boolean; uploadedAt: string } | null> {
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
    return { data, isStale, uploadedAt: blob.uploadedAt };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Store freshness info client-side**

Modify `app/page.tsx` — capture the `X-Cache-Updated` header when fetching layers:

Update the `fetchLayer` function:
```typescript
async function fetchLayer(apiKey: string): Promise<{ data: GeoJSONData; updatedAt: string | null }> {
  const res = await fetch(`/api/data?layer=${apiKey}`);
  if (!res.ok) throw new Error(`Алдаа: ${apiKey}`);
  const data = await res.json();
  const updatedAt = res.headers.get("X-Cache-Updated");
  return { data, updatedAt };
}
```

Add state for freshness:
```typescript
const [freshness, setFreshness] = useState<Map<string, string>>(new Map());
```

Update `loadLayer` to store freshness:
```typescript
const { data, updatedAt } = await fetchLayer(layer.apiKey);
if (data.features?.length > 0) {
  setLayerData((prev) => {
    const next = new Map(prev);
    next.set(layer.key, { config: layer, data });
    return next;
  });
  if (updatedAt) {
    setFreshness((prev) => {
      const next = new Map(prev);
      next.set(layer.key, updatedAt);
      return next;
    });
  }
}
```

Pass to LayerPanel:
```tsx
<LayerPanel
  ...
  freshness={freshness}
/>
```

- [ ] **Step 3: Display freshness in LayerPanel**

Modify `app/components/LayerPanel.tsx` — add `freshness` prop and show relative time:

Add to props:
```typescript
freshness?: Map<string, string>;
```

Add a helper function above the component:
```typescript
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} мин өмнө`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} цагийн өмнө`;
  const days = Math.floor(hours / 24);
  return `${days} өдрийн өмнө`;
}
```

Add freshness below each layer's description:
```tsx
<div className="text-neutral-200 text-sm">{layer.label}</div>
<div className="text-neutral-500 text-xs">{layer.description}</div>
{freshness?.get(layer.key) && (
  <div className="text-neutral-600 text-xs mt-0.5">
    Шинэчлэгдсэн: {timeAgo(freshness.get(layer.key)!)}
  </div>
)}
```

- [ ] **Step 4: Verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add app/lib/cache.ts app/api/data/route.ts app/components/LayerPanel.tsx app/page.tsx
git commit -m "feat: show data freshness indicators on layer cards"
```

---

## Task 8: GitHub Actions Weekly Monitor + Email Alerts

**Files:**
- Create: `.github/workflows/monitor.yml`
- Create: `.github/scripts/monitor.ts`

- [ ] **Step 1: Create the monitoring script**

Create `.github/scripts/monitor.ts`:

```typescript
import * as nodemailer from "nodemailer";

const API_BASE = process.env.APP_URL || "https://mongolia-map.vercel.app";
const LAYERS = ["aimags", "soums", "spa", "protection_zones", "land_parcels", "mining_conservation", "cmcs_licenses"];

interface Snapshot {
  layer: string;
  featureCount: number;
  features: { id: string; name: string }[];
  timestamp: string;
}

interface ChangeReport {
  layer: string;
  added: { id: string; name: string }[];
  removed: { id: string; name: string }[];
  countBefore: number;
  countAfter: number;
}

async function fetchLayerSnapshot(layer: string): Promise<Snapshot> {
  const res = await fetch(`${API_BASE}/api/data?layer=${layer}`, {
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Failed to fetch ${layer}: ${res.status}`);
  const data = await res.json();

  const features = (data.features || []).map((f: { properties?: Record<string, string> }, i: number) => ({
    id: f.properties?.parcelId || f.properties?.shapeName || `feature-${i}`,
    name: f.properties?.shapeName || "Тодорхойгүй",
  }));

  return {
    layer,
    featureCount: features.length,
    features,
    timestamp: new Date().toISOString(),
  };
}

function diffSnapshots(oldSnap: Snapshot, newSnap: Snapshot): ChangeReport | null {
  const oldIds = new Set(oldSnap.features.map((f) => f.id));
  const newIds = new Set(newSnap.features.map((f) => f.id));

  const added = newSnap.features.filter((f) => !oldIds.has(f.id));
  const removed = oldSnap.features.filter((f) => !newIds.has(f.id));

  if (added.length === 0 && removed.length === 0) return null;

  return {
    layer: newSnap.layer,
    added,
    removed,
    countBefore: oldSnap.featureCount,
    countAfter: newSnap.featureCount,
  };
}

async function sendEmail(changes: ChangeReport[]) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const body = changes
    .map((c) => {
      let text = `📍 ${c.layer}: ${c.countBefore} → ${c.countAfter}\n`;
      if (c.added.length > 0) {
        text += `  Нэмэгдсэн (${c.added.length}):\n`;
        text += c.added.slice(0, 20).map((f) => `    + ${f.name}`).join("\n");
        if (c.added.length > 20) text += `\n    ... +${c.added.length - 20} бусад`;
      }
      if (c.removed.length > 0) {
        text += `\n  Хасагдсан (${c.removed.length}):\n`;
        text += c.removed.slice(0, 20).map((f) => `    - ${f.name}`).join("\n");
        if (c.removed.length > 20) text += `\n    ... +${c.removed.length - 20} бусад`;
      }
      return text;
    })
    .join("\n\n");

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.MONITOR_EMAIL_RECIPIENTS,
    subject: `Mongolia Map: ${changes.length} давхаргад өөрчлөлт илэрсэн`,
    text: `Долоо хоног тутмын шалгалт - ${new Date().toISOString()}\n\n${body}\n\nШалгах: ${API_BASE}`,
  });
}

async function main() {
  const fs = await import("fs");
  const path = await import("path");
  const snapshotDir = path.join(process.cwd(), "snapshots");

  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

  const changes: ChangeReport[] = [];

  for (const layer of LAYERS) {
    console.log(`Fetching ${layer}...`);
    try {
      const newSnap = await fetchLayerSnapshot(layer);
      const snapFile = path.join(snapshotDir, `${layer}.json`);

      if (fs.existsSync(snapFile)) {
        const oldSnap: Snapshot = JSON.parse(fs.readFileSync(snapFile, "utf-8"));
        const diff = diffSnapshots(oldSnap, newSnap);
        if (diff) {
          console.log(`  Changes detected: +${diff.added.length} -${diff.removed.length}`);
          changes.push(diff);
        } else {
          console.log(`  No changes`);
        }
      } else {
        console.log(`  First snapshot (${newSnap.featureCount} features)`);
      }

      fs.writeFileSync(snapFile, JSON.stringify(newSnap, null, 2));
    } catch (e) {
      console.error(`  Error fetching ${layer}:`, e);
    }
  }

  if (changes.length > 0 && process.env.GMAIL_USER) {
    console.log(`\nSending email with ${changes.length} changes...`);
    await sendEmail(changes);
    console.log("Email sent.");
  } else if (changes.length === 0) {
    console.log("\nNo changes detected across any layers.");
  } else {
    console.log("\nChanges detected but no email configured (GMAIL_USER not set).");
    console.log(JSON.stringify(changes, null, 2));
  }
}

main().catch((e) => {
  console.error("Monitor failed:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Create GitHub Actions workflow**

Create `.github/workflows/monitor.yml`:

```yaml
name: Weekly Data Monitor

on:
  schedule:
    # Every Monday at 06:00 UTC (14:00 Mongolia time)
    - cron: "0 6 * * 1"
  workflow_dispatch: # Allow manual trigger

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: data-snapshots
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install nodemailer tsx

      - name: Run monitor
        env:
          APP_URL: ${{ secrets.APP_URL }}
          GMAIL_USER: ${{ secrets.GMAIL_USER }}
          GMAIL_APP_PASSWORD: ${{ secrets.GMAIL_APP_PASSWORD }}
          MONITOR_EMAIL_RECIPIENTS: ${{ secrets.MONITOR_EMAIL_RECIPIENTS }}
        run: npx tsx .github/scripts/monitor.ts

      - name: Commit snapshots
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add snapshots/
          git diff --staged --quiet || git commit -m "chore: update data snapshots $(date -u +%Y-%m-%d)"
          git push
```

- [ ] **Step 3: Create data-snapshots branch**

```bash
git checkout --orphan data-snapshots
git rm -rf .
echo "# Data Snapshots" > README.md
mkdir -p snapshots .github/scripts .github/workflows
git add README.md
git commit -m "chore: initialize data-snapshots branch"
git checkout main
```

Note: The `.github/scripts/monitor.ts` and `.github/workflows/monitor.yml` files need to exist on the `data-snapshots` branch for the workflow to run. Copy them there:

```bash
git checkout data-snapshots
git checkout main -- .github/workflows/monitor.yml .github/scripts/monitor.ts
git add .github/
git commit -m "chore: add monitoring workflow and script"
git checkout main
```

- [ ] **Step 4: Set up GitHub secrets**

The user needs to configure these repository secrets in GitHub Settings > Secrets:
- `APP_URL` — deployed Vercel URL (e.g., `https://mongolia-map.vercel.app`)
- `GMAIL_USER` — Gmail address for sending alerts
- `GMAIL_APP_PASSWORD` — Gmail app password (not regular password)
- `MONITOR_EMAIL_RECIPIENTS` — comma-separated email addresses

- [ ] **Step 5: Commit workflow files to main**

```bash
git add .github/workflows/monitor.yml .github/scripts/monitor.ts
git commit -m "feat: add weekly data monitoring via GitHub Actions with email alerts"
```

- [ ] **Step 6: Test manually**

After pushing to GitHub, trigger the workflow manually:
```bash
gh workflow run monitor.yml
```

Watch the run:
```bash
gh run watch
```

---

## Summary

| Task | Direction | Description |
|------|-----------|-------------|
| 1 | Setup | Install dependencies |
| 2 | A | Search & filter |
| 3 | A | Area display |
| 4 | A | Overlap detection + CSV |
| 5 | B | Selective export (draw rectangle) |
| 6 | B | KMZ compressed export |
| 7 | C | Freshness indicators |
| 8 | C | GitHub Actions monitor + email |
