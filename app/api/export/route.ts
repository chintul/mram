import { NextResponse } from "next/server";
import { geojsonToKml } from "@/app/lib/geojson-to-kml";
import JSZip from "jszip";

export const maxDuration = 60;

interface ExportLayer {
  name: string;
  geojson: {
    type: string;
    features: Array<{
      type: string;
      properties: Record<string, string>;
      geometry: { type: string; coordinates: number[][][] | number[][][][] };
    }>;
  };
  color: string;
  width: number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const format: "kml" | "kmz" = body.format === "kmz" ? "kmz" : "kml";
    const layers: ExportLayer[] = body.layers;

    if (!Array.isArray(layers) || layers.length === 0) {
      return NextResponse.json(
        { error: "layers array is required" },
        { status: 400 }
      );
    }

    const kmlLayers = layers.filter(
      (l) => l.geojson?.features?.length > 0
    );

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
