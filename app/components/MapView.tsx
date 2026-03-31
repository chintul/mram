"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoJSONData, GeoJSONFeature, LayerConfig } from "@/app/lib/layers";

// Fix default marker icon path issue in bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
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
