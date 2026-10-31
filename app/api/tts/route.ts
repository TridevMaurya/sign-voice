import { NextRequest } from "next/server";
import { geminiGenerate, pcmToWav } from "@/lib/server/gemini";

export const runtime = "nodejs";

const MAX_CHARS = 300;

/**
 * GET /api/tts?text=...&lang=hi|en
 * GET isliye ki Vercel ka CDN same text ki audio cache kar le — har phrase ka paisa sirf ek baar lagega.
 */
export async function GET(req: NextRequest) {
  const text = (req.nextUrl.searchParams.get("text") ?? "").trim();
  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "hi";

  if (!text) return new Response("text missing", { status: 400 });
  if (text.length > MAX_CHARS) return new Response("text too long", { status: 413 });

  const preferred = process.env.TTS_PROVIDER === "gemini" ? "gemini" : "elevenlabs";
  const order = preferred === "gemini" ? [gemini, elevenlabs] : [elevenlabs, gemini];
  const errors: string[] = [];

  for (const provider of order) {
    try {
      const { audio, contentType, source } = await provider(text, lang);
      return new Response(new Uint8Array(audio), {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
          "x-voice-source": source,
        },
      });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  console.error("[tts] sab providers fail:", errors);
  return new Response(`TTS failed: ${errors.join(" | ")}`, {
    status: 502,
    headers: { "Cache-Control": "no-store" },
  });
}

type TtsResult = { audio: Buffer; contentType: string; source: string };

async function elevenlabs(text: string, _lang: string): Promise<TtsResult> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY set nahi hai");
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { audio: Buffer.from(await res.arrayBuffer()), contentType: "audio/mpeg", source: "elevenlabs" };
}

async function gemini(text: string, lang: string): Promise<TtsResult> {
  const model = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
  const voiceName = process.env.GEMINI_TTS_VOICE || "Kore";
  const instruction =
    lang === "hi"
      ? "Ise saaf, garamjoshi bhari Hindi awaaz mein boliye:"
      : "Say this in a clear, warm Indian English voice:";

  const parts = await geminiGenerate(model, {
    contents: [{ parts: [{ text: `${instruction} ${text}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  });
  const data = parts.find((p) => p.inlineData?.data)?.inlineData;
  if (!data) throw new Error("Gemini TTS ne audio nahi diya");

  const raw = Buffer.from(data.data, "base64");
  // Gemini abhi "audio/L16;codec=pcm;rate=24000" deta hai; agar kabhi seedha wav/mp3 de to waisa hi bhej do.
  if (data.mimeType.startsWith("audio/L16") || data.mimeType.includes("pcm")) {
    const rate = Number(/rate=(\d+)/.exec(data.mimeType)?.[1] ?? 24000);
    return { audio: pcmToWav(raw, rate), contentType: "audio/wav", source: "gemini" };
  }
  return { audio: raw, contentType: data.mimeType, source: "gemini" };
}
