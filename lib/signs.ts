export type Lang = "hi" | "en";

/** Ek haath ki drawing kaise bane (HandGlyph ke liye). */
export type HandPose = {
  thumb: "out" | "up" | "tucked" | "side";
  /** index, middle, ring, pinky */
  fingers: [boolean, boolean, boolean, boolean];
  /** OK / pinch: angutha aur index ki tip mili hui */
  touch?: boolean;
  /** Saari ungliyan ek point par (khana) */
  bunch?: boolean;
  rotate?: number;
};

export type Glyph = { hands: HandPose[]; layout?: "joined" | "apart" };

export type Sign = {
  id: string;
  /** Card par chhota title */
  title: string;
  /** Bolne wala text */
  phrase: Record<Lang, string>;
  /** Sign kaise banana hai (ek line) */
  hint: string;
  glyph: Glyph;
};

const F = (i: number, m: number, r: number, p: number) =>
  [Boolean(i), Boolean(m), Boolean(r), Boolean(p)] as HandPose["fingers"];
const one = (pose: HandPose): Glyph => ({ hands: [pose] });

export const SIGNS: Sign[] = [
  {
    id: "namaste",
    title: "Namaste",
    phrase: { hi: "नमस्ते!", en: "Hello!" },
    hint: "Poora haath khula",
    glyph: one({ thumb: "out", fingers: F(1, 1, 1, 1) }),
  },
  {
    id: "dhanyavaad",
    title: "Dhanyavaad",
    phrase: { hi: "बहुत-बहुत धन्यवाद।", en: "Thank you so much." },
    hint: "Dono hatheli jodo",
    glyph: { hands: [{ thumb: "side", fingers: F(1, 1, 1, 1) }, { thumb: "side", fingers: F(1, 1, 1, 1) }], layout: "joined" },
  },
  {
    id: "haan",
    title: "Haan",
    phrase: { hi: "हाँ, ठीक है।", en: "Yes, okay." },
    hint: "Angutha upar",
    glyph: one({ thumb: "up", fingers: F(0, 0, 0, 0) }),
  },
  {
    id: "nahi",
    title: "Nahi",
    phrase: { hi: "नहीं।", en: "No." },
    hint: "Angutha neeche",
    glyph: one({ thumb: "up", fingers: F(0, 0, 0, 0), rotate: 180 }),
  },
  {
    id: "ruko",
    title: "Ruko",
    phrase: { hi: "रुकिए।", en: "Please wait." },
    hint: "Mutthi band",
    glyph: one({ thumb: "tucked", fingers: F(0, 0, 0, 0) }),
  },
  {
    id: "ek-minute",
    title: "Ek minute",
    phrase: { hi: "एक मिनट।", en: "One minute." },
    hint: "Index ungli upar",
    glyph: one({ thumb: "tucked", fingers: F(1, 0, 0, 0) }),
  },
  {
    id: "wahan",
    title: "Wahan",
    phrase: { hi: "वहाँ।", en: "Over there." },
    hint: "Index ungli side mein",
    glyph: one({ thumb: "tucked", fingers: F(1, 0, 0, 0), rotate: 90 }),
  },
  {
    id: "kahan",
    title: "Kahan?",
    phrase: { hi: "कहाँ है?", en: "Where is it?" },
    hint: "Angutha + index (L)",
    glyph: one({ thumb: "out", fingers: F(1, 0, 0, 0) }),
  },
  {
    id: "theek",
    title: "Main theek hoon",
    phrase: { hi: "मैं ठीक हूँ।", en: "I am fine." },
    hint: "Do ungli (V)",
    glyph: one({ thumb: "tucked", fingers: F(1, 1, 0, 0) }),
  },
  {
    id: "paani",
    title: "Paani",
    phrase: { hi: "मुझे पानी चाहिए।", en: "I need water." },
    hint: "Teen ungli (W)",
    glyph: one({ thumb: "tucked", fingers: F(1, 1, 1, 0) }),
  },
  {
    id: "khana",
    title: "Khana",
    phrase: { hi: "मुझे भूख लगी है।", en: "I am hungry." },
    hint: "Saari ungliyon ki tips milao",
    glyph: one({ thumb: "out", fingers: F(1, 1, 1, 1), bunch: true }),
  },
  {
    id: "washroom",
    title: "Washroom",
    phrase: { hi: "मुझे वॉशरूम जाना है।", en: "I need the washroom." },
    hint: "Sirf chhoti ungli",
    glyph: one({ thumb: "tucked", fingers: F(0, 0, 0, 1) }),
  },
  {
    id: "phone",
    title: "Phone karo",
    phrase: { hi: "मुझे फ़ोन कीजिए।", en: "Please call me." },
    hint: "Angutha + chhoti ungli",
    glyph: one({ thumb: "out", fingers: F(0, 0, 0, 1) }),
  },
  {
    id: "ok",
    title: "Sab theek",
    phrase: { hi: "सब ठीक है।", en: "Everything is fine." },
    hint: "Angutha-index ka gola, baaki khuli",
    glyph: one({ thumb: "out", fingers: F(1, 1, 1, 1), touch: true }),
  },
  {
    id: "thoda",
    title: "Thoda sa",
    phrase: { hi: "थोड़ा सा।", en: "Just a little." },
    hint: "Angutha-index chutki",
    glyph: one({ thumb: "out", fingers: F(1, 0, 0, 0), touch: true }),
  },
  {
    id: "pyaar",
    title: "Pyaar",
    phrase: { hi: "मुझे आपसे प्यार है।", en: "I love you." },
    hint: "Angutha + index + chhoti",
    glyph: one({ thumb: "out", fingers: F(1, 0, 0, 1) }),
  },
  {
    id: "zabardast",
    title: "Zabardast",
    phrase: { hi: "ज़बरदस्त!", en: "Awesome!" },
    hint: "Index + chhoti ungli",
    glyph: one({ thumb: "tucked", fingers: F(1, 0, 0, 1) }),
  },
  {
    id: "madad",
    title: "Madad",
    phrase: { hi: "मदद कीजिए!", en: "Please help me!" },
    hint: "Dono haath khule, door",
    glyph: { hands: [{ thumb: "out", fingers: F(1, 1, 1, 1) }, { thumb: "out", fingers: F(1, 1, 1, 1) }], layout: "apart" },
  },
  {
    id: "badhiya",
    title: "Bahut badhiya",
    phrase: { hi: "बहुत बढ़िया!", en: "Excellent!" },
    hint: "Dono anguthe upar",
    glyph: { hands: [{ thumb: "up", fingers: F(0, 0, 0, 0) }, { thumb: "up", fingers: F(0, 0, 0, 0) }], layout: "apart" },
  },
];

export const SIGN_BY_ID = Object.fromEntries(SIGNS.map((s) => [s.id, s]));
