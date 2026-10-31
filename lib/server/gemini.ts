import "server-only";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type Part = { text?: string; inlineData?: { mimeType: string; data: string } };

type GenerateResponse = {
  candidates?: { content?: { parts?: Part[] } }[];
  error?: { message?: string };
};

export function geminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY set nahi hai");
  return key;
}

export async function geminiGenerate(model: string, body: unknown): Promise<Part[]> {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey() },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as GenerateResponse;
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${json.error?.message ?? "unknown error"}`);
  return json.candidates?.[0]?.content?.parts ?? [];
}

/** Gemini TTS raw 16-bit PCM (24 kHz mono) deta hai; browser ke liye usse WAV mein lapet-te hain. */
export function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

