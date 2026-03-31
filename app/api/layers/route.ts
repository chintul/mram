import { NextResponse, after } from "next/server";
import { listCachedUrls, setCache } from "@/app/lib/cache";
import { LAYERS } from "@/app/lib/layers";
import { LAYER_HANDLERS } from "@/app/api/data/route";

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
          const fresh = await handler();
          await setCache(key, JSON.stringify(fresh));
        } catch {
          // Background refresh failed, stale cache remains
        }
      }
    });
  }

  return NextResponse.json(result);
}
