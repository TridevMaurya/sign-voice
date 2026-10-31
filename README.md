# 🤟 Haath Se Awaaz — Sign Language → Voice

Camera ke saamne sign dikhao, website use pehchaan kar **Hindi ya English mein bol deti hai**.

- **Hand tracking:** Google MediaPipe. Browser mein chalta hai, free hai, aur video kahin upload nahi hota.
- **Sign pehchaanna:** do modes hain
  - ⚡ **Quick:** MediaPipe ke built-in gestures (👋 👍 👎 ✊ ✌️) seedha 5 signs se map hain. Bina training ke chalta hai.
  - 🎯 **Custom:** asli ISL signs khud record karo (har sign ~40 samples). Browser mein ek KNN model train hota hai, dono haath support karta hai.
- **Awaaz:** ElevenLabs (default), uske baad Gemini TTS, uske baad browser ki built-in awaaz. Jo pehle chal jaaye.
- **Gemini:**
  - *Sentence mode:* kai signs ek ke baad ek dikhao ("madad" + "paani"), Gemini unse ek proper sentence banata hai aur bolta hai.
  - *✨ Gemini se poochho:* current frame Gemini Vision ko bhej kar second opinion leta hai.

---

## 1. Local par chalao

```bash
npm install          # postinstall MediaPipe ki wasm files public/ mein copy kar deta hai
cp .env.example .env.local
# .env.local mein apni ELEVENLABS_API_KEY aur GEMINI_API_KEY daalo
npm run dev
```

http://localhost:3000 kholo, **Camera Start Karo** dabao, aur camera ko 👍 dikhao.

> Camera sirf `localhost` ya `https://` par chalta hai. Vercel apne aap HTTPS deta hai.

## 2. Vercel par deploy

**Option A: GitHub se (recommended)**

1. Is folder ko ek nayi GitHub repo mein push karo:
   ```bash
   git init && git add . && git commit -m "Haath Se Awaaz"
   git branch -M main
   git remote add origin https://github.com/<aapka-username>/sign-voice.git
   git push -u origin main
   ```
2. https://vercel.com/new par jao, repo import karo. Framework apne aap **Next.js** detect ho jayega.
3. **Environment Variables** mein ye daalo (`.env.example` dekho):
   | Name | Value |
   |---|---|
   | `ELEVENLABS_API_KEY` | aapki ElevenLabs key |
   | `ELEVENLABS_VOICE_ID` | koi Hindi/Indian voice ka ID (Voice Library se) |
   | `GEMINI_API_KEY` | aapki Gemini key |
4. **Deploy** dabao. Ho gaya ✅

**Option B: CLI se**

```bash
npm i -g vercel
vercel                      # pehli baar link/setup
vercel env add ELEVENLABS_API_KEY
vercel env add GEMINI_API_KEY
vercel --prod
```

## 3. Apne asli ISL signs kaise sikhaayein

1. **Train** tab kholo, camera on rakho.
2. Kisi sign ke saamne **Record** dabao. 3-2-1 ke baad sign dikhao aur haath ko thoda aage-peeche, left-right karte raho.
3. Har sign **2-3 baar** record karo. Alag light ya alag doori par record karoge to accuracy aur badhegi.
4. **"Koi sign nahi"** bhi record karo (haath normal, ya haath hilate hue). Isse website galti se nahi bolegi.
5. **🎯 Custom mode chalu karo** dabao.
6. **+ Naya sign** se apne sign add kar sakte ho (jaise "Paani" → "मुझे पानी चाहिए").
7. Training browser ke localStorage mein save hoti hai. **Export/Import** se doosre device par le ja sakte ho.

## 4. Settings (env vars)

| Variable | Default | Kya karta hai |
|---|---|---|
| `TTS_PROVIDER` | `elevenlabs` | `gemini` likho to Gemini TTS pehle try hoga |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` | `eleven_flash_v2_5` zyada fast hai |
| `GEMINI_TEXT_MODEL` | `gemini-2.5-flash` | Sentence + verify ke liye |
| `GEMINI_TTS_MODEL` | `gemini-2.5-flash-preview-tts` | Gemini ki awaaz |
| `GEMINI_TTS_VOICE` | `Kore` | Gemini voice name |

## 5. Code kahan kya hai

```
app/
  page.tsx                 → main page
  api/tts/route.ts         → ElevenLabs / Gemini TTS (GET, Vercel CDN par cache hota hai)
  api/sentence/route.ts    → Gemini: signs → sentence
  api/verify/route.ts      → Gemini Vision: frame → kaunsa sign
  api/status/route.ts      → kaunsi keys set hain (UI ke badges ke liye)
components/
  SignStudio.tsx           → poora UI + detection logic
  useHandTracker.ts        → camera + MediaPipe + skeleton drawing
  TrainPanel.tsx           → training UI
  Transcript.tsx           → "Jo bola gaya" list
lib/
  signs.ts                 → default 5 signs (yahin phrases badlo)
  classifier.ts            → landmarks → features → KNN
  stabilizer.ts            → 0.7s hold + 2.5s cooldown (baar-baar bolna rokta hai)
  speech.ts                → audio play, cache, browser-voice fallback
public/models/gesture_recognizer.task → MediaPipe model (repo mein hi hai)
```

## 6. Kharcha aur security

- API keys **sirf server par** rehti hain (Vercel functions). Browser mein kabhi nahi jaati.
- `/api/tts` GET request hai aur Vercel CDN par 1 saal ke liye cache hoti hai, isliye har fixed phrase ka ElevenLabs charge **sirf ek baar** lagta hai.
- Public site par koi bhi `/api/tts` ko call kar sakta hai, lekin text 300 characters tak limited hai. Zyada traffic aaye to Vercel Firewall mein rate-limit rule laga do, ya ElevenLabs dashboard mein monthly limit set kar do.

## 7. Limitations (honestly)

- Ek frame mein ruka hua (static) haath ka shape sabse achha pakda jaata hai. Jin signs mein motion hota hai (jaise ISL ka "Dhanyavaad"), wo partially pakde jaate hain, kyunki unke beech wala ruka hua pose hi pehchaana jaata hai.
- Chehre ke expressions aur grammar ko ye nahi samajhta. 4-10 signs ke vocabulary ke liye ye achha kaam karta hai, poori sign language ke liye nahi.
