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

async function fetchLayer(apiKey: string): Promise<GeoJSONData> {
  const res = await fetch(`/api/data?layer=${apiKey}`);
  if (!res.ok) throw new Error(`Алдаа: ${apiKey}`);
  return res.json();
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
  const [exporting, setExporting] = useState(false);

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

  const handleExportKml = useCallback(async () => {
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
            exportDisabled={loadingKeys.size > 0 || exporting}
          />
        )}
      </BottomSheet>
    </main>
  );
}
