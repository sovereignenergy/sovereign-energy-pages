# Sovereign closer staging API

Local staging backend for the Sovereign Energy AI closer. It parses utility bills, returns a preliminary non-binding system size and payment-type list, and runs the Eric closer brain behind a compliance filter.

This process is not a customer-facing service. It does not run credit checks, send documents, or call a paid model unless you set that up yourself. The live pages keep working exactly as they do today until someone sets a staging base URL.

## Architecture

```
ai-closer-assets/closer.js
  no apiBase  -> existing scripted demo (no network)
  apiBase set -> POST only to that origin

staging server (127.0.0.1:8787)
  POST /api/parse-bill     heuristic bill parser + pluggable OCR adapter
  POST /api/design         preliminary kW, panels, offset, battery option
  POST /api/pricing        Lease / PPA / Loan / Cash, marked not a quote
  POST /api/closer/chat    Eric brain (mock or OpenAI-compatible) then compliance filter
  POST /api/credit-check   records Binh's approval flag; never pulls credit
  POST /api/esign          records Binh's approval flag; never sends documents
  POST /api/leads          in-memory handoff for this process only
  GET  /api/health
  GET  /                   localhost staging console
```

Bill text is parsed with deterministic rules for SDG&E, PG&E, SCE, and HECO. A PDF text layer or a `SOVEREIGN_BILL_TEXT` payload is read offline. Image OCR and a live LLM are adapters. Tests leave both on the local/mock path, so the suite makes zero paid API calls.

Eric's rules live in two places: the system prompt (`src/compliance/prompt.ts`) and the output filter (`src/compliance/filter.ts`). The filter removes savings promises, tax-credit claims, Sunrun mentions, and any line that says a credit check or e-sign already happened. If the reply mentions a phone call or AI voice, the filter appends the TCPA AI-voice consent notice and the California AI disclosure.

`next` from the model is always null. The scripted page keeps the step order unless a staging page sets `allowLlmRouting`.

## Run locally

```bash
cd staging
npm install
npm run dev
```

Open `http://127.0.0.1:8787`. The page refuses to boot on any other host. Leads stay in this process's memory and are not forwarded to the Google Apps Script endpoint in `config.js`.

To point a local copy of the closer at it, set this before `closer.js` loads and clear the live form endpoint so practice leads are not posted to the sheet:

```html
<script>
  window.LP_CONFIG.ENDPOINT = "";
  window.CLOSER.apiBase = "http://127.0.0.1:8787";
  window.CLOSER.name = "Eric";
</script>
```

`LP_CONFIG.CLOSER_API_BASE` is an equivalent switch. Leave both unset on the published pages. v1, v2, and v3 do not set them.

Optional flags on `window.CLOSER`:

| Flag | Default | Effect |
| --- | --- | --- |
| `apiBase` | empty | Staging origin. Empty keeps the demo. |
| `enableHeco` | false | Adds HECO to the utility choices. |
| `speakOnRoute` | false | Also speak Eric's line at each scripted step. |
| `allowLlmRouting` | false | Let the model change steps. Leave this off. |
| `binhApprovedCredit` | false | Sends Binh's approval flag. The API still does not pull credit. |
| `binhApprovedEsign` | false | Sends Binh's approval flag. The API still does not send documents. |

## Tests

```bash
cd staging
npm test
npm run typecheck
```

The suite covers full and partial anonymized bills for all four utilities, JSON and PDF/image extraction, the compliance filter, sizing and pricing, the gated credit and e-sign endpoints, an offline funnel from parse through lead handoff, and the closer.js gate.

## Environment

Copy `.env.example` to `.env` when you want something other than the defaults. The server reads the process environment. It binds `127.0.0.1:8787` and refuses `NODE_ENV=production` unless `STAGING_ALLOW_PRODUCTION=1`. That override is not a production deployment switch.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address. |
| `PORT` | `8787` | Bind port. |
| `CLOSER_LLM_MODE` | `mock` | `mock` or `openai`. Mock is deterministic and offline. |
| `CLOSER_LLM_API_KEY` | empty | Used only when mode is `openai`. |
| `CLOSER_LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible chat completions base. |
| `CLOSER_LLM_MODEL` | `gpt-4o-mini` | Model name for that endpoint. |
| `CLOSER_OCR_MODE` | `local` | `local` or `llm`. |
| `CLOSER_OCR_ALLOW_NETWORK` | empty | Set to `1` before the LLM OCR adapter may call the network. Local text is always preferred. |
| `STAGING_CORS_ORIGIN` | `*` | Browser origin. Tighten this before exposing the port beyond your machine. |
| `STAGING_ALLOW_PRODUCTION` | empty | Set to `1` only to bypass the production boot refusal. |

Sizing assumptions, all labeled preliminary: 1,550 kWh per kW-year for SDG&E, 1,500 for SCE, 1,450 for PG&E, 1,650 for HECO, shade factors 1.0 / 0.85 / 0.65, a 90% offset target, 400 W panels, and a 20 kW cap. Offset is a sizing target, not savings.

## What this does not do

- It does not change published closer pages unless `apiBase` is set on that page.
- It does not deploy, bind a public host, or forward leads to the live sheet.
- It does not pull credit, collect an SSN, or create an e-sign envelope.
- It does not promise savings, a lower bill, or a tax credit.
