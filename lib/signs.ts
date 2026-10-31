export type Lang = "hi" | "en";

/** MediaPipe ke built-in gesture names. */
export type BuiltinGesture =
  | "Open_Palm"
  | "Closed_Fist"
  | "Thumb_Up"
  | "Thumb_Down"
  | "Victory"
  | "Pointing_Up"
  | "ILoveYou";

export const BUILTIN_GESTURES: { id: BuiltinGesture; label: string }[] = [
  { id: "Open_Palm", label: "✋ Khula haath" },
  { id: "Closed_Fist", label: "✊ Mutthi" },
  { id: "Thumb_Up", label: "👍 Angutha upar" },
  { id: "Thumb_Down", label: "👎 Angutha neeche" },
  { id: "Victory", label: "✌️ Victory" },
  { id: "Pointing_Up", label: "☝️ Ungli upar" },
  { id: "ILoveYou", label: "🤟 I love you" },
];

export type Sign = {
  id: string;
  emoji: string;
  /** Card par dikhne wala chhota naam */
  name: string;
  /** Bolne wala text */
  phrase: Record<Lang, string>;
  /** Sentence mode mein Gemini ko bhejne wala keyword */
  keyword: string;
  /** Sign kaise banana hai */
  howTo: string;
  /** Quick mode mein kaunsa built-in gesture is sign ko trigger karega */
  builtin?: BuiltinGesture;
  /** User ne khud banaya hai to true */
  custom?: boolean;
};

export const DEFAULT_SIGNS: Sign[] = [
  {
    id: "namaste",
    emoji: "👋",
    name: "Namaste",
    phrase: { hi: "नमस्ते! आप कैसे हैं?", en: "Hello! How are you?" },
    keyword: "hello",
    howTo: "Khula haath camera ki taraf, ungliyan upar.",
    builtin: "Open_Palm",
  },
  {
    id: "haan",
    emoji: "👍",
    name: "Haan / Theek hai",
    phrase: { hi: "हाँ, ठीक है।", en: "Yes, okay." },
    keyword: "yes",
    howTo: "Mutthi band, angutha upar.",
    builtin: "Thumb_Up",
  },
  {
    id: "nahi",
    emoji: "👎",
    name: "Nahi",
    phrase: { hi: "नहीं, मुझे नहीं चाहिए।", en: "No, I don't want it." },
    keyword: "no",
    howTo: "Mutthi band, angutha neeche.",
    builtin: "Thumb_Down",
  },
  {
    id: "madad",
    emoji: "🆘",
    name: "Madad",
    phrase: { hi: "मुझे मदद चाहिए।", en: "I need help." },
    keyword: "help",
    howTo: "Mutthi band karke camera ko dikhao (ISL mein mutthi doosre haath ki hatheli par).",
    builtin: "Closed_Fist",
  },
  {
    id: "dhanyavaad",
    emoji: "🙏",
    name: "Dhanyavaad",
    phrase: { hi: "बहुत-बहुत धन्यवाद!", en: "Thank you so much!" },
    keyword: "thank you",
    howTo: "Quick mode: ✌️ victory sign. Asli ISL sign ke liye Train mode use karo.",
    builtin: "Victory",
  },
];

export const NONE_LABEL = "__none__";
