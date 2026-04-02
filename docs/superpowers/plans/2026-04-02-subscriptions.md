# Email Subscription & Change Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users subscribe to layer updates and receive email notifications with detailed changelogs when geographic data changes.

**Architecture:** Vercel Blob JSON for subscriber + changelog storage. Change detection runs on cache refresh (piggyback on existing stale-while-revalidate) and a daily Vercel Cron safety net. Gmail SMTP via Nodemailer for email delivery. Floating bell button UI built with 21st MCP.

**Tech Stack:** Next.js 16 (App Router), Vercel Blob, Nodemailer, Tailwind CSS v4, 21st MCP for UI components

---

## File Structure

| File | Responsibility |
|------|---------------|
| `app/lib/subscribers.ts` | CRUD for `subscribers.json` blob (get all, add, confirm, remove) |
| `app/lib/diff.ts` | `diffLayer()` — compares old vs new GeoJSON, returns changelog entry or null |
| `app/lib/notify.ts` | Send emails via Gmail SMTP, append changelog to blob, orchestrate diff→log→email pipeline |
| `app/api/subscribe/route.ts` | `POST` — accept email + layers, store subscriber, send confirmation email |
| `app/api/subscribe/confirm/route.ts` | `GET ?token=xxx` — set `confirmedAt` on subscriber |
| `app/api/unsubscribe/route.ts` | `GET ?token=xxx` — remove subscriber |
| `app/api/cron/check-updates/route.ts` | Daily cron — force-refresh tracked layers, diff, notify |
| `app/components/SubscribeBell.tsx` | Floating bell icon + subscribe modal (21st MCP) |
| `app/api/data/route.ts` | **Modify** — pass old cached data to diff pipeline during background refresh |
| `app/api/layers/route.ts` | **Modify** — same for stale layer refresh |
| `app/page.tsx` | **Modify** — add `<SubscribeBell />` |
| `vercel.json` | **Create** — cron schedule |
| `package.json` | **Modify** — add nodemailer |

---

### Task 1: Install dependencies and create vercel.json

**Files:**
- Modify: `package.json`
- Create: `vercel.json`

- [ ] **Step 1: Install nodemailer**

```bash
npm install nodemailer && npm install -D @types/nodemailer
```

- [ ] **Step 2: Create vercel.json**

Create `vercel.json` in project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/check-updates",
      "schedule": "0 8 * * *"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json vercel.json
git commit -m "chore: add nodemailer dependency and vercel cron config"
```

---

### Task 2: Subscriber storage (CRUD on blob JSON)

**Files:**
- Create: `app/lib/subscribers.ts`

- [ ] **Step 1: Create subscribers.ts**

```ts
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
    // Update layers if already exists
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
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/subscribers.ts
git commit -m "feat: add subscriber blob storage CRUD"
```

---

### Task 3: Change detection (diff engine)

**Files:**
- Create: `app/lib/diff.ts`

The diff module needs to handle two strategies: detailed (CMCS — index by license code, field-level diffs) and moderate (egazar — index by shapeName, added/removed only).

- [ ] **Step 1: Create diff.ts**

```ts
import type { GeoJSONData } from "@/app/lib/layers";

export interface ChangeDetail {
  action: "new" | "expired" | "updated";
  name: string;
  holder?: string;
  field?: string;
  from?: string;
  to?: string;
}

export interface ChangelogEntry {
  date: string;
  summary: string;
  details: ChangeDetail[];
}

// Layers that get tracked for changes
const TRACKED_LAYERS = new Set([
  "cmcs_licenses",
  "spa",
  "protection_zones",
  "land_parcels",
  "mining_conservation",
]);

export function isTrackedLayer(layer: string): boolean {
  return TRACKED_LAYERS.has(layer);
}

// Extract license code from shapeName like "Нэр (MV-1234)" → "MV-1234"
function extractCode(shapeName: string): string | null {
  const m = shapeName.match(/\(([A-Z]+-\d+)\)/);
  return m ? m[1] : null;
}

// Parse description "TypeName | StatusName | Holder" back into fields
function parseDescription(desc: string): { status: string; holder: string } {
  const parts = desc.split(" | ");
  return { status: parts[1] || "", holder: parts[2] || "" };
}

function diffCMCS(
  oldFeatures: GeoJSONData["features"],
  newFeatures: GeoJSONData["features"]
): ChangeDetail[] {
  const oldMap = new Map<string, { shapeName: string; description: string }>();
  for (const f of oldFeatures) {
    const code = extractCode(f.properties.shapeName || "");
    if (code) oldMap.set(code, f.properties as { shapeName: string; description: string });
  }

  const newMap = new Map<string, { shapeName: string; description: string }>();
  for (const f of newFeatures) {
    const code = extractCode(f.properties.shapeName || "");
    if (code) newMap.set(code, f.properties as { shapeName: string; description: string });
  }

  const details: ChangeDetail[] = [];

  // New licenses
  for (const [code, props] of newMap) {
    if (!oldMap.has(code)) {
      const { holder } = parseDescription(props.description || "");
      details.push({ action: "new", name: code, holder });
    }
  }

  // Expired licenses
  for (const [code, props] of oldMap) {
    if (!newMap.has(code)) {
      const { holder } = parseDescription(props.description || "");
      details.push({ action: "expired", name: code, holder });
    }
  }

  // Updated licenses (status or holder changed)
  for (const [code, newProps] of newMap) {
    const oldProps = oldMap.get(code);
    if (!oldProps) continue;
    const oldParsed = parseDescription(oldProps.description || "");
    const newParsed = parseDescription(newProps.description || "");

    if (oldParsed.status !== newParsed.status) {
      details.push({
        action: "updated",
        name: code,
        field: "status",
        from: oldParsed.status,
        to: newParsed.status,
      });
    }
    if (oldParsed.holder !== newParsed.holder) {
      details.push({
        action: "updated",
        name: code,
        field: "holder",
        from: oldParsed.holder,
        to: newParsed.holder,
      });
    }
  }

  return details;
}

function diffEgazar(
  oldFeatures: GeoJSONData["features"],
  newFeatures: GeoJSONData["features"]
): ChangeDetail[] {
  const oldNames = new Set(oldFeatures.map((f) => f.properties.shapeName || ""));
  const newNames = new Set(newFeatures.map((f) => f.properties.shapeName || ""));

  const details: ChangeDetail[] = [];

  for (const name of newNames) {
    if (!oldNames.has(name)) {
      details.push({ action: "new", name });
    }
  }

  for (const name of oldNames) {
    if (!newNames.has(name)) {
      details.push({ action: "expired", name });
    }
  }

  return details;
}

function buildSummary(layer: string, details: ChangeDetail[]): string {
  const newCount = details.filter((d) => d.action === "new").length;
  const expiredCount = details.filter((d) => d.action === "expired").length;
  const updatedCount = details.filter((d) => d.action === "updated").length;

  const parts: string[] = [];
  if (newCount > 0) parts.push(`${newCount} шинэ`);
  if (expiredCount > 0) parts.push(`${expiredCount} хүчингүй болсон`);
  if (updatedCount > 0) parts.push(`${updatedCount} өөрчлөгдсөн`);
  return parts.join(", ");
}

export function diffLayer(
  layer: string,
  oldJson: string,
  newJson: string
): ChangelogEntry | null {
  if (!isTrackedLayer(layer)) return null;

  let oldData: GeoJSONData;
  let newData: GeoJSONData;
  try {
    oldData = JSON.parse(oldJson);
    newData = JSON.parse(newJson);
  } catch {
    return null;
  }

  const oldFeatures = oldData.features || [];
  const newFeatures = newData.features || [];

  const details =
    layer === "cmcs_licenses"
      ? diffCMCS(oldFeatures, newFeatures)
      : diffEgazar(oldFeatures, newFeatures);

  if (details.length === 0) return null;

  return {
    date: new Date().toISOString().split("T")[0],
    summary: buildSummary(layer, details),
    details,
  };
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/lib/diff.ts
git commit -m "feat: add layer change detection (CMCS detailed + egazar moderate)"
```

---

### Task 4: Notification engine (email + changelog)

**Files:**
- Create: `app/lib/notify.ts`

This module orchestrates: diff → append changelog blob → email confirmed subscribers.

- [ ] **Step 1: Create notify.ts**

```ts
import nodemailer from "nodemailer";
import { put, list } from "@vercel/blob";
import { diffLayer, isTrackedLayer, type ChangelogEntry } from "@/app/lib/diff";
import { getConfirmedSubscribersForLayer } from "@/app/lib/subscribers";
import { LAYERS } from "@/app/lib/layers";

const CHANGELOG_PREFIX = "changelog/";

// Layer apiKey → Mongolian display name
function layerDisplayName(layer: string): string {
  return LAYERS.find((l) => l.apiKey === layer)?.kmlName || layer;
}

async function appendChangelog(
  layer: string,
  entry: ChangelogEntry
): Promise<void> {
  const blobKey = `${CHANGELOG_PREFIX}${layer}.json`;
  let entries: ChangelogEntry[] = [];

  try {
    const { blobs } = await list({
      prefix: blobKey,
      limit: 1,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (blobs.length > 0) {
      const res = await fetch(blobs[0].url);
      if (res.ok) entries = await res.json();
    }
  } catch {
    // Start fresh
  }

  entries.unshift(entry); // newest first
  // Keep last 100 entries
  if (entries.length > 100) entries = entries.slice(0, 100);

  await put(blobKey, JSON.stringify(entries), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

function buildEmailHtml(
  layer: string,
  entry: ChangelogEntry,
  unsubscribeUrl: string
): string {
  const name = layerDisplayName(layer);
  const rows = entry.details
    .map((d) => {
      if (d.action === "new") {
        return `<tr><td style="color:#22c55e">+ Шинэ</td><td>${d.name}</td><td>${d.holder || ""}</td></tr>`;
      }
      if (d.action === "expired") {
        return `<tr><td style="color:#ef4444">− Хүчингүй</td><td>${d.name}</td><td>${d.holder || ""}</td></tr>`;
      }
      return `<tr><td style="color:#f59e0b">~ Өөрчлөгдсөн</td><td>${d.name}</td><td>${d.field}: ${d.from} → ${d.to}</td></tr>`;
    })
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2>${name} — шинэчлэл</h2>
      <p>${entry.date} | ${entry.summary}</p>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="text-align:left;border-bottom:1px solid #ddd">
            <th style="padding:8px">Төлөв</th>
            <th style="padding:8px">Нэр</th>
            <th style="padding:8px">Дэлгэрэнгүй</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <hr style="margin:24px 0"/>
      <p style="font-size:12px;color:#888">
        <a href="${unsubscribeUrl}">Бүртгэлээс гарах</a>
      </p>
    </div>
  `;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transport.sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject,
    html,
  });
}

export async function sendConfirmationEmail(
  email: string,
  token: string
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const confirmUrl = `${baseUrl}/api/subscribe/confirm?token=${token}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2>Имэйл баталгаажуулалт</h2>
      <p>Газрын мэдээллийн шинэчлэл хүлээн авахын тулд доорх товчийг дарна уу:</p>
      <a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
        Баталгаажуулах
      </a>
      <p style="font-size:12px;color:#888;margin-top:24px">Хэрэв та бүртгүүлээгүй бол энэ имэйлийг үл тоомсорлоно уу.</p>
    </div>
  `;

  await sendEmail(email, "Имэйл баталгаажуулалт — Монгол газрын мэдээлэл", html);
}

/**
 * Main pipeline: diff old vs new data for a layer, append changelog, email subscribers.
 * Called from cache refresh and daily cron.
 */
export async function processLayerUpdate(
  layer: string,
  oldJson: string,
  newJson: string
): Promise<void> {
  if (!isTrackedLayer(layer)) return;

  const entry = diffLayer(layer, oldJson, newJson);
  if (!entry) return;

  await appendChangelog(layer, entry);

  const subscribers = await getConfirmedSubscribersForLayer(layer);
  if (subscribers.length === 0) return;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const name = layerDisplayName(layer);
  const subject = `Газрын мэдээлэл шинэчлэгдлээ — ${name}`;

  await Promise.allSettled(
    subscribers.map((sub) => {
      const unsubscribeUrl = `${baseUrl}/api/unsubscribe?token=${sub.token}`;
      const html = buildEmailHtml(layer, entry, unsubscribeUrl);
      return sendEmail(sub.email, subject, html);
    })
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/lib/notify.ts
git commit -m "feat: add notification engine (Gmail SMTP + changelog + email pipeline)"
```

---

### Task 5: Subscribe API routes

**Files:**
- Create: `app/api/subscribe/route.ts`
- Create: `app/api/subscribe/confirm/route.ts`
- Create: `app/api/unsubscribe/route.ts`

- [ ] **Step 1: Create POST /api/subscribe**

Create `app/api/subscribe/route.ts`:

```ts
import { NextResponse } from "next/server";
import { addSubscriber } from "@/app/lib/subscribers";
import { sendConfirmationEmail } from "@/app/lib/notify";

const TRACKABLE_LAYERS = new Set([
  "cmcs_licenses",
  "spa",
  "protection_zones",
  "land_parcels",
  "mining_conservation",
]);

export async function POST(request: Request) {
  let body: { email?: string; layers?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, layers } = body;
  if (!email || !email.includes("@") || !layers || layers.length === 0) {
    return NextResponse.json(
      { error: "Имэйл болон давхарга шаардлагатай" },
      { status: 400 }
    );
  }

  // Only allow trackable layers
  const validLayers = layers.filter((l) => TRACKABLE_LAYERS.has(l));
  if (validLayers.length === 0) {
    return NextResponse.json(
      { error: "Зөвшөөрөгдөх давхарга олдсонгүй" },
      { status: 400 }
    );
  }

  const { subscriber, isNew } = await addSubscriber(email, validLayers);

  if (isNew || !subscriber.confirmedAt) {
    await sendConfirmationEmail(email, subscriber.token);
  }

  return NextResponse.json({
    ok: true,
    isNew,
    needsConfirmation: !subscriber.confirmedAt,
  });
}
```

- [ ] **Step 2: Create GET /api/subscribe/confirm**

Create `app/api/subscribe/confirm/route.ts`:

```ts
import { NextResponse } from "next/server";
import { confirmSubscriber } from "@/app/lib/subscribers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return new Response("Токен олдсонгүй", { status: 400 });
  }

  const confirmed = await confirmSubscriber(token);

  // Redirect to main page with success message
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  if (confirmed) {
    return NextResponse.redirect(`${baseUrl}/?subscribed=true`);
  }
  return NextResponse.redirect(`${baseUrl}/?subscribed=false`);
}
```

- [ ] **Step 3: Create GET /api/unsubscribe**

Create `app/api/unsubscribe/route.ts`:

```ts
import { NextResponse } from "next/server";
import { removeSubscriber } from "@/app/lib/subscribers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return new Response("Токен олдсонгүй", { status: 400 });
  }

  const removed = await removeSubscriber(token);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  if (removed) {
    return NextResponse.redirect(`${baseUrl}/?unsubscribed=true`);
  }
  return NextResponse.redirect(`${baseUrl}/?unsubscribed=false`);
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: Build succeeds, new routes appear in the output.

- [ ] **Step 5: Commit**

```bash
git add app/api/subscribe/ app/api/unsubscribe/
git commit -m "feat: add subscribe, confirm, and unsubscribe API routes"
```

---

### Task 6: Wire diff pipeline into cache refresh

**Files:**
- Modify: `app/api/data/route.ts` (lines 266-276 — the stale `after()` callback, and lines 305-313 — the CMCS `after()` callback)

The key insight: the `after()` callbacks already have access to `cached.data` (old data) and the fresh data. We pass both to `processLayerUpdate()`.

- [ ] **Step 1: Add import to data/route.ts**

Add at the top of `app/api/data/route.ts`, after the existing imports:

```ts
import { processLayerUpdate } from "@/app/lib/notify";
```

- [ ] **Step 2: Modify the stale cache after() callback**

In `app/api/data/route.ts`, the `after()` block at lines 267-276 currently does:

```ts
after(async () => {
  try {
    const fresh = layer === "cmcs_licenses"
      ? await fetchCMCSLicenses()
      : await LAYER_HANDLERS[layer]();
    await setCache(layer, JSON.stringify(fresh));
  } catch (e) {
    console.error(`[cache] Background refresh failed for ${layer}:`, e);
  }
});
```

Replace with:

```ts
const oldData = cached.data;
after(async () => {
  try {
    const fresh = layer === "cmcs_licenses"
      ? await fetchCMCSLicenses()
      : await LAYER_HANDLERS[layer]();
    const freshJson = JSON.stringify(fresh);
    await setCache(layer, freshJson);
    await processLayerUpdate(layer, oldData, freshJson).catch((e) =>
      console.error(`[notify] Failed for ${layer}:`, e)
    );
  } catch (e) {
    console.error(`[cache] Background refresh failed for ${layer}:`, e);
  }
});
```

- [ ] **Step 3: Modify the CMCS full background fetch after() callback**

In `app/api/data/route.ts`, the CMCS `after()` block at lines 305-313 currently does:

```ts
if (layer === "cmcs_licenses") {
  after(async () => {
    try {
      const full = await fetchCMCSLicenses();
      await setCache(layer, JSON.stringify(full));
    } catch {
      // Partial cache remains from above
    }
  });
}
```

Replace with:

```ts
if (layer === "cmcs_licenses") {
  const partialJson = json;
  after(async () => {
    try {
      const full = await fetchCMCSLicenses();
      const fullJson = JSON.stringify(full);
      await setCache(layer, fullJson);
      await processLayerUpdate(layer, partialJson, fullJson).catch((e) =>
        console.error(`[notify] Failed for cmcs_licenses:`, e)
      );
    } catch {
      // Partial cache remains from above
    }
  });
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/api/data/route.ts
git commit -m "feat: wire change detection into cache refresh pipeline"
```

---

### Task 7: Daily cron route

**Files:**
- Create: `app/api/cron/check-updates/route.ts`

- [ ] **Step 1: Create the cron route**

```ts
import { NextResponse } from "next/server";
import { getCached, setCache } from "@/app/lib/cache";
import { LAYER_HANDLERS, fetchCMCSLicenses } from "@/app/api/data/route";
import { processLayerUpdate } from "@/app/lib/notify";
import { isTrackedLayer } from "@/app/lib/diff";

export const maxDuration = 60;

const TRACKED_LAYER_KEYS = [
  "cmcs_licenses",
  "spa",
  "protection_zones",
  "land_parcels",
  "mining_conservation",
];

export async function GET(request: Request) {
  // Verify cron secret in production (Vercel sets this header)
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
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds, `/api/cron/check-updates` route appears.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/
git commit -m "feat: add daily cron route for forced layer refresh + notifications"
```

---

### Task 8: Frontend — SubscribeBell component

**Files:**
- Create: `app/components/SubscribeBell.tsx`
- Modify: `app/page.tsx`

Use 21st MCP for component inspiration/building. The component is a floating bell icon (bottom-right, above the bottom sheet at z-index 999) that opens a subscribe modal with email input + layer checkboxes.

- [ ] **Step 1: Use 21st MCP to get component inspiration**

Use `mcp__magic__21st_magic_component_inspiration` to find a notification bell / subscribe floating action button that fits a dark theme.

- [ ] **Step 2: Use 21st MCP to build the SubscribeBell component**

Use `mcp__magic__21st_magic_component_builder` to create the component with these requirements:

- Floating bell icon button, fixed bottom-right, `bottom: 5rem` (above bottom sheet), `right: 1rem`
- Dark theme matching `bg-neutral-900`, `text-neutral-200` palette
- Subtle pulse animation on the bell when page first loads (CSS animation, stops after 3 cycles)
- On click: opens a modal/popover with:
  - "Шинэчлэл хүлээн авах" heading
  - Email input with placeholder "Имэйл хаяг"
  - Layer checkboxes — only these 5: CMCS (Уул уурхайн ТЗ), SPA (Тусгай хамгаалалттай газар), Protection zones (Хамгаалалтын бүс), Land parcels (Газар эзэмшил), Mining conservation (Уул уурхайн хамгаалалт)
  - "Бүртгүүлэх" submit button (green, matching export button style)
  - State handling: loading spinner while submitting, success message "Баталгаажуулах имэйл илгээлээ", error message "Алдаа гарлаа, дахин оролдоно уу"
- Calls `POST /api/subscribe` with `{ email, layers }` body
- All text in Mongolian
- "use client" directive

The component should be saved to `app/components/SubscribeBell.tsx`.

- [ ] **Step 3: Add SubscribeBell to page.tsx**

In `app/page.tsx`, add the import:

```ts
import SubscribeBell from "@/app/components/SubscribeBell";
```

Add `<SubscribeBell />` inside the `<main>` tag, after `<MapView>` and before `<BottomSheet>`:

```tsx
<main className="relative h-screen w-screen overflow-hidden bg-neutral-950">
  <MapView activeLayers={activeLayers} onFeatureClick={handleFeatureClick} />
  <SubscribeBell />
  <BottomSheet state={sheetState} onStateChange={setSheetState}>
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 5: Manual test**

```bash
npm run dev
```

Open in browser. Verify:
1. Bell icon visible bottom-right, above bottom sheet
2. Click opens modal with email + layer checkboxes
3. Submit calls `/api/subscribe` (will fail without Gmail creds — that's OK, verify the network request fires)
4. Modal shows appropriate state feedback

- [ ] **Step 6: Commit**

```bash
git add app/components/SubscribeBell.tsx app/page.tsx
git commit -m "feat: add floating subscribe bell button with modal UI"
```

---

### Task 9: Wire stale layer refresh in /api/layers

**Files:**
- Modify: `app/api/layers/route.ts` (lines 20-33 — the stale refresh `after()` callback)

The layers route also does background refresh for stale layers. Wire the diff pipeline here too.

- [ ] **Step 1: Add import and modify after() callback**

In `app/api/layers/route.ts`, add import at the top:

```ts
import { processLayerUpdate } from "@/app/lib/notify";
import { getCached } from "@/app/lib/cache";
```

Replace the `after()` block (lines 21-33):

```ts
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
```

Note: `getCached` is already imported in this file. Just add `processLayerUpdate` to the existing import.

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/layers/route.ts
git commit -m "feat: wire change detection into layers route stale refresh"
```

---

### Task 10: Final integration test

- [ ] **Step 1: Set up environment variables**

Add to `.env.local`:

```
GMAIL_USER=your-gmail@gmail.com
GMAIL_APP_PASSWORD=your-app-password
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

- [ ] **Step 2: Full build check**

```bash
npm run build
```

Expected: Clean build, all routes present.

- [ ] **Step 3: Manual end-to-end test**

```bash
npm run dev
```

1. Click bell → enter email → select CMCS + SPA → submit
2. Check Gmail for confirmation email
3. Click confirmation link → redirects to `/?subscribed=true`
4. Trigger a cache refresh by hitting `/api/data?layer=cmcs_licenses` twice (first populates cache, second triggers stale check if enough time passes — or modify `STALE_MS` temporarily to 0 for testing)
5. If data changed, check Gmail for notification email with changelog

- [ ] **Step 4: Test unsubscribe**

Click unsubscribe link in notification email → should redirect to `/?unsubscribed=true` and remove subscriber from blob.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: integration test fixes for subscription system"
```
