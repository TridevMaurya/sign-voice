"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GestureRecognizerResult } from "@mediapipe/tasks-vision";
import { useHandTracker } from "./useHandTracker";
import { SIGNS, SIGN_BY_ID, type Lang } from "@/lib/signs";
import { classifyFrame } from "@/lib/handshape";
import { glyphSvg } from "@/lib/glyph";
import { SignStabilizer } from "@/lib/stabilizer";
import { browserHasVoice, prefetch, speak, stopSpeaking, unlockAudio } from "@/lib/speech";

type ApiStatus = { elevenlabs: boolean; gemini: boolean; ttsProvider: string };
type Spoken = { id: number; signId: string };

const PREFS_KEY = "signvoice.prefs.v2";

export default function SignStudio() {
  const [lang, setLang] = useState<Lang>("hi");
  const [sound, setSound] = useState(true);
  const [api, setApi] = useState<ApiStatus | null>(null);
  const [live, setLive] = useState<{ signId: string | null; progress: number }>({ signId: null, progress: 0 });
  const [history, setHistory] = useState<Spoken[]>([]);
  const [debug, setDebug] = useState<string | null>(null);

  const stabilizer = useRef(new SignStabilizer());
  const liveRef = useRef(live);
  const prefs = useRef({ lang, sound });
  prefs.current = { lang, sound };
  const debugOn = useRef(false);

  const glyphs = useMemo(() => Object.fromEntries(SIGNS.map((s) => [s.id, glyphSvg(s.glyph)])), []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
      if (saved.lang === "hi" || saved.lang === "en") setLang(saved.lang);
      if (typeof saved.sound === "boolean") setSound(saved.sound);
    } catch {
      // pehli visit
    }
    debugOn.current = new URLSearchParams(location.search).has("debug");
    fetch("/api/status")
      .then((r) => r.json())
      .then(setApi)
      .catch(() => setApi({ elevenlabs: false, gemini: false, ttsProvider: "browser" }));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ lang, sound }));
    } catch {
      // storage blocked
    }
  }, [lang, sound]);

  // Saari awaazein pehle se le aao, taaki sign dikhte hi bina ruke baje.
  useEffect(() => {
    if (api && (api.elevenlabs || api.gemini)) prefetch(SIGNS.map((s) => s.phrase[lang]), lang);
  }, [api, lang]);

  // Browser ki voices der se load hoti hain; aane par label update karo.
  const [voicesReady, setVoicesReady] = useState(0);
  useEffect(() => {
    if (typeof speechSynthesis === "undefined") return;
    const bump = () => setVoicesReady((n) => n + 1);
    speechSynthesis.addEventListener("voiceschanged", bump);
    bump();
    return () => speechSynthesis.removeEventListener("voiceschanged", bump);
  }, []);

  const say = useCallback((signId: string) => {
    const sign = SIGN_BY_ID[signId];
    if (!sign) return;
    setHistory((h) => [{ id: Date.now(), signId }, ...h].slice(0, 4));
    if (prefs.current.sound) void speak(sign.phrase[prefs.current.lang], prefs.current.lang);
  }, []);

  const onResult = useCallback(
    (result: GestureRecognizerResult, now: number) => {
      const hands = result.landmarks.map((image, i) => ({ image, world: result.worldLandmarks[i] }));
      const { signId, states } = classifyFrame(hands);
      const { progress, fired } = stabilizer.current.update(signId, now);

      const rounded = Math.round(progress * 20) / 20;
      if (liveRef.current.signId !== signId || liveRef.current.progress !== rounded) {
        liveRef.current = { signId, progress: rounded };
        setLive(liveRef.current);
      }
      if (debugOn.current) setDebug(states.map((s) => s.pattern).join("  ") || "—");
      if (fired) say(fired);
    },
    [say],
  );

  const tracker = useHandTracker(onResult);
  const running = tracker.status === "running";
  const loading = tracker.status === "loading-model" || tracker.status === "starting-camera";

  const current = live.signId ? SIGN_BY_ID[live.signId] : null;
  const last = history[0] ? SIGN_BY_ID[history[0].signId] : null;
  const shown = current ?? last;
  const serverVoice = Boolean(api && (api.elevenlabs || api.gemini));
  const voiceLabel = !api
    ? ""
    : serverVoice
      ? `Voice: ${api.elevenlabs && api.ttsProvider !== "gemini" ? "ElevenLabs" : "Gemini"}`
      : "Voice: browser";
  // voicesReady sirf re-render ke liye hai
  const voiceWarning =
    api && !serverVoice && voicesReady >= 0 && !browserHasVoice(lang)
      ? lang === "hi"
        ? "Is laptop ke browser mein Hindi awaaz nahi hai, aur server par ElevenLabs/Gemini key set nahi hai. Vercel mein ELEVENLABS_API_KEY daalo, ya English chuno."
        : "Is browser mein English awaaz nahi mili. Vercel mein ELEVENLABS_API_KEY daalo."
      : null;
  const start = () => {
    unlockAudio();
    void tracker.start();
  };

  return (
    <div className="app">
      <header className="bar">
        <span className="logo">Haath se Awaaz</span>
        <div className="bar-actions">
          <div className="seg" role="group" aria-label="Bhasha">
            <button aria-pressed={lang === "hi"} onClick={() => setLang("hi")}>
              हिंदी
            </button>
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>
              English
            </button>
          </div>
          <button
            className="link"
            onClick={() => {
              if (sound) stopSpeaking();
              setSound(!sound);
            }}
          >
            {sound ? "Awaaz on" : "Awaaz off"}
          </button>
          {running && (
            <button className="link" onClick={tracker.stop}>
              Camera band
            </button>
          )}
        </div>
      </header>

      <main className="main">
        <section className="left">
          <div className={`cam ${running ? "on" : ""}`}>
            <video ref={tracker.videoRef} playsInline muted />
            <canvas ref={tracker.canvasRef} />
            {!running && (
              <div className="cam-start">
                <button className="primary" onClick={start} disabled={loading}>
                  {tracker.status === "loading-model"
                    ? "Model load ho raha hai…"
                    : tracker.status === "starting-camera"
                      ? "Camera khul raha hai…"
                      : "Camera chalu karo"}
                </button>
                {tracker.error ? (
                  <p className="err">{tracker.error}</p>
                ) : (
                  <p className="faint">Video aapke device se bahar nahi jaata.</p>
                )}
              </div>
            )}
            {running && debug && (
              <span className="debug">
                {debug} · {tracker.delegate}
              </span>
            )}
          </div>

          <div className="caption" aria-live="polite">
            <div className="caption-meta">
              <span>{shown ? shown.title : running ? "Sign dikhao" : " "}</span>
              <span className="faint">{voiceLabel}</span>
            </div>
            <p className={`caption-text ${current ? "" : "idle"}`}>
              {shown ? shown.phrase[lang] : running ? "…" : "Camera chalu karke koi bhi sign dikhao."}
            </p>
            <div className="meter">
              <span style={{ transform: `scaleX(${live.progress})` }} />
            </div>
            {voiceWarning && <p className="warn">{voiceWarning}</p>}
            {history.length > 1 && (
              <ul className="history">
                {history.slice(1).map((h) => (
                  <li key={h.id}>{SIGN_BY_ID[h.signId].phrase[lang]}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="right">
          <div className="right-head">
            <h2>Signs</h2>
            <span className="faint">{SIGNS.length}</span>
          </div>
          <div className="grid">
            {SIGNS.map((s) => (
              <button
                key={s.id}
                className={`sign ${live.signId === s.id ? "active" : ""}`}
                onClick={() => {
                  unlockAudio();
                  say(s.id);
                }}
                title={s.hint}
              >
                <span className="glyph" dangerouslySetInnerHTML={{ __html: glyphs[s.id] }} />
                <span className="sign-title">{s.title}</span>
                <span className="sign-hint">{s.hint}</span>
              </button>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}
