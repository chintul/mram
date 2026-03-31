"use client";

import { LAYERS } from "@/app/lib/layers";

interface LayerPanelProps {
  activeKeys: Set<string>;
  loadingKeys: Set<string>;
  onToggle: (key: string) => void;
  onExport: (format: "kml" | "kmz") => void;
  exporting: boolean;
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 3a1 1 0 011 1v7.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 11.586V4a1 1 0 011-1z" />
      <path d="M4 16a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="32" strokeDashoffset="10" />
    </svg>
  );
}

export default function LayerPanel({
  activeKeys,
  loadingKeys,
  onToggle,
  onExport,
  exporting,
}: LayerPanelProps) {
  const disabled = exporting || activeKeys.size === 0;

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

      {exporting && (
        <div className="mt-4 flex items-center justify-center gap-2 py-3 rounded-lg bg-green-900/30 border border-green-700/50">
          <SpinnerIcon className="w-4 h-4 text-green-400 animate-spin" />
          <span className="text-green-400 text-sm font-medium">Файл бэлтгэж байна...</span>
        </div>
      )}

      <div className="flex gap-3 mt-3">
        <button
          onClick={() => onExport("kml")}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-green-900/30"
        >
          <DownloadIcon className="w-5 h-5" />
          KML татах
        </button>
        <button
          onClick={() => onExport("kmz")}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-green-900/30"
        >
          <DownloadIcon className="w-5 h-5" />
          KMZ татах
        </button>
      </div>
    </div>
  );
}
