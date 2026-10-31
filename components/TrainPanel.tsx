"use client";

import { useRef, useState } from "react";
import { NONE_LABEL, type Sign } from "@/lib/signs";

type Props = {
  signs: Sign[];
  counts: Record<string, number>;
  recordingLabel: string | null;
  cameraOn: boolean;
  samplesPerRecording: number;
  onRecord: (label: string) => void;
  onClear: (label: string) => void;
  onAddSign: (sign: Sign) => void;
  onRemoveSign: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onUseCustom: () => void;
};

export function TrainPanel(props: Props) {
  const { signs, counts, recordingLabel, cameraOn, samplesPerRecording } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const trained = signs.filter((s) => (counts[s.id] ?? 0) > 0).length;

  const rows: { id: string; emoji: string; name: string; custom?: boolean }[] = [
    ...signs,
    { id: NONE_LABEL, emoji: "🫥", name: "Koi sign nahi (haath normal)" },
  ];

  return (
    <div className="train">
      <ol className="steps">
        <li>Camera start karo, phir kisi sign ke saamne <b>Record</b> dabao.</li>
        <li>3-2-1 ke baad sign dikhao — {samplesPerRecording} samples lagenge (~3 sec). Haath thoda aage-peeche, left-right karo.</li>
        <li>Har sign 2-3 baar record karo. “Koi sign nahi” bhi record karo taaki galti se na bole.</li>
      </ol>

      <ul className="train-list">
        {rows.map((row) => {
          const n = counts[row.id] ?? 0;
          const isRec = recordingLabel === row.id;
          return (
            <li key={row.id} className={isRec ? "recording" : ""}>
              <span className="train-emoji">{row.emoji}</span>
              <span className="train-name">
                {row.name}
                <span className="meter" aria-label={`${n} samples`}>
                  <span style={{ width: `${Math.min(100, (n / (samplesPerRecording * 3)) * 100)}%` }} />
                </span>
                <span className="muted small">{n} samples</span>
              </span>
              <span className="train-actions">
                <button
                  className="btn small primary"
                  disabled={!cameraOn || recordingLabel !== null}
                  onClick={() => props.onRecord(row.id)}
                >
                  {isRec ? "●" : "Record"}
                </button>
                <button className="btn small ghost" disabled={!n} onClick={() => props.onClear(row.id)}>
                  Reset
                </button>
                {row.custom && (
                  <button className="btn small ghost" onClick={() => props.onRemoveSign(row.id)} title="Sign hatao">
                    ✕
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {!cameraOn && <p className="muted small">Record karne ke liye pehle camera start karo.</p>}

      <div className="train-footer">
        <button className="btn primary" disabled={trained < 2} onClick={props.onUseCustom}>
          🎯 Custom mode chalu karo
        </button>
        <button className="btn ghost" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ Naya sign"}
        </button>
        <button className="btn ghost" onClick={props.onExport}>
          Export
        </button>
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onImport(f);
            e.target.value = "";
          }}
        />
      </div>

      {showForm && (
        <NewSignForm
          onSubmit={(s) => {
            props.onAddSign(s);
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function NewSignForm({ onSubmit }: { onSubmit: (s: Sign) => void }) {
  const [emoji, setEmoji] = useState("✋");
  const [name, setName] = useState("");
  const [hi, setHi] = useState("");
  const [en, setEn] = useState("");

  return (
    <form
      className="new-sign"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !(hi.trim() || en.trim())) return;
        onSubmit({
          id: `custom-${Date.now().toString(36)}`,
          emoji: emoji.trim() || "✋",
          name: name.trim(),
          phrase: { hi: hi.trim() || en.trim(), en: en.trim() || hi.trim() },
          keyword: (en.trim() || name.trim()).toLowerCase(),
          howTo: "Aapka trained sign.",
          custom: true,
        });
      }}
    >
      <div className="row">
        <input className="emoji-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} aria-label="Emoji" />
        <input placeholder="Naam (jaise: Paani)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
      </div>
      <input placeholder="Hindi mein kya bole (जैसे: मुझे पानी चाहिए)" value={hi} onChange={(e) => setHi(e.target.value)} maxLength={200} />
      <input placeholder="English mein kya bole (e.g. I need water)" value={en} onChange={(e) => setEn(e.target.value)} maxLength={200} />
      <button className="btn primary" type="submit">
        Sign add karo
      </button>
      <p className="muted small">Add karne ke baad upar list mein uske saamne Record dabao.</p>
    </form>
  );
}
