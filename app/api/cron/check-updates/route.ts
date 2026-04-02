import { NextResponse } from "next/server";
import { getCached, setCache } from "@/app/lib/cache";
import { LAYER_HANDLERS, fetchCMCSLicenses } from "@/app/api/data/route";
import { processLayerUpdate } from "@/app/lib/notify";

export const maxDuration = 60;

const TRACKED_LAYER_KEYS = [
  "cmcs_licenses",
  "spa",
  "protection_zones",
  "land_parcels",
  "mining_conservation",
];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, string> = {};

  for (const layer of TRACKED_LAYER_KEYS) {
    try {
      const cached = await getCached(layer);
      const oldJson = cached?.data || '{"type":"FeatureCollection","features":[]}';

      const handler = LAYER_HANDLERS[layer];
      if (!handler) continue;

      const fresh =
        layer === "cmcs_licenses"
          ? await fetchCMCSLicenses()
          : await handler();
      const freshJson = JSON.stringify(fresh);

      await setCache(layer, freshJson);
      await processLayerUpdate(layer, oldJson, freshJson);
      results[layer] = "ok";
    } catch (e) {
      results[layer] = e instanceof Error ? e.message : "error";
    }
  }

  return NextResponse.json({ results, timestamp: new Date().toISOString() });
}
