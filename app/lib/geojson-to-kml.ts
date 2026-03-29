interface GeoJSONFeature {
  type: string;
  properties: Record<string, string>;
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}

interface GeoJSONCollection {
  type: string;
  features: GeoJSONFeature[];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function coordsToKml(coords: number[][]): string {
  return coords.map((c) => `${c[0]},${c[1]},0`).join(" ");
}

function geometryToKml(geometry: GeoJSONFeature["geometry"]): string {
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordsToKml(rings[0])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
  }

  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as number[][][][];
    const parts = polys
      .map(
        (rings) =>
          `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordsToKml(rings[0])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`
      )
      .join("");
    return `<MultiGeometry>${parts}</MultiGeometry>`;
  }

  return "";
}

export function geojsonToKml(
  layers: { name: string; geojson: GeoJSONCollection; color: string; width: number }[]
): string {
  const folders = layers
    .map((layer) => {
      const placemarks = layer.geojson.features
        .filter((f) => f.geometry != null)
        .map((f) => {
          const name = f.properties?.shapeName || f.properties?.NAME || f.properties?.name || "Тодорхойгүй";
          const geo = geometryToKml(f.geometry);
          return `<Placemark><name>${escapeXml(name)}</name><styleUrl>#style_${layer.name}</styleUrl>${geo}</Placemark>`;
        })
        .join("\n");

      return `<Folder><name>${escapeXml(layer.name)}</name>${placemarks}</Folder>`;
    })
    .join("\n");

  const styles = layers
    .map(
      (layer) =>
        `<Style id="style_${layer.name}"><LineStyle><color>${layer.color}</color><width>${layer.width}</width></LineStyle><PolyStyle><color>00000000</color></PolyStyle></Style>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>Монгол газрын мэдээлэл</name>
${styles}
${folders}
</Document>
</kml>`;
}
