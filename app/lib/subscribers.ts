import { put, list } from "@vercel/blob";

const BLOB_KEY = "subscribers.json";

export interface Subscriber {
  id: string;
  email: string;
  layers: string[];
  confirmedAt: string | null;
  token: string;
}

export async function getSubscribers(): Promise<Subscriber[]> {
  try {
    const { blobs } = await list({
      prefix: BLOB_KEY,
      limit: 1,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (blobs.length === 0) return [];
    const res = await fetch(blobs[0].url);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function saveSubscribers(subs: Subscriber[]): Promise<void> {
  await put(BLOB_KEY, JSON.stringify(subs), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export async function addSubscriber(
  email: string,
  layers: string[]
): Promise<{ subscriber: Subscriber; isNew: boolean }> {
  const subs = await getSubscribers();
  const existing = subs.find((s) => s.email === email);
  if (existing) {
    existing.layers = [...new Set([...existing.layers, ...layers])];
    await saveSubscribers(subs);
    return { subscriber: existing, isNew: false };
  }

  const subscriber: Subscriber = {
    id: crypto.randomUUID(),
    email,
    layers,
    confirmedAt: null,
    token: crypto.randomUUID(),
  };
  subs.push(subscriber);
  await saveSubscribers(subs);
  return { subscriber, isNew: true };
}

export async function confirmSubscriber(token: string): Promise<boolean> {
  const subs = await getSubscribers();
  const sub = subs.find((s) => s.token === token);
  if (!sub) return false;
  sub.confirmedAt = new Date().toISOString();
  await saveSubscribers(subs);
  return true;
}

export async function removeSubscriber(token: string): Promise<boolean> {
  const subs = await getSubscribers();
  const idx = subs.findIndex((s) => s.token === token);
  if (idx === -1) return false;
  subs.splice(idx, 1);
  await saveSubscribers(subs);
  return true;
}

export async function getConfirmedSubscribersForLayer(
  layer: string
): Promise<Subscriber[]> {
  const subs = await getSubscribers();
  return subs.filter((s) => s.confirmedAt && s.layers.includes(layer));
}
