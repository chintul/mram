import { NextResponse } from "next/server";
import { listCachedUrls } from "@/app/lib/cache";
import { LAYERS } from "@/app/lib/layers";

export async function GET() {
  const cachedUrls = await listCachedUrls();

  const result: Record<string, { url: string | null; cached: boolean }> = {};
  for (const layer of LAYERS) {
    const url = cachedUrls[layer.apiKey] || null;
    result[layer.apiKey] = { url, cached: url !== null };
  }

  return NextResponse.json(result);
}
