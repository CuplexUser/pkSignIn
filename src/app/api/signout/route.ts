import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";
import { handleError } from "@/lib/webauthn/http";

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
