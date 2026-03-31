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
