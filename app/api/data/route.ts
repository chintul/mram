import { NextResponse } from "next/server";

// Vercel hobby plan: max 60s, pro plan: max 300s
export const maxDuration = 60;

const EGAZAR_WFS = "https://geoserver.egazar.gov.mn/geoserver";

// Fetch from egazar.gov.mn WFS
async function fetchWFS(workspace: string, typeName: string, maxFeatures?: number) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName: `${workspace}:${typeName}`,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
  });
  if (maxFeatures) params.set("maxFeatures", String(maxFeatures));

  const url = `${EGAZAR_WFS}/${workspace}/wfs?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`WFS failed: ${typeName} (${res.status})`);
  return res.json();
}

// Proxy geoBoundaries data (avoids CORS redirect issues from GitHub)
async function fetchGeoBoundaries(level: string) {
  const apiUrl = `https://www.geoboundaries.org/api/current/gbOpen/MNG/${level}/`;
  const meta = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
  if (!meta.ok) throw new Error(`geoBoundaries API failed for ${level}`);
  const { gjDownloadURL } = await meta.json();

  // Follow redirects server-side (no CORS issues here)
  const res = await fetch(gjDownloadURL, {
    signal: AbortSignal.timeout(60000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`geoBoundaries download failed for ${level}`);
  return res.json();
}

// Aimags (ADM1)
async function fetchAimags() {
  return fetchGeoBoundaries("ADM1");
}

// Soums (ADM2)
async function fetchSoums() {
  return fetchGeoBoundaries("ADM2");
}

// Specially Protected Areas
async function fetchSPA() {
  const data = await fetchWFS("geoware", "geo_spa_parcel_type1");
  for (const f of data.features) {
    const p = f.properties;
    f.properties = {
      shapeName: p.spa_land_name || p.place_name || "Тодорхойгүй",
      description: p.landuse_desc || "",
      type: "Тусгай хамгаалалттай газар",
    };
  }
  return data;
}

// Protection zones
async function fetchProtectionZones() {
  const data = await fetchWFS("geoware", "geo_protection_zone_parcel");
  for (const f of data.features) {
    const p = f.properties;
    f.properties = {
      shapeName: p.name || p.zone_name || p.zone_type_name || "Тодорхойгүй",
      description: p.zone_type_name || "",
      type: "Хамгаалалтын бүс",
    };
  }
  return data;
}

// Land use parcels
async function fetchLandUseParcels() {
  const data = await fetchWFS("caddb", "geo_landuse_parcel_new", 10000);
  for (const f of data.features) {
    const p = f.properties;
    f.properties = {
      shapeName: `${p.lcode1_desc || ""} - ${p.lcode2_desc || ""}`.trim().replace(/^- /, ""),
      description: `${p.lcode_desc || ""} | ${p.au1_name || ""} ${p.au2_name || ""}`,
      parcelId: p.parcel_id || "",
      type: "Газар эзэмшил",
    };
  }
  return data;
}

// Mining conservation parcels
async function fetchMiningConservation() {
  const data = await fetchWFS("geoware", "mt_conservation_parcel");
  for (const f of data.features) {
    const p = f.properties;
    f.properties = {
      shapeName: p.land_name || "Уул уурхайн хамгаалалтын бүс",
      description: `${p.conservation_type_desc || ""} | ${p.landuse_desc || ""}`,
      type: "Уул уурхайн хамгаалалт",
    };
  }
  return data;
}

const LAYER_HANDLERS: Record<string, () => Promise<unknown>> = {
  aimags: fetchAimags,
  soums: fetchSoums,
  spa: fetchSPA,
  protection_zones: fetchProtectionZones,
  land_parcels: fetchLandUseParcels,
  mining_conservation: fetchMiningConservation,
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const layer = searchParams.get("layer");

  if (!layer || !LAYER_HANDLERS[layer]) {
    return NextResponse.json(
      { error: `Unknown layer. Available: ${Object.keys(LAYER_HANDLERS).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const data = await LAYER_HANDLERS[layer]();
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: message, features: [], type: "FeatureCollection" },
      { status: 200 }
    );
  }
}
