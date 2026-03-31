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
