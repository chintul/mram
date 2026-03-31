import { NextResponse } from "next/server";
import { LAYERS } from "@/app/lib/layers";
import { getCached, setCache } from "@/app/lib/cache";
import { LAYER_HANDLERS } from "@/app/api/data/route";
import { geojsonToKml } from "@/app/lib/geojson-to-kml";

export const maxDuration = 60;

// Map from apiKey to layer key for LAYER_HANDLERS lookup
const VALID_API_KEYS = new Set(LAYERS.map((l) => l.apiKey));

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const requestedLayers: string[] = body.layers;

    if (!Array.isArray(requestedLayers) || requestedLayers.length === 0) {
      return NextResponse.json(
        { error: "layers array is required" },
        { status: 400 }
      );
    }

    // Validate all requested layers
    const invalidLayers = requestedLayers.filter((l) => !VALID_API_KEYS.has(l));
    if (invalidLayers.length > 0) {
      return NextResponse.json(
        { error: `Unknown layers: ${invalidLayers.join(", ")}` },
        { status: 400 }
      );
    }

    // Fetch GeoJSON for each layer (from cache or fresh)
    const kmlLayers: {
      name: string;
      geojson: { type: string; features: Array<{ type: string; properties: Record<string, string>; geometry: { type: string; coordinates: number[][][] | number[][][][] } }> };
      color: string;
      width: number;
    }[] = [];

    for (const apiKey of requestedLayers) {
      const layerConfig = LAYERS.find((l) => l.apiKey === apiKey);
      if (!layerConfig) continue;

      let geojsonData: string | null = null;

      // Try cache first
      const cached = await getCached(apiKey);
      if (cached) {
        geojsonData = cached.data;
      } else {
        // Cache miss — fetch fresh
        const handler = LAYER_HANDLERS[apiKey];
        if (!handler) continue;
        const fresh = await handler();
        geojsonData = JSON.stringify(fresh);
        // Cache for next time (fire and forget)
        setCache(apiKey, geojsonData).catch(() => {});
      }

      if (!geojsonData) continue;

      const parsed = JSON.parse(geojsonData);
      if (!parsed.features || parsed.features.length === 0) continue;

      kmlLayers.push({
        name: layerConfig.kmlName,
        geojson: parsed,
        color: layerConfig.color,
        width: layerConfig.width,
      });
    }

    if (kmlLayers.length === 0) {
      return NextResponse.json(
        { error: "No data available for requested layers" },
        { status: 404 }
      );
    }

    const kml = geojsonToKml(kmlLayers);

    return new Response(kml, {
      headers: {
        "Content-Type": "application/vnd.google-earth.kml+xml",
        "Content-Disposition": 'attachment; filename="mongolia-gazryn-medeelel.kml"',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
