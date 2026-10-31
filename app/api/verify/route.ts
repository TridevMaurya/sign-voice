import { NextRequest, NextResponse } from "next/server";
import { fastConfig, geminiGenerate, textModel } from "@/lib/server/gemini";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 1_500_000;

/**
 * POST { image: "data:image/jpeg;base64,...", signs: [{ id, name, howTo }] }
 * Camera ka ek frame Gemini Vision ko dikhata hai aur poochta hai ki kaunsa sign hai.
 * Ye "second opinion" hai — real-time detection browser mein MediaPipe karta hai.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(body?.image ?? "");
  if (!match) return NextResponse.json({ error: "image missing" }, { status: 400 });
  if (match[2].length * 0.75 > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "image too large" }, { status: 413 });
  }

  const signs: { id: string; name: string; howTo: string }[] = Array.isArray(body?.signs)
    ? body.signs.slice(0, 20).map((s: Record<string, unknown>) => ({
        id: String(s.id ?? "").slice(0, 40),
        name: String(s.name ?? "").slice(0, 60),
        howTo: String(s.howTo ?? "").slice(0, 200),
      }))
    : [];

  const prompt = `This is a webcam frame (mirrored like a selfie) of a person who may be making a hand sign.
Known signs:
${signs.map((s) => `- id "${s.id}": ${s.name} — ${s.howTo}`).join("\n")}

Which known sign is the person making? If none clearly matches, use id "none".
Also describe in a few words what the hands are doing.
Respond as JSON: {"id": string, "confidence": number between 0 and 1, "description": string}`;

  try {
    const model = textModel();
    const parts = await geminiGenerate(model, {
      contents: [{ parts: [{ inlineData: { mimeType: match[1], data: match[2] } }, { text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        ...fastConfig(model),
      },
    });
    const text = parts.map((p) => p.text ?? "").join("");
    const parsed = JSON.parse(text);
    return NextResponse.json({
      id: typeof parsed.id === "string" ? parsed.id : "none",
      confidence: Number(parsed.confidence) || 0,
      description: String(parsed.description ?? ""),
    });
  } catch (err) {
    console.error("[verify]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gemini request failed" },
      { status: 502 },
    );
  }
}
