import { NextResponse } from "next/server";
import { bootstrapToken } from "@/lib/bootstrap";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (req.headers.get("x-admin-secret") !== process.env.ADMIN_SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { mint } = await req.json();
  if (typeof mint !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return NextResponse.json({ error: "invalid mint" }, { status: 400 });
  return NextResponse.json(await bootstrapToken(mint));
}
