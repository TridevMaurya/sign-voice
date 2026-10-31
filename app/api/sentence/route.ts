import { NextRequest, NextResponse } from "next/server";
import { fastConfig, geminiGenerate, textModel } from "@/lib/server/gemini";

export const runtime = "nodejs";

/**
 * POST { words: string[], lang: "hi" | "en" }
 * Signs ke keywords (jaise ["help", "water"]) ko ek natural sentence mein badalta hai.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const words: string[] = Array.isArray(body?.words)
    ? body.words.filter((w: unknown) => typeof w === "string").slice(0, 20).map((w: string) => w.slice(0, 40))
    : [];
  const lang = body?.lang === "en" ? "en" : "hi";
  if (!words.length) return NextResponse.json({ error: "words missing" }, { status: 400 });

  const target = lang === "hi" ? "Hindi (Devanagari script)" : "simple Indian English";
  const prompt = `A deaf person is communicating using sign language. A recogniser detected these signs, in order:
${words.map((w, i) => `${i + 1}. ${w}`).join("\n")}

Turn them into ONE short, natural, first-person sentence in ${target} that the person most likely means.
Keep it polite and under 20 words. Reply with only the sentence, no quotes or explanation.`;

  try {
    const model = textModel();
    const parts = await geminiGenerate(model, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, ...fastConfig(model) },
    });
    const sentence = parts.map((p) => p.text ?? "").join("").trim().replace(/^["']|["']$/g, "");
    if (!sentence) throw new Error("empty response");
    return NextResponse.json({ sentence });
  } catch (err) {
    console.error("[sentence]", err);
    // Gemini na chale to bhi kuch to bolo: words ko jod do.
    return NextResponse.json({ sentence: words.join(", "), fallback: true });
  }
}
