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
