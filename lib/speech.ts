import type { Lang } from "./signs";

export type VoiceSource = "elevenlabs" | "gemini" | "browser" | "cache";

const cache = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
let currentAudio: HTMLAudioElement | null = null;

/**
 * Text ko awaaz mein bolta hai. Pehle server ka /api/tts (ElevenLabs/Gemini) try karta hai,
 * fail hone par browser ki built-in awaaz. Ek baar bani audio memory mein cache rehti hai.
 */
export function speak(text: string, lang: Lang): Promise<VoiceSource> {
  // Bahut saare signs ek saath aaye to purane drop karo, line lambi na ho.
  if (pending >= 2) stopSpeaking();
  pending++;
  const job = queue.then(() => speakNow(text, lang)).finally(() => pending--);
  queue = job.catch(() => undefined);
  return job;
}

export function stopSpeaking() {
  currentAudio?.pause();
  currentAudio = null;
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

/** Phrases ki audio pehle se fetch karke rakh leta hai, taaki sign dikhate hi turant bajey. */
export async function prefetch(text: string, lang: Lang) {
  const key = `${lang}:${text}`;
  if (cache.has(key)) return;
  try {
    const res = await fetch(ttsUrl(text, lang));
    if (res.ok) cache.set(key, URL.createObjectURL(await res.blob()));
  } catch {
    // Prefetch optional hai.
  }
}

function ttsUrl(text: string, lang: Lang) {
  return `/api/tts?lang=${lang}&text=${encodeURIComponent(text)}`;
}

async function speakNow(text: string, lang: Lang): Promise<VoiceSource> {
  const key = `${lang}:${text}`;
  let url = cache.get(key);
  let source: VoiceSource = "cache";

  if (!url) {
    try {
      const res = await fetch(ttsUrl(text, lang));
      if (!res.ok) throw new Error(await res.text());
      source = (res.headers.get("x-voice-source") as VoiceSource) ?? "elevenlabs";
      url = URL.createObjectURL(await res.blob());
      cache.set(key, url);
    } catch (err) {
      console.warn("[tts] server voice fail, browser voice use kar raha hoon:", err);
      await speakWithBrowser(text, lang);
      return "browser";
    }
  }

  await playUrl(url);
  return source;
}

function playUrl(url: string) {
  return new Promise<void>((resolve) => {
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = audio.onerror = audio.onpause = () => resolve();
    audio.play().catch(() => resolve());
  });
}

function speakWithBrowser(text: string, lang: Lang) {
  return new Promise<void>((resolve) => {
    if (typeof speechSynthesis === "undefined") return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "hi" ? "hi-IN" : "en-IN";
    const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith(u.lang.slice(0, 2)));
    if (voice) u.voice = voice;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
