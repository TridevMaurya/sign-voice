# Haath se Awaaz — Sign Language → Voice

Camera ke saamne sign dikhao, website turant **Hindi ya English mein bol deti hai**.
Side mein 19 signs ki saaf drawings hain, taaki pata rahe kaunsa sign kya bolta hai.

- **Hand tracking:** Google MediaPipe. Browser mein chalta hai aur video kahin upload nahi hota.
- **Sign pehchaanna:** `lib/handshape.ts` mein rules hain. Har ungli khuli hai ya band, ye 3D angles se nikalta hai, aur us pattern se sign tay hota hai. **Koi training nahi chahiye.**
- **Real-time:** sign ~0.4 second hold karo to bol deta hai. Saari awaazein page khulte hi pehle se load ho jaati hain, aur naya sign aate hi purani awaaz ruk jaati hai.
- **Awaaz:** ElevenLabs, uske baad Gemini TTS, uske baad browser ki apni awaaz. Jo pehle chal jaaye.

## 19 signs

| Sign | Kaise banana hai | Bolta hai |
|---|---|---|
| Namaste | Poora haath khula | नमस्ते! |
| Dhanyavaad | Dono hatheli jodo | बहुत-बहुत धन्यवाद। |
| Haan | Angutha upar | हाँ, ठीक है। |
| Nahi | Angutha neeche | नहीं। |
| Ruko | Mutthi band | रुकिए। |
| Ek minute | Index ungli upar | एक मिनट। |
| Wahan | Index ungli side mein | वहाँ। |
| Kahan? | Angutha + index (L) | कहाँ है? |
| Main theek hoon | Do ungli (V) | मैं ठीक हूँ। |
| Paani | Teen ungli (W) | मुझे पानी चाहिए। |
| Khana | Saari ungliyon ki tips milao | मुझे भूख लगी है। |
| Washroom | Sirf chhoti ungli | मुझे वॉशरूम जाना है। |
| Phone karo | Angutha + chhoti ungli | मुझे फ़ोन कीजिए। |
| Sab theek | Angutha-index ka gola, baaki khuli | सब ठीक है। |
| Thoda sa | Angutha-index chutki | थोड़ा सा। |
| Pyaar | Angutha + index + chhoti | मुझे आपसे प्यार है। |
| Zabardast | Index + chhoti ungli | ज़बरदस्त! |
| Madad | Dono haath khule, door door | मदद कीजिए! |
| Bahut badhiya | Dono anguthe upar | बहुत बढ़िया! |

Phrase badalne ho to `lib/signs.ts` mein `phrase` edit karo.

## Local par chalao

```bash
npm install
cp .env.example .env.local   # isme ELEVENLABS_API_KEY aur GEMINI_API_KEY daalo
npm run dev
```

http://localhost:3000 kholo aur **Camera chalu karo** dabao.
Agar koi sign nahi pakda ja raha, to `http://localhost:3000/?debug=1` kholo. Camera ke upar finger pattern dikhega, jaise `01100` (angutha, index, middle, ring, chhoti; 1 = khuli).

## Vercel par deploy

1. Folder ko GitHub repo mein push karo.
2. https://vercel.com/new par jao aur repo import karo. Next.js apne aap detect ho jayega.
3. **Environment Variables** mein ye daalo:
   | Name | Value |
   |---|---|
   | `ELEVENLABS_API_KEY` | ElevenLabs key |
   | `ELEVENLABS_VOICE_ID` | Hindi/Indian voice ka ID (ElevenLabs Voice Library se) |
   | `GEMINI_API_KEY` | Gemini key (ElevenLabs fail ho to backup voice) |
4. **Deploy** dabao.

Baaki settings `.env.example` mein hain: `TTS_PROVIDER=gemini` likhoge to Gemini ki awaaz pehle try hogi; `ELEVENLABS_MODEL_ID=eleven_flash_v2_5` zyada fast hai.

## Code

```
app/page.tsx               → page
app/api/tts/route.ts       → ElevenLabs / Gemini TTS (Vercel CDN par cache hota hai)
app/api/status/route.ts    → kaunsi keys set hain
components/SignStudio.tsx  → UI
components/useHandTracker.ts → camera + MediaPipe
lib/handshape.ts           → haath ki shape → sign (rules)
lib/signs.ts               → 19 signs, unke phrases aur drawings ka data
lib/glyph.ts               → signs ki line-drawing SVG
lib/stabilizer.ts          → 0.4s hold, baar-baar bolna rokta hai
lib/speech.ts              → audio prefetch, play, browser fallback
```

## Kharcha aur security

- API keys sirf server par rehti hain.
- `/api/tts` ka jawab Vercel CDN par cache hota hai, isliye har phrase ka ElevenLabs charge sirf ek baar lagta hai: 19 phrases × 2 bhasha.
- Text 300 characters tak limited hai. Public site par zyada traffic aaye to Vercel Firewall mein rate-limit rule laga do.

## Limitations

- Ye haath ki **ruki hui shape** pehchaanta hai. Jin signs mein haath chalta hai, unke liye ye nahi bana.
- Accuracy test: MediaPipe ke rock/paper/scissors dataset ki 160 photos par 85–95% sahi pakda.
