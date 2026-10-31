import type { Lang } from "./signs";

export type VoiceSource = "elevenlabs" | "gemini" | "browser";

type Cached = { buffer: AudioBuffer; source: VoiceSource };

const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<Cached | null>>();
let ctx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;
let token = 0;

const key = (text: string, lang: Lang) => `${lang}:${text}`;

function audioContext() {
  if (!ctx && typeof window !== "undefined") {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  }
  return ctx;
}

/**
 * Safari (Mac/iPhone) aur kuch browsers awaaz tabhi bajne dete hain jab user ne click kiya ho.
 * Isliye pehle click (jaise "Camera chalu karo") par ise call karo; uske baad awaaz kabhi bhi baj sakti hai.
 */
export function unlockAudio() {
  const ac = audioContext();
  if (!ac) return;
  void ac.resume();
  const silent = ac.createBufferSource();
  silent.buffer = ac.createBuffer(1, 1, 22050);
  silent.connect(ac.destination);
  silent.start(0);
  // speechSynthesis ko bhi isi click mein jagao
  if (typeof speechSynthesis !== "undefined") {
    speechSynthesis.getVoices();
    speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  }
}

function fetchVoice(text: string, lang: Lang): Promise<Cached | null> {
  const k = key(text, lang);
  const hit = cache.get(k);
  if (hit) return Promise.resolve(hit);
  const ac = audioContext();
  if (!ac) return Promise.resolve(null);
  let p = inflight.get(k);
  if (!p) {
    p = fetch(`/api/tts?lang=${lang}&text=${encodeURIComponent(text)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        const source = (res.headers.get("x-voice-source") as VoiceSource) ?? "elevenlabs";
        const buffer = await ac.decodeAudioData(await res.arrayBuffer());
        const entry = { buffer, source };
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

/** Saare phrases ki awaaz pehle se le aata hai, taaki sign dikhte hi turant baje. */
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
  const ac = audioContext();
  if (!voice || !ac) {
    speakWithBrowser(text, lang);
    return "browser";
  }
  if (ac.state !== "running") await ac.resume().catch(() => undefined);
  const node = ac.createBufferSource();
  node.buffer = voice.buffer;
  node.connect(ac.destination);
  node.start();
  current = node;
  return voice.source;
}

export function stopSpeaking() {
  try {
    current?.stop();
  } catch {
    // pehle hi khatam ho chuka
  }
  current = null;
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

/** Browser ki apni awaaz mein Hindi voice ho ya nahi, ye UI ko batane ke liye. */
export function browserHasVoice(lang: Lang) {
  if (typeof speechSynthesis === "undefined") return false;
  const prefix = lang === "hi" ? "hi" : "en";
  return speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith(prefix));
}

function speakWithBrowser(text: string, lang: Lang) {
  if (typeof speechSynthesis === "undefined") return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "hi" ? "hi-IN" : "en-IN";
  const voice = speechSynthesis.getVoices().find((v) => v.lang.replace("_", "-").startsWith(u.lang.slice(0, 2)));
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}
