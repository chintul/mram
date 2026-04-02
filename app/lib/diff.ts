import type { GeoJSONData } from "@/app/lib/layers";

export interface ChangeDetail {
  action: "new" | "expired" | "updated";
  name: string;
  holder?: string;
  field?: string;
  from?: string;
  to?: string;
}

export interface ChangelogEntry {
  date: string;
  summary: string;
  details: ChangeDetail[];
}

const TRACKED_LAYERS = new Set([
  "cmcs_licenses",
  "spa",
  "protection_zones",
  "land_parcels",
  "mining_conservation",
]);

export function isTrackedLayer(layer: string): boolean {
  return TRACKED_LAYERS.has(layer);
}

function extractCode(shapeName: string): string | null {
  const m = shapeName.match(/\(([A-Z]+-\d+)\)/);
  return m ? m[1] : null;
}

function parseDescription(desc: string): { status: string; holder: string } {
  const parts = desc.split(" | ");
  return { status: parts[1] || "", holder: parts[2] || "" };
}

function diffCMCS(
  oldFeatures: GeoJSONData["features"],
  newFeatures: GeoJSONData["features"]
): ChangeDetail[] {
  const oldMap = new Map<string, { shapeName: string; description: string }>();
  for (const f of oldFeatures) {
    const code = extractCode(f.properties.shapeName || "");
    if (code) oldMap.set(code, f.properties as { shapeName: string; description: string });
  }

  const newMap = new Map<string, { shapeName: string; description: string }>();
  for (const f of newFeatures) {
    const code = extractCode(f.properties.shapeName || "");
    if (code) newMap.set(code, f.properties as { shapeName: string; description: string });
  }

  const details: ChangeDetail[] = [];

  for (const [code, props] of newMap) {
    if (!oldMap.has(code)) {
      const { holder } = parseDescription(props.description || "");
      details.push({ action: "new", name: code, holder });
    }
  }

  for (const [code, props] of oldMap) {
    if (!newMap.has(code)) {
      const { holder } = parseDescription(props.description || "");
      details.push({ action: "expired", name: code, holder });
    }
  }

  for (const [code, newProps] of newMap) {
    const oldProps = oldMap.get(code);
    if (!oldProps) continue;
    const oldParsed = parseDescription(oldProps.description || "");
    const newParsed = parseDescription(newProps.description || "");

    if (oldParsed.status !== newParsed.status) {
      details.push({
        action: "updated",
        name: code,
        field: "status",
        from: oldParsed.status,
        to: newParsed.status,
      });
    }
    if (oldParsed.holder !== newParsed.holder) {
      details.push({
        action: "updated",
        name: code,
        field: "holder",
        from: oldParsed.holder,
        to: newParsed.holder,
      });
    }
  }

  return details;
}

function diffEgazar(
  oldFeatures: GeoJSONData["features"],
  newFeatures: GeoJSONData["features"]
): ChangeDetail[] {
  const oldNames = new Set(oldFeatures.map((f) => f.properties.shapeName || ""));
  const newNames = new Set(newFeatures.map((f) => f.properties.shapeName || ""));

  const details: ChangeDetail[] = [];

  for (const name of newNames) {
    if (!oldNames.has(name)) {
      details.push({ action: "new", name });
    }
  }

  for (const name of oldNames) {
    if (!newNames.has(name)) {
      details.push({ action: "expired", name });
    }
  }

  return details;
}

function buildSummary(layer: string, details: ChangeDetail[]): string {
  const newCount = details.filter((d) => d.action === "new").length;
  const expiredCount = details.filter((d) => d.action === "expired").length;
  const updatedCount = details.filter((d) => d.action === "updated").length;

  const parts: string[] = [];
  if (newCount > 0) parts.push(`${newCount} шинэ`);
  if (expiredCount > 0) parts.push(`${expiredCount} хүчингүй болсон`);
  if (updatedCount > 0) parts.push(`${updatedCount} өөрчлөгдсөн`);
  return parts.join(", ");
}

export function diffLayer(
  layer: string,
  oldJson: string,
  newJson: string
): ChangelogEntry | null {
  if (!isTrackedLayer(layer)) return null;

  let oldData: GeoJSONData;
  let newData: GeoJSONData;
  try {
    oldData = JSON.parse(oldJson);
    newData = JSON.parse(newJson);
  } catch {
    return null;
  }

  const oldFeatures = oldData.features || [];
  const newFeatures = newData.features || [];

  const details =
    layer === "cmcs_licenses"
      ? diffCMCS(oldFeatures, newFeatures)
      : diffEgazar(oldFeatures, newFeatures);

  if (details.length === 0) return null;

  return {
    date: new Date().toISOString().split("T")[0],
    summary: buildSummary(layer, details),
    details,
  };
}
