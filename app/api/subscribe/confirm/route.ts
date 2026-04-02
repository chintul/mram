import { NextResponse } from "next/server";
import { confirmSubscriber } from "@/app/lib/subscribers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return new Response("Токен олдсонгүй", { status: 400 });
  }

  const confirmed = await confirmSubscriber(token);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  if (confirmed) {
    return NextResponse.redirect(`${baseUrl}/?subscribed=true`);
  }
  return NextResponse.redirect(`${baseUrl}/?subscribed=false`);
}
