import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** UI ko batata hai kaunsi keys set hain (keys khud kabhi browser tak nahi jaati). */
export function GET() {
  return NextResponse.json({
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    ttsProvider: process.env.TTS_PROVIDER === "gemini" ? "gemini" : "elevenlabs",
  });
}
