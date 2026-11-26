# Helios AI closer (v4)

Static page. Open `index.html` with a local server from the repo root:

```bash
python3 -m http.server 8765
```

Then visit `http://localhost:8765/ai-closer-v4/`.

The homeowner talks to Helios the whole time. Binh's queue is `review/`. Approve, edit, decline, and take-over update that queue. The homeowner chat polls it. Lead rows post through the shared Apps Script endpoint in `config.js` at the repo root, with a `status` field.

v1, v2, and v3 are unchanged.

## Avatars

Halo, Aether, and Commander are faces on the same closer. They share the script, the voice bus, and the approval gate. Pick one with `?avatar=halo`, `?avatar=aether`, or `?avatar=commander`. The buttons on the page write that param without a reload.

If the URL has no `avatar` value, `assets/config.js` uses `avatar`. If that is empty, `assets/brand.js` uses `defaultAvatar`. Anything else falls back to Halo.

Each face animates idle, listening, thinking, and speaking. Speech level drives Halo's equalizer, Aether's core, and Commander's lips. Every face is labeled as an AI projection. The license line on the avatar card comes from `CLOSER_BRAND.license`.

## Porting the engine

Copy these files into the next brand repo and keep them as the engine:

- `assets/closer.js` — conversation, stubs, and the approval state
- `assets/avatars.js` — Halo, Aether, and Commander
- `assets/voice.js` — `speak()` providers
- `assets/queue.js` — advisor queue
- `assets/fx.js` — starfield, boot, and the avatar frame loop

Replace `assets/brand.js` for the other brand. That file holds the company, the bot name, the advisor name, the license, the address, the default avatar, and the colors. `closer.js` rewrites the names Helios, Binh Phan, and Binh from that file when it speaks, so the script does not need a second copy. The page HTML and `assets/config.js` (`voiceProvider`, `avatar`) stay with the brand.

## Voice

All spoken replies go through `HeliosVoice.speak()`. The mic uses the browser speech recognizer when it exists, and typing always works. Voice starts muted. The header toggle is what turns it on, so nothing speaks before a click.

### Browser voice (default)

`assets/config.js`:

```js
voiceProvider: "webspeech"
```

Helios picks the best `en-US` voice it can find, preferring names that include Natural, Neural, or Google, then any English voice.

You can also force a provider for one visit with `?voice=webspeech` or `?voice=elevenlabs`.

### ElevenLabs

Set the flag and the proxy URL. Do not put an API key in the page.

```js
window.HELIOS_CONFIG = {
  voiceProvider: "elevenlabs",
  elevenLabsProxy: "https://your-proxy.example/v1/tts",
  elevenVoiceId: ""
};
```

The browser `POST`s JSON:

```json
{ "text": "What Helios is saying", "voiceId": "optional-id" }
```

The proxy must stream audio bytes back (`audio/mpeg` is fine). The key stays in the server environment. If the proxy is missing or errors, Helios falls back to the browser voice and says so in the console line.

Example proxy (run this on a server, not in the page):

```js
import express from "express";
const app = express();
app.use(express.json({ limit: "32kb" }));
app.post("/v1/tts", async (req, res) => {
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = req.body.voiceId || process.env.ELEVENLABS_VOICE_ID;
  const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg"
    },
    body: JSON.stringify({
      text: String(req.body.text || "").slice(0, 4000),
      model_id: "eleven_turbo_v2_5"
    })
  });
  res.status(upstream.status);
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
  res.setHeader("Access-Control-Allow-Origin", "https://sovereignenergy.github.io");
  upstream.body.pipeTo(new WritableStream({ write(chunk) { res.write(chunk); }, close() { res.end(); } }));
});
app.listen(8787);
```

Allow the page origin in CORS, including `OPTIONS` if the browser preflights. The page never sees `ELEVENLABS_API_KEY`.

## Integration stubs

In `assets/closer.js`: `askLLM`, `designApi`, `pricingApi`, `creditCheckApi`, `esignApi`. `submitApi` is the provider-submission stub. `approvalApi` in `assets/queue.js` is the advisor endpoint. Credit, e-sign, and submission return `blocked_pending_approval` until the advisor named in `brand.js` has approved that step.
