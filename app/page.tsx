"use client";

import { useState } from "react";
import { geojsonToKml } from "./lib/geojson-to-kml";

type GeoJSONData = {
  type: string;
  features: Array<{
    type: string;
    properties: Record<string, string>;
    geometry: { type: string; coordinates: number[][][] | number[][][][] };
  }>;
};

async function fetchLayer(layer: string): Promise<GeoJSONData> {
  const res = await fetch(`/api/data?layer=${layer}`);
  if (!res.ok) throw new Error(`Алдаа: ${layer}`);
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

interface LayerConfig {
  key: string;
  apiKey: string;
  label: string;
  description: string;
  source: string;
  kmlName: string;
  color: string;
  colorHex: string; // for UI dot
  width: number;
}

const LAYERS: LayerConfig[] = [
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
  },
];

type LayerStatus = "pending" | "loading" | "done" | "error";

export default function Home() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [statuses, setStatuses] = useState<Record<string, LayerStatus>>({});
  const [selected, setSelected] = useState<Set<string>>(
    new Set(LAYERS.map((l) => l.key))
  );

  function toggleLayer(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleExport() {
    setExporting(true);
    setError("");

    const activeLayers = LAYERS.filter((l) => selected.has(l.key));
    const newStatuses: Record<string, LayerStatus> = {};
    for (const l of activeLayers) newStatuses[l.key] = "loading";
    setStatuses({ ...newStatuses });

    const results = await Promise.allSettled(
      activeLayers.map(async (layer) => {
        const data = await fetchLayer(layer.apiKey);
        setStatuses((prev) => ({ ...prev, [layer.key]: "done" }));
        return { layer, data };
      })
    );

    const kmlLayers: {
      name: string;
      geojson: GeoJSONData;
      color: string;
      width: number;
    }[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const layer = activeLayers[i];
      if (result.status === "fulfilled") {
        const { data } = result.value;
        if (data.features?.length > 0) {
          kmlLayers.push({
            name: layer.kmlName,
            geojson: data,
            color: layer.color,
            width: layer.width,
          });
        } else {
          setStatuses((prev) => ({ ...prev, [layer.key]: "error" }));
        }
      } else {
        setStatuses((prev) => ({ ...prev, [layer.key]: "error" }));
      }
    }

    if (kmlLayers.length === 0) {
      setError("Мэдээлэл татаж чадсангүй. Дахин оролдоно уу.");
      setExporting(false);
      return;
    }

    const kml = geojsonToKml(kmlLayers);
    downloadFile(kml, "mongolia-gazryn-medeelel.kml");
    setExporting(false);
  }

  const statusIcon = (s?: LayerStatus) => {
    if (!s) return "";
    if (s === "loading") return "...";
    if (s === "done") return "OK";
    return "АЛДАА";
  };

  const statusColor = (s?: LayerStatus) => {
    if (s === "done") return "text-green-400";
    if (s === "error") return "text-yellow-400";
    if (s === "loading") return "text-blue-400 animate-pulse";
    return "text-neutral-600";
  };

  return (
    <main className="flex-1 flex items-center justify-center bg-neutral-950 p-4">
      <div className="space-y-6 max-w-xl w-full">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Монгол газрын зураг</h1>
          <p className="text-neutral-400 text-sm mt-2">
            Давхаргуудаа сонгоод KML файлаар татаж AlpineQuest Pro апп-д оруулна уу
          </p>
        </div>

        {/* Layer selection */}
        <div className="bg-neutral-900 rounded-lg divide-y divide-neutral-800">
          {LAYERS.map((layer) => (
            <label
              key={layer.key}
              className="flex items-start gap-3 p-3 cursor-pointer hover:bg-neutral-800/50 transition-colors first:rounded-t-lg last:rounded-b-lg"
            >
              <input
                type="checkbox"
                checked={selected.has(layer.key)}
                onChange={() => toggleLayer(layer.key)}
                disabled={exporting}
                className="w-4 h-4 accent-blue-500 mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: layer.colorHex }}
                  />
                  <span className="text-neutral-200 text-sm font-medium">
                    {layer.label}
                  </span>
                </div>
                <p className="text-neutral-500 text-xs mt-0.5 pl-[18px]">
                  {layer.description}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className="text-neutral-600 text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded">
                  {layer.source}
                </span>
                {exporting && statuses[layer.key] && (
                  <span className={`text-xs font-mono w-10 text-right ${statusColor(statuses[layer.key])}`}>
                    {statusIcon(statuses[layer.key])}
                  </span>
                )}
              </div>
            </label>
          ))}
        </div>

        {/* Export button */}
        <button
          onClick={handleExport}
          disabled={exporting || selected.size === 0}
          className="w-full px-8 py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 text-white font-semibold rounded-lg text-lg transition-colors cursor-pointer disabled:cursor-wait"
        >
          {exporting
            ? "Мэдээлэл татаж байна..."
            : `KML татах (${selected.size} давхарга)`}
        </button>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        {/* How to use */}
        <div className="bg-neutral-900/50 rounded-lg p-4">
          <h2 className="text-neutral-300 text-sm font-semibold mb-2">
            Хэрхэн ашиглах вэ?
          </h2>
          <ol className="text-neutral-500 text-xs space-y-1 list-decimal list-inside">
            <li>Хэрэгтэй давхаргуудаа сонгоно</li>
            <li>&quot;KML татах&quot; дарна</li>
            <li>Татагдсан <code className="text-neutral-400 bg-neutral-800 px-1 rounded">.kml</code> файлыг утсандаа шилжүүлнэ</li>
            <li>AlpineQuest Pro &rarr; Placemarks &rarr; Import &rarr; файлаа сонгоно</li>
            <li>Давхарга бүрийг тусад нь асааж унтрааж болно</li>
          </ol>
        </div>

        {/* Data sources */}
        <div className="bg-neutral-900/50 rounded-lg p-4">
          <h2 className="text-neutral-300 text-sm font-semibold mb-2">
            Мэдээллийн эх сурвалж
          </h2>
          <div className="text-xs space-y-2">
            <div>
              <span className="text-neutral-400 font-medium">geoBoundaries.org</span>
              <span className="text-neutral-600"> &mdash; </span>
              <span className="text-neutral-500">
                Аймаг, сумын засаг захиргааны хил хязгаар (нээлттэй мэдээлэл)
              </span>
            </div>
            <div>
              <span className="text-neutral-400 font-medium">egazar.gov.mn</span>
              <span className="text-neutral-600"> &mdash; </span>
              <span className="text-neutral-500">
                ГЗБГЗЗГ-ын GeoServer: тусгай хамгаалалттай газар, хамгаалалтын бүс,
                газар эзэмшил, уул уурхайн хамгаалалт
              </span>
            </div>
            <div>
              <span className="text-neutral-400 font-medium">cmcs.mrpam.gov.mn</span>
              <span className="text-neutral-600"> &mdash; </span>
              <span className="text-neutral-500">
                АМГТГ-ын уул уурхайн кадастрын систем (CMCS): хайгуулын болон
                ашиглалтын тусгай зөвшөөрлүүд
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
