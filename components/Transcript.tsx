"use client";

import type { VoiceSource } from "@/lib/speech";

export type TranscriptEntry = {
  id: string;
  time: number;
  text: string;
  signId?: string;
  emoji?: string;
  detail?: string;
  source?: VoiceSource;
};

const SOURCE_LABEL: Record<VoiceSource, string> = {
  elevenlabs: "ElevenLabs",
  gemini: "Gemini TTS",
  browser: "Browser voice",
  cache: "cached",
};

export function Transcript({
  entries,
  onReplay,
  onClear,
}: {
  entries: TranscriptEntry[];
  onReplay: (e: TranscriptEntry) => void;
  onClear: () => void;
}) {
  return (
    <div className="transcript">
      <div className="transcript-head">
        <h2>Jo bola gaya</h2>
        {entries.length > 0 && (
          <button className="btn small ghost" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="muted small">Abhi tak kuch nahi. Camera ko koi sign dikhao, ya kisi card par tap karo.</p>
      ) : (
        <ul aria-live="polite">
          {entries.map((e) => (
            <li key={e.id}>
              <span className="t-emoji">{e.emoji ?? "🔊"}</span>
              <span className="t-body">
                <span className="t-text">{e.text}</span>
                <span className="muted small">
                  {new Date(e.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  {e.source && ` · ${SOURCE_LABEL[e.source]}`}
                  {e.detail && ` · ${e.detail}`}
                </span>
              </span>
              <button className="btn small ghost" onClick={() => onReplay(e)} aria-label="Dobara suno">
                ▶
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
