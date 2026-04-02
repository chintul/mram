# Email Subscription & Change Notifications

## Overview

Users subscribe with their email and selected layers. When cached data refreshes and changes are detected, subscribers receive an email with a detailed changelog. A daily Vercel Cron ensures changes are caught even during zero-traffic periods.

## Storage (Vercel Blob JSON)

### `subscribers.json`

```json
[
  {
    "id": "uuid",
    "email": "user@example.com",
    "layers": ["cmcs_licenses", "spa", "land_parcels"],
    "confirmedAt": "2026-04-01T00:00:00Z",
    "token": "random-unsubscribe-token"
  }
]
```

- Single blob file, read/write via existing `@vercel/blob`
- `confirmedAt` is `null` until email confirmation; only confirmed subscribers receive notifications
- `token` used for both confirmation and unsubscribe links

### `changelog/<layer>.json`

```json
[
  {
    "date": "2026-04-02",
    "summary": "3 шинэ тусгай зөвшөөрөл, 2 хүчингүй болсон",
    "details": [
      { "action": "new", "name": "MV-1234", "holder": "ХХК Алтан" },
      { "action": "expired", "name": "MV-0987", "holder": "ХХК Эрдэнэ" },
      { "action": "updated", "name": "MV-0555", "field": "status", "from": "Хайгуул", "to": "Ашиглалт" }
    ]
  }
]
```

- One blob file per tracked layer
- Appended on each detected change
- Keeps historical record of all changes

## Change Detection

### Tracked layers

| Layer | Diff strategy |
|-------|--------------|
| `cmcs_licenses` | Detailed: index by license code, detect new/expired/updated with field-level diffs (status, holder) |
| `spa` | Moderate: index by `shapeName`, detect added/removed features + count change |
| `protection_zones` | Moderate: same as SPA |
| `land_parcels` | Moderate: same as SPA |
| `mining_conservation` | Moderate: same as SPA |
| `aimags` | Not tracked (never changes) |
| `soums` | Not tracked (never changes) |

### Diff function

```ts
function diffLayer(layer: string, oldJson: string, newJson: string): ChangelogEntry | null
```

- Called during cache refresh, before overwriting the blob
- Returns `null` if no meaningful changes detected
- On changes: appends to `changelog/<layer>.json`, triggers email notifications

### CMCS detailed diff logic

- Parse old and new features, index by license code (e.g. `MV-1234`)
- Code in new but not old → `action: "new"`
- Code in old but not new → `action: "expired"`
- Same code, different `statusName` or `holder` → `action: "updated"` with `field`, `from`, `to`

### Egazar moderate diff logic

- Index features by `shapeName`
- Name in new but not old → added
- Name in old but not new → removed
- Report count delta and list of added/removed names

## Trigger: On Cache Refresh + Daily Cron

### On cache refresh (existing flow)

When `setCache()` is called during background stale-while-revalidate:
1. Read the existing blob via `getCached()` before overwriting (already available — the caller had it)
2. Pass both old and new JSON to `diffLayer()`
3. If changes found → append changelog → notify subscribers (non-blocking, fire-and-forget)
4. Overwrite cache with new data via `put()`

Note: The old data is already in memory at the call sites (the `after()` callbacks in `route.ts` have access to the cached response). No extra blob read needed.

### Daily cron (`/api/cron/check-updates`)

- Vercel Cron, runs once per day via `vercel.json`
- Iterates all 5 tracked layers
- Force-fetches fresh data from external sources
- Runs same diff → changelog → notify pipeline
- Ensures changes are caught even with zero site traffic

#### `vercel.json` config

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

## Email (Gmail SMTP via Nodemailer)

### Environment variables

- `GMAIL_USER` — Gmail address to send from
- `GMAIL_APP_PASSWORD` — Gmail app password (requires 2FA on the account)

### Email content

- **Subject:** `Газрын мэдээлэл шинэчлэгдлээ — {layer name}`
- **Body:** HTML email in Mongolian with changelog details (new/expired/updated items listed)
- **Footer:** One-click unsubscribe link

### Subscribe flow

1. User clicks floating bell icon → modal with email input + layer checkboxes
2. `POST /api/subscribe` — validates email, generates UUID + token, stores in `subscribers.json` with `confirmedAt: null`, sends confirmation email
3. User clicks confirmation link → `GET /api/subscribe/confirm?token=xxx` — sets `confirmedAt` to current timestamp
4. Only subscribers with non-null `confirmedAt` receive notifications

### Unsubscribe flow

- Every email includes: `GET /api/unsubscribe?token=xxx`
- Removes the subscriber entry from `subscribers.json`

## Frontend UI

### Floating bell button

- Fixed position, bottom-right corner, above the bottom sheet
- Bell icon with subtle pulse animation on first visit
- Opens a subscribe modal/popover
- Built using 21st MCP components matching the existing dark theme

### Subscribe modal

- Email input field
- Layer checkboxes — only trackable layers (CMCS + 4 egazar), not aimags/soums
- "Бүртгүүлэх" (Subscribe) button
- All UI text in Mongolian

### Confirmation states

- Success: "Баталгаажуулах имэйл илгээлээ"
- Already subscribed: "Аль хэдийн бүртгүүлсэн байна"
- Error: "Алдаа гарлаа, дахин оролдоно уу"

## New Files

| File | Purpose |
|------|---------|
| `app/lib/diff.ts` | `diffLayer()` function — change detection for CMCS and egazar layers |
| `app/lib/notify.ts` | Read subscribers, send Gmail via Nodemailer, manage changelog blobs |
| `app/lib/subscribers.ts` | CRUD operations on `subscribers.json` blob |
| `app/api/subscribe/route.ts` | `POST` — subscribe with email + layers |
| `app/api/subscribe/confirm/route.ts` | `GET` — confirm email via token |
| `app/api/unsubscribe/route.ts` | `GET` — one-click unsubscribe via token |
| `app/api/cron/check-updates/route.ts` | Daily cron — force-refresh + diff + notify |
| `app/components/SubscribeBell.tsx` | Floating bell button + subscribe modal |
| `vercel.json` | Cron schedule config |

## Dependencies to add

- `nodemailer` — Gmail SMTP transport
- `@types/nodemailer` — TypeScript types (dev)
