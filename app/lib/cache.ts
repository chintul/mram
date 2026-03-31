import { put, head } from "@vercel/blob";

const CACHE_PREFIX = "cache/";
const STALE_MS = 60 * 60 * 1000; // 1 hour

export async function getCached(
  layerKey: string
): Promise<{ data: string; isStale: boolean } | null> {
  try {
    const blobUrl = `${CACHE_PREFIX}${layerKey}.json`;
    const meta = await head(blobUrl, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const age = Date.now() - new Date(meta.uploadedAt).getTime();
    const isStale = age > STALE_MS;

    const res = await fetch(meta.url);
    if (!res.ok) return null;
    const data = await res.text();
    return { data, isStale };
  } catch {
    return null;
  }
}

export async function setCache(layerKey: string, data: string): Promise<void> {
  await put(`${CACHE_PREFIX}${layerKey}.json`, data, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}
