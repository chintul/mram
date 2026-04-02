import { NextResponse, after } from "next/server";
import { listCachedUrls, getCached, setCache } from "@/app/lib/cache";
import { LAYERS } from "@/app/lib/layers";
import { LAYER_HANDLERS } from "@/app/api/data/route";
import { processLayerUpdate } from "@/app/lib/notify";

export async function GET() {
  const cachedUrls = await listCachedUrls();

  const staleKeys: string[] = [];
  const result: Record<string, { url: string | null; cached: boolean }> = {};
  for (const layer of LAYERS) {
    const entry = cachedUrls[layer.apiKey] || null;
    result[layer.apiKey] = { url: entry?.url || null, cached: entry !== null };
    if (entry?.isStale) {
      staleKeys.push(layer.apiKey);
    }
  }

  // Background-refresh stale layers
  if (staleKeys.length > 0) {
    after(async () => {
      for (const key of staleKeys) {
        try {
          const handler = LAYER_HANDLERS[key];
          if (!handler) continue;
          const cached = await getCached(key);
          const oldJson = cached?.data || '{"type":"FeatureCollection","features":[]}';
          const fresh = await handler();
          const freshJson = JSON.stringify(fresh);
          await setCache(key, freshJson);
          await processLayerUpdate(key, oldJson, freshJson).catch((e) =>
            console.error(`[notify] Failed for ${key}:`, e)
          );
        } catch {
          // Background refresh failed, stale cache remains
        }
      }
    });
  }

  return NextResponse.json(result, {
    headers: {
      // Cache blob URL list for 1 hour in browser, 1 day on CDN
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
