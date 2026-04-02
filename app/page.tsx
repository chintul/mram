"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useRef } from "react";
import { LAYERS, type GeoJSONData, type GeoJSONFeature, type LayerConfig } from "@/app/lib/layers";
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
  const [exporting, setExporting] = useState(false);

  const fetchedRef = useRef<Set<string>>(new Set());
  const blobUrlsRef = useRef<Record<string, string>>({});
  const blobUrlsFetchedRef = useRef(false);

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

  // Auto-load layers on mount
  const autoLoadedRef = useRef(false);
  if (!autoLoadedRef.current) {
    autoLoadedRef.current = true;
    fetchBlobUrls().then(() => {
      LAYERS.filter((l) => l.autoLoad).forEach((l) => loadLayer(l));
    });
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

  const handleExport = useCallback(async (format: "kml" | "kmz") => {
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

    setExporting(true);
    try {
      const { geojsonToKml } = await import("@/app/lib/geojson-to-kml");
      const kml = geojsonToKml(kmlLayers);

      let blob: Blob;
      let filename: string;

      if (format === "kmz") {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        zip.file("doc.kml", kml);
        const kmzBuffer = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
        blob = kmzBuffer;
        filename = "mongolia-gazryn-medeelel.kmz";
      } else {
        blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
        filename = "mongolia-gazryn-medeelel.kml";
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExporting(false);
    }
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
            onExport={handleExport}
            exporting={exporting}
          />
        )}
      </BottomSheet>
    </main>
  );
}
