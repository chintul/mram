import { NextResponse } from "next/server";
import { geojsonToKml } from "@/app/lib/geojson-to-kml";
import { getCached } from "@/app/lib/cache";
import { LAYER_HANDLERS } from "@/app/api/data/route";
import JSZip from "jszip";

export const maxDuration = 60;

interface ExportLayerRequest {
  key: string;
  name: string;
  color: string;
  width: number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const format: "kml" | "kmz" = body.format === "kmz" ? "kmz" : "kml";
    const layers: ExportLayerRequest[] = body.layers;

    if (!Array.isArray(layers) || layers.length === 0) {
      return NextResponse.json(
        { error: "layers array is required" },
        { status: 400 }
      );
    }

    // Fetch GeoJSON for each layer from cache or live
    const kmlLayers: { name: string; geojson: { type: string; features: Array<{ type: string; properties: Record<string, string>; geometry: { type: string; coordinates: number[][][] | number[][][][] } }> }; color: string; width: number }[] = [];

    for (const layer of layers) {
      if (!LAYER_HANDLERS[layer.key]) continue;

      let geojson: unknown;

      // Try cache first
      const cached = await getCached(layer.key);
      if (cached) {
        geojson = JSON.parse(cached.data);
      } else {
        // Fetch live
        geojson = await LAYER_HANDLERS[layer.key]();
      }

      const data = geojson as { type: string; features: Array<{ type: string; properties: Record<string, string>; geometry: { type: string; coordinates: number[][][] | number[][][][] } }> };

      if (data?.features?.length > 0) {
        kmlLayers.push({
          name: layer.name,
          geojson: data,
          color: layer.color,
          width: layer.width,
        });
      }
    }

    if (kmlLayers.length === 0) {
      return NextResponse.json(
        { error: "No data available for requested layers" },
        { status: 404 }
      );
    }

    const kml = geojsonToKml(kmlLayers);

    if (format === "kmz") {
      const zip = new JSZip();
      zip.file("doc.kml", kml);
      const kmzBuffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
      return new Response(kmzBuffer, {
        headers: {
          "Content-Type": "application/vnd.google-earth.kmz",
          "Content-Disposition": 'attachment; filename="mongolia-gazryn-medeelel.kmz"',
        },
      });
    }

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
