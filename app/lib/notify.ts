import nodemailer from "nodemailer";
import { put, list } from "@vercel/blob";
import { diffLayer, isTrackedLayer, type ChangelogEntry } from "@/app/lib/diff";
import { getConfirmedSubscribersForLayer } from "@/app/lib/subscribers";
import { LAYERS } from "@/app/lib/layers";

const CHANGELOG_PREFIX = "changelog/";

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

  entries.unshift(entry);
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
