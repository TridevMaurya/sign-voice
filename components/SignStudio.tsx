"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GestureRecognizerResult } from "@mediapipe/tasks-vision";
import { useHandTracker } from "./useHandTracker";
import { TrainPanel } from "./TrainPanel";
import { Transcript, type TranscriptEntry } from "./Transcript";
import { DEFAULT_SIGNS, NONE_LABEL, type Lang, type Sign } from "@/lib/signs";
import { KnnClassifier, extractFeatures, loadSamples, saveSamples } from "@/lib/classifier";
import { SignStabilizer } from "@/lib/stabilizer";
import { prefetch, speak, stopSpeaking } from "@/lib/speech";

type Mode = "quick" | "custom";
type Tab = "signs" | "train";
type ApiStatus = { elevenlabs: boolean; gemini: boolean; ttsProvider: string };

const CUSTOM_SIGNS_KEY = "signvoice.customSigns.v1";
const PREFS_KEY = "signvoice.prefs.v1";
const SAMPLES_PER_RECORDING = 40;
const SAMPLE_INTERVAL_MS = 70;
const SENTENCE_IDLE_MS = 3500;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage na mile to bas is session tak yaad rahega.
  }
}

export default function SignStudio() {
  // ---------- State ----------
  const [customSigns, setCustomSigns] = useState<Sign[]>([]);
  const [lang, setLang] = useState<Lang>("hi");
  const [mode, setMode] = useState<Mode>("quick");
  const [tab, setTab] = useState<Tab>("signs");
  const [sentenceMode, setSentenceMode] = useState(false);
  const [buffer, setBuffer] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [live, setLive] = useState<{ signId: string | null; progress: number }>({ signId: null, progress: 0 });
  const [flashId, setFlashId] = useState<string | null>(null);
  const [api, setApi] = useState<ApiStatus | null>(null);
  const [sampleCounts, setSampleCounts] = useState<Record<string, number>>({});
  const [recording, setRecording] = useState<{ label: string; left: number } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<"sentence" | "verify" | null>(null);

  const signs = useMemo(() => [...DEFAULT_SIGNS, ...customSigns], [customSigns]);

  // Frame loop har frame chalta hai; usse stale state na mile isliye refs.
  const knnRef = useRef(new KnnClassifier());
  const stabilizerRef = useRef(new SignStabilizer());
  const lastSampleAt = useRef(0);
  const liveRef = useRef(live);
  const stateRef = useRef({ signs, mode, recording, lang, sentenceMode });
  stateRef.current = { signs, mode, recording, lang, sentenceMode };

  // ---------- Load saved data ----------
  useEffect(() => {
    setCustomSigns(readJson<Sign[]>(CUSTOM_SIGNS_KEY, []));
    const prefs = readJson<{ lang?: Lang; mode?: Mode }>(PREFS_KEY, {});
    if (prefs.lang) setLang(prefs.lang);
    knnRef.current = new KnnClassifier(loadSamples());
    const counts = knnRef.current.countByLabel();
    setSampleCounts(counts);
    if (prefs.mode) setMode(prefs.mode);
    else if (Object.keys(counts).length >= 2) setMode("custom");

    fetch("/api/status")
      .then((r) => r.json())
      .then(setApi)
      .catch(() => setApi({ elevenlabs: false, gemini: false, ttsProvider: "browser" }));
  }, []);

  useEffect(() => writeJson(PREFS_KEY, { lang, mode }), [lang, mode]);

  // Phrases ki audio pehle se le aao, taaki sign dikhte hi awaaz turant aaye.
  useEffect(() => {
    if (!api || !(api.elevenlabs || api.gemini)) return;
    signs.forEach((s) => prefetch(s.phrase[lang], lang));
  }, [api, lang, signs]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  const addTranscript = useCallback((entry: Omit<TranscriptEntry, "id" | "time">) => {
    const full = { ...entry, id: crypto.randomUUID(), time: Date.now() };
    setTranscript((t) => [full, ...t].slice(0, 50));
    return full.id;
  }, []);

  const say = useCallback(
    async (text: string, extra: Partial<TranscriptEntry> = {}) => {
      const id = addTranscript({ text, ...extra });
      const source = await speak(text, stateRef.current.lang);
      setTranscript((t) => t.map((e) => (e.id === id ? { ...e, source } : e)));
    },
    [addTranscript],
  );

  // ---------- Jab koi sign confirm ho ----------
  const onSign = useCallback(
    (signId: string) => {
      const sign = stateRef.current.signs.find((s) => s.id === signId);
      if (!sign) return;
      setFlashId(signId);
      window.setTimeout(() => setFlashId((f) => (f === signId ? null : f)), 900);

      if (stateRef.current.sentenceMode) {
        setBuffer((b) => [...b, signId]);
        return;
      }
      void say(sign.phrase[stateRef.current.lang], { signId, emoji: sign.emoji });
    },
    [say],
  );

  // ---------- Har frame ----------
  const onResult = useCallback(
    (result: GestureRecognizerResult, now: number) => {
      const { signs, mode, recording } = stateRef.current;
      const features = extractFeatures(result.landmarks, result.handedness);

      // Training chal rahi hai: samples jama karo, kuch bolo mat.
      if (recording) {
        if (features && now - lastSampleAt.current > SAMPLE_INTERVAL_MS) {
          lastSampleAt.current = now;
          knnRef.current.add(recording.label, features);
          const left = recording.left - 1;
          stateRef.current.recording = left > 0 ? { ...recording, left } : null;
          setRecording(stateRef.current.recording);
          if (left <= 0) {
            saveSamples(knnRef.current.samples);
            setSampleCounts(knnRef.current.countByLabel());
          }
        }
        return;
      }

      let signId: string | null = null;
      if (mode === "quick") {
        let best = { name: "", score: 0 };
        for (const hand of result.gestures) {
          const top = hand[0];
          if (top && top.categoryName !== "None" && top.score > best.score) {
            best = { name: top.categoryName, score: top.score };
          }
        }
        if (best.score >= 0.6) signId = signs.find((s) => s.builtin === best.name)?.id ?? null;
      } else if (features) {
        const pred = knnRef.current.predict(features);
        if (pred && pred.confidence >= 0.6 && pred.label !== NONE_LABEL) signId = pred.label;
      }

      const { progress, fired } = stabilizerRef.current.update(signId, now);
      const rounded = Math.round(progress * 10) / 10;
      if (liveRef.current.signId !== signId || liveRef.current.progress !== rounded) {
        liveRef.current = { signId, progress: rounded };
        setLive(liveRef.current);
      }
      if (fired) onSign(fired);
    },
    [onSign],
  );

  const tracker = useHandTracker(onResult);

  // ---------- Sentence mode: kuch der sign na aaye to sentence bana ke bolo ----------
  const speakSentence = useCallback(async () => {
    const ids = buffer;
    if (!ids.length) return;
    setBuffer([]);
    const words = ids.map((id) => signs.find((s) => s.id === id)?.keyword ?? id);
    setBusy("sentence");
    try {
      const res = await fetch("/api/sentence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words, lang }),
      });
      const { sentence, fallback } = await res.json();
      if (fallback) showToast("Gemini se sentence nahi bana, words seedhe bol raha hoon.");
      await say(sentence, { emoji: "💬", detail: words.join(" + ") });
    } catch {
      await say(words.join(", "), { emoji: "💬" });
    } finally {
      setBusy(null);
    }
  }, [buffer, signs, lang, say, showToast]);

  useEffect(() => {
    if (!sentenceMode || !buffer.length) return;
    const t = window.setTimeout(speakSentence, SENTENCE_IDLE_MS);
    return () => window.clearTimeout(t);
  }, [buffer, sentenceMode, speakSentence]);

  // ---------- Gemini se poochho ----------
  const verifyWithGemini = useCallback(async () => {
    const image = tracker.captureFrame();
    if (!image) return showToast("Pehle camera start karo.");
    setBusy("verify");
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          signs: signs.map(({ id, name, howTo }) => ({ id, name, howTo })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const sign = signs.find((s) => s.id === data.id);
      if (sign && data.confidence >= 0.5) {
        setFlashId(sign.id);
        await say(sign.phrase[lang], {
          signId: sign.id,
          emoji: sign.emoji,
          detail: `Gemini: ${Math.round(data.confidence * 100)}% — ${data.description}`,
        });
      } else {
        showToast(`Gemini ko koi sign pakka nahi dikha: ${data.description || "—"}`);
      }
    } catch (err) {
      showToast(`Gemini error: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(null);
    }
  }, [tracker, signs, lang, say, showToast]);

  // ---------- Training ----------
  const startRecording = useCallback(
    (label: string) => {
      if (tracker.status !== "running") return showToast("Pehle camera start karo.");
      setCountdown(3);
      let n = 3;
      const tick = window.setInterval(() => {
        n--;
        if (n > 0) return setCountdown(n);
        window.clearInterval(tick);
        setCountdown(null);
        const rec = { label, left: SAMPLES_PER_RECORDING };
        stateRef.current.recording = rec;
        setRecording(rec);
      }, 700);
    },
    [tracker.status, showToast],
  );

  const clearSamples = useCallback((label: string) => {
    knnRef.current.clearLabel(label);
    saveSamples(knnRef.current.samples);
    setSampleCounts(knnRef.current.countByLabel());
  }, []);

  const addCustomSign = useCallback((sign: Sign) => {
    setCustomSigns((list) => {
      const next = [...list, sign];
      writeJson(CUSTOM_SIGNS_KEY, next);
      return next;
    });
  }, []);

  const removeCustomSign = useCallback(
    (id: string) => {
      clearSamples(id);
      setCustomSigns((list) => {
        const next = list.filter((s) => s.id !== id);
        writeJson(CUSTOM_SIGNS_KEY, next);
        return next;
      });
    },
    [clearSamples],
  );

  const exportTraining = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify({ version: 1, customSigns, samples: knnRef.current.samples })],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sign-voice-training.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [customSigns]);

  const importTraining = useCallback(
    async (file: File) => {
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.samples)) throw new Error("samples missing");
        knnRef.current = new KnnClassifier(data.samples);
        saveSamples(data.samples);
        setSampleCounts(knnRef.current.countByLabel());
        if (Array.isArray(data.customSigns)) {
          setCustomSigns(data.customSigns);
          writeJson(CUSTOM_SIGNS_KEY, data.customSigns);
        }
        showToast(`Training import ho gayi: ${data.samples.length} samples.`);
      } catch (err) {
        showToast(`Import fail: ${err instanceof Error ? err.message : err}`);
      }
    },
    [showToast],
  );

  const trainedLabels = Object.keys(sampleCounts).filter((l) => l !== NONE_LABEL).length;
  const liveSign = signs.find((s) => s.id === live.signId);
  const running = tracker.status === "running";

  // ---------- UI ----------
  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            🤟
          </span>
          <div>
            <h1>Haath Se Awaaz</h1>
            <p>Camera ko sign dikhao — website bol degi.</p>
          </div>
        </div>
        <div className="api-badges">
          <Badge ok={api?.elevenlabs} label="ElevenLabs" />
          <Badge ok={api?.gemini} label="Gemini" />
        </div>
      </header>

      <main className="layout">
        <section className="stage">
          <div className={`camera ${running ? "on" : ""}`}>
            <video ref={tracker.videoRef} playsInline muted />
            <canvas ref={tracker.canvasRef} />

            {!running && (
              <div className="camera-empty">
                <div className="camera-empty-icon" aria-hidden>
                  📷
                </div>
                <button
                  className="btn primary big"
                  onClick={tracker.start}
                  disabled={tracker.status === "loading-model" || tracker.status === "starting-camera"}
                >
                  {tracker.status === "loading-model"
                    ? "Model load ho raha hai…"
                    : tracker.status === "starting-camera"
                      ? "Camera khul raha hai…"
                      : "Camera Start Karo"}
                </button>
                {tracker.error && <p className="error">{tracker.error}</p>}
                <p className="muted small">Video aapke browser se bahar nahi jaata.</p>
              </div>
            )}

            {running && (
              <>
                <div className="hud-top">
                  <span className="pill live">● LIVE</span>
                  <span className="pill">{tracker.fps} fps</span>
                  <span className="pill">{mode === "quick" ? "Quick mode" : "Custom mode"}</span>
                </div>

                {countdown !== null && <div className="countdown">{countdown}</div>}
                {recording && (
                  <div className="recording-banner">
                    ● Recording “{labelName(recording.label, signs)}” — {recording.left} samples baaki. Haath thoda
                    hilao/ghumao.
                  </div>
                )}

                {!recording && countdown === null && (
                  <div className={`detect ${liveSign ? "show" : ""}`}>
                    {liveSign && (
                      <>
                        <Ring progress={live.progress} />
                        <span className="detect-emoji">{liveSign.emoji}</span>
                        <span className="detect-name">{liveSign.name}</span>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="controls">
            <Segmented
              value={lang}
              onChange={(v) => setLang(v as Lang)}
              options={[
                { value: "hi", label: "हिंदी" },
                { value: "en", label: "English" },
              ]}
            />
            <Segmented
              value={mode}
              onChange={(v) => {
                if (v === "custom" && trainedLabels < 2) {
                  setTab("train");
                  showToast("Custom mode ke liye kam se kam 2 signs Train karo.");
                  return;
                }
                stabilizerRef.current.reset();
                setMode(v as Mode);
              }}
              options={[
                { value: "quick", label: "⚡ Quick" },
                { value: "custom", label: "🎯 Custom (trained)" },
              ]}
            />
            <label className="toggle">
              <input
                type="checkbox"
                checked={sentenceMode}
                onChange={(e) => {
                  setSentenceMode(e.target.checked);
                  setBuffer([]);
                }}
              />
              <span>Sentence mode</span>
            </label>
            <button
              className="btn"
              onClick={verifyWithGemini}
              disabled={!running || busy === "verify" || !api?.gemini}
              title={api?.gemini ? "Current frame Gemini ko dikhao" : "GEMINI_API_KEY set nahi hai"}
            >
              {busy === "verify" ? "Gemini dekh raha hai…" : "✨ Gemini se poochho"}
            </button>
            {running && (
              <button className="btn ghost" onClick={tracker.stop}>
                Camera band
              </button>
            )}
          </div>

          {sentenceMode && (
            <div className="sentence-bar">
              <div className="chips">
                {buffer.length === 0 ? (
                  <span className="muted">Signs ek-ek karke dikhao… rukte hi Gemini sentence bana ke bolega.</span>
                ) : (
                  buffer.map((id, i) => (
                    <span key={i} className="chip">
                      {signs.find((s) => s.id === id)?.emoji} {labelName(id, signs)}
                    </span>
                  ))
                )}
              </div>
              <div className="sentence-actions">
                <button className="btn primary" onClick={speakSentence} disabled={!buffer.length || busy !== null}>
                  {busy === "sentence" ? "Bana raha hoon…" : "Abhi bolo"}
                </button>
                <button className="btn ghost" onClick={() => setBuffer([])} disabled={!buffer.length}>
                  Clear
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="side">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "signs"} onClick={() => setTab("signs")}>
              Signs
            </button>
            <button role="tab" aria-selected={tab === "train"} onClick={() => setTab("train")}>
              Train {trainedLabels > 0 && <span className="count">{trainedLabels}</span>}
            </button>
          </div>

          {tab === "signs" ? (
            <div className="cards">
              {signs.map((sign) => {
                const usable = mode === "quick" ? Boolean(sign.builtin) : (sampleCounts[sign.id] ?? 0) > 0;
                return (
                  <button
                    key={sign.id}
                    className={[
                      "card",
                      live.signId === sign.id ? "active" : "",
                      flashId === sign.id ? "flash" : "",
                      usable ? "" : "dim",
                    ].join(" ")}
                    onClick={() => say(sign.phrase[lang], { signId: sign.id, emoji: sign.emoji, detail: "tap" })}
                    title="Tap karke awaaz suno"
                  >
                    <span className="card-emoji">{sign.emoji}</span>
                    <span className="card-body">
                      <span className="card-name">{sign.name}</span>
                      <span className="card-phrase">{sign.phrase[lang]}</span>
                      <span className="card-how">
                        {usable
                          ? sign.howTo
                          : mode === "quick"
                            ? "Quick mode mein nahi — Custom mode use karo."
                            : "Abhi train nahi hua — Train tab mein jao."}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <TrainPanel
              signs={signs}
              counts={sampleCounts}
              recordingLabel={recording?.label ?? null}
              cameraOn={running}
              samplesPerRecording={SAMPLES_PER_RECORDING}
              onRecord={startRecording}
              onClear={clearSamples}
              onAddSign={addCustomSign}
              onRemoveSign={removeCustomSign}
              onExport={exportTraining}
              onImport={importTraining}
              onUseCustom={() => {
                stabilizerRef.current.reset();
                setMode("custom");
                setTab("signs");
              }}
            />
          )}

          <Transcript
            entries={transcript}
            onReplay={(e) => speak(e.text, lang)}
            onClear={() => {
              stopSpeaking();
              setTranscript([]);
            }}
          />
        </aside>
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function labelName(id: string, signs: Sign[]) {
  if (id === NONE_LABEL) return "Koi sign nahi";
  return signs.find((s) => s.id === id)?.name ?? id;
}

function Badge({ ok, label }: { ok: boolean | undefined; label: string }) {
  return (
    <span className={`badge ${ok === undefined ? "" : ok ? "ok" : "off"}`} title={ok ? "Key set hai" : "Key set nahi"}>
      <span className="dot" /> {label}
    </span>
  );
}

function Ring({ progress }: { progress: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 52 52" aria-hidden>
      <circle cx="26" cy="26" r={r} className="ring-bg" />
      <circle
        cx="26"
        cy="26"
        r={r}
        className="ring-fg"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
      />
    </svg>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
