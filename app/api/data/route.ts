import { NextResponse } from "next/server";
import { after } from "next/server";
import { getCached, setCache } from "@/app/lib/cache";

// Vercel hobby plan: max 60s, pro plan: max 300s
export const maxDuration = 60;

const EGAZAR_WFS = "https://geoserver.egazar.gov.mn/geoserver";
const CMCS_BASE = "https://cmcs.mrpam.gov.mn/CMCS";
const CMCS_HEADERS = {
  Accept: "application/json",
  "X-Requested-With": "XMLHttpRequest",
  Referer: "https://cmcs.mrpam.gov.mn/CMCS/",
};

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

// CMCS Mining Cadastre - fetch all license IDs via paginated grid
async function fetchCMCSLicenseIds(): Promise<number[]> {
  const ids: number[] = [];
  let page = 1;
  const rows = 500;

  while (true) {
    const url = `${CMCS_BASE}/License/GridData?page=${page}&rows=${rows}&sidx=Id&sord=asc&_search=false`;
    const res = await fetch(url, {
      headers: CMCS_HEADERS,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`CMCS GridData failed: ${res.status}`);
    const data = await res.json();

    for (const row of data.rows) {
      ids.push(row.id);
    }

    if (page >= data.total) break;
    page++;
  }

  return ids;
}

// Parse Esri geometry from CMCS license detail page HTML
function parseCMCSDetail(html: string): {
  geometry: { type: string; coordinates: number[][][] };
  name: string;
  code: string;
  typeName: string;
  statusName: string;
  area: number;
  holder: string;
} | null {
  // Extract fields from the JS object literal embedded in the HTML
  const geomMatch = html.match(/Geometry:\{rings:(\[\[[\s\S]*?\]\]),spatialReference/);
  // License name is right after LayerId:N
  const nameMatch = html.match(/LayerId:\d+,Name:"([^"]*?)"/);
  const codeMatch = html.match(/Code:"([A-Z]+-\d+)"/);
  // TypeName at the top level (not inside AdminUnits)
  const typeMatch = html.match(/TypeName:"([^"]*?)",Area:/);
  const statusMatch = html.match(/StatusName:"([^"]*?)"/);
  const areaMatch = html.match(/Area:([\d.]+),Geometry/);
  // Holder name from HolderLookup
  const holderMatch = html.match(/HolderLookup:\{[^}]*Name:"([^"]*?)"/)

  if (!geomMatch) return null;

  let rings: number[][][];
  try {
    // The rings are valid JSON arrays
    rings = JSON.parse(geomMatch[1]);
  } catch {
    return null;
  }

  return {
    geometry: { type: "Polygon", coordinates: rings },
    name: nameMatch?.[1] || "Тодорхойгүй",
    code: codeMatch?.[1] || "",
    typeName: typeMatch?.[1] || "",
    statusName: statusMatch?.[1] || "",
    area: parseFloat(areaMatch?.[1] || "0"),
    holder: holderMatch?.[1] || "",
  };
}

// Fetch a single license detail and extract geometry
async function fetchCMCSLicenseDetail(id: number) {
  const url = `${CMCS_BASE}/License/Details/${id}`;
  const res = await fetch(url, {
    headers: { ...CMCS_HEADERS, Accept: "text/html" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  return parseCMCSDetail(html);
}

// Fetch licenses in batches with concurrency control and optional time budget
async function fetchCMCSLicenses(deadlineMs?: number) {
  const ids = await fetchCMCSLicenseIds();

  const features: Array<{
    type: string;
    properties: Record<string, string>;
    geometry: { type: string; coordinates: number[][][] };
  }> = [];

  const deadline = deadlineMs ?? Infinity;

  // Process in batches of 100 concurrent requests
  const BATCH_SIZE = 100;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    if (Date.now() > deadline) break;

    const batch = ids.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((id) => fetchCMCSLicenseDetail(id))
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value?.geometry) {
        const d = result.value;
        features.push({
          type: "Feature",
          properties: {
            shapeName: `${d.name} (${d.code})`,
            description: `${d.typeName} | ${d.statusName} | ${d.holder}`,
            area: String(d.area),
            type: "Уул уурхайн тусгай зөвшөөрөл",
          },
          geometry: d.geometry,
        });
      }
    }
  }

  return { type: "FeatureCollection", features };
}

export { fetchCMCSLicenses };

export const LAYER_HANDLERS: Record<string, () => Promise<unknown>> = {
  aimags: fetchAimags,
  soums: fetchSoums,
  spa: fetchSPA,
  protection_zones: fetchProtectionZones,
  land_parcels: fetchLandUseParcels,
  mining_conservation: fetchMiningConservation,
  cmcs_licenses: () => fetchCMCSLicenses(),
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

  // Try cache first
  const cached = await getCached(layer);
  if (cached) {
    if (cached.isStale) {
      after(async () => {
        try {
          const fresh = layer === "cmcs_licenses"
            ? await fetchCMCSLicenses()
            : await LAYER_HANDLERS[layer]();
          await setCache(layer, JSON.stringify(fresh));
        } catch (e) {
          console.error(`[cache] Background refresh failed for ${layer}:`, e);
        }
      });
    }
    return new Response(cached.data, {
      headers: { "Content-Type": "application/json" },
    });
  }

  // No cache — fetch, cache inline, return
  try {
    // For CMCS, enforce a deadline so we return partial results instead of 504
    const data = layer === "cmcs_licenses"
      ? await fetchCMCSLicenses(Date.now() + 50_000)
      : await LAYER_HANDLERS[layer]();
    const json = JSON.stringify(data);

    // Cache inline so errors surface instead of being silently swallowed
    try {
      await setCache(layer, json);
    } catch (cacheErr) {
      console.error(`[cache] Failed to write ${layer}:`, cacheErr);
    }

    // If CMCS was time-limited, do a full background fetch
    if (layer === "cmcs_licenses") {
      after(async () => {
        try {
          const full = await fetchCMCSLicenses();
          await setCache(layer, JSON.stringify(full));
        } catch {
          // Partial cache remains from above
        }
      });
    }

    return new Response(json, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: message, features: [], type: "FeatureCollection" },
      { status: 200 }
    );
  }
}
