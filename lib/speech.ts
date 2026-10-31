import type { Lang } from "./signs";

export type VoiceSource = "elevenlabs" | "gemini" | "browser";

type Cached = { url: string; source: VoiceSource };

const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<Cached | null>>();
let currentAudio: HTMLAudioElement | null = null;
let token = 0;

const key = (text: string, lang: Lang) => `${lang}:${text}`;

function fetchVoice(text: string, lang: Lang): Promise<Cached | null> {
  const k = key(text, lang);
  const hit = cache.get(k);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(k);
  if (!p) {
    p = fetch(`/api/tts?lang=${lang}&text=${encodeURIComponent(text)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        const source = (res.headers.get("x-voice-source") as VoiceSource) ?? "elevenlabs";
        const entry = { url: URL.createObjectURL(await res.blob()), source };
        cache.set(k, entry);
        return entry;
      })
      .catch((err) => {
        console.warn("[tts]", err);
        return null;
      })
      .finally(() => inflight.delete(k));
    inflight.set(k, p);
  }
  return p;
}

/** Saare phrases ki audio pehle se le aata hai, taaki sign dikhte hi turant baje. */
export function prefetch(texts: string[], lang: Lang) {
  texts.forEach((t) => void fetchVoice(t, lang));
}

/**
 * Turant bolta hai. Pehle se kuch bol raha ho to use rok deta hai,
 * taaki awaaz hamesha abhi wale sign ki ho.
 */
export async function speak(text: string, lang: Lang): Promise<VoiceSource> {
  const my = ++token;
  stopSpeaking();
  const voice = await fetchVoice(text, lang);
  if (my !== token) return voice?.source ?? "browser";
  if (!voice) {
    speakWithBrowser(text, lang);
    return "browser";
  }
  const audio = new Audio(voice.url);
  currentAudio = audio;
  await audio.play().catch(() => speakWithBrowser(text, lang));
  return voice.source;
}

export function stopSpeaking() {
  currentAudio?.pause();
  currentAudio = null;
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

function speakWithBrowser(text: string, lang: Lang) {
  if (typeof speechSynthesis === "undefined") return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "hi" ? "hi-IN" : "en-IN";
  const voice = speechSynthesis.getVoices().find((v) => v.lang.replace("_", "-").startsWith(u.lang.slice(0, 2)));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}
