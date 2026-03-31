import { put, list } from "@vercel/blob";

const CACHE_PREFIX = "cache/";
const STALE_MS = 60 * 60 * 1000; // 1 hour

export async function getCached(
  layerKey: string
): Promise<{ data: string; isStale: boolean } | null> {
  try {
    const { blobs } = await list({
      prefix: `${CACHE_PREFIX}${layerKey}.json`,
      limit: 1,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (blobs.length === 0) return null;

    const blob = blobs[0];
    const age = Date.now() - new Date(blob.uploadedAt).getTime();
    const isStale = age > STALE_MS;

    const res = await fetch(blob.url);
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
