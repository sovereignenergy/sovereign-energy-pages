export interface DocumentInput {
  filename?: string;
  mime?: string;
  base64?: string;
}

export interface OcrExtraction {
  text: string;
  warnings: string[];
  extractor: string;
}

/** Pluggable document reader. Implementations must not be required for offline tests. */
export interface OcrAdapter {
  readonly name: string;
  extract(input: DocumentInput): Promise<OcrExtraction>;
}

const EMBEDDED_MARKER = "SOVEREIGN_BILL_TEXT";

export function decodeBase64(base64: string): Buffer {
  const cleaned = base64.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
  return Buffer.from(cleaned, "base64");
}

function decodePdfLiteral(token: string): string {
  const inner = token.replace(/\)\s*Tj\s*$/i, "").replace(/^\(/, "");
  return inner.replace(/\\([()\\])/g, "$1").replace(/\\n/g, "\n").trim();
}

/** Offline extractor: plain text, a marked payload, or PDF text-showing operators. */
export function extractLocalText(bytes: Buffer, mime?: string): { text: string; warnings: string[] } {
  const raw = bytes.toString("utf8");
  const markerAt = raw.indexOf(EMBEDDED_MARKER);
  if (markerAt >= 0) {
    const text = raw.slice(markerAt + EMBEDDED_MARKER.length).replace(/^\s*\n?/, "");
    return { text, warnings: ["extracted_embedded_bill_text"] };
  }

  const isPdf = (mime || "").includes("pdf") || raw.startsWith("%PDF");
  if (isPdf) {
    const parts = [...raw.matchAll(/\((?:\\[()\\]|[^)])*\)\s*Tj/g)].map((match) => decodePdfLiteral(match[0]));
    const text = parts.filter(Boolean).join("\n");
    if (text.trim()) return { text, warnings: ["pdf_text_operators"] };
    return { text: "", warnings: ["pdf_no_text_layer"] };
  }

  if ((mime || "").startsWith("image/")) {
    return { text: "", warnings: ["image_ocr_unavailable_offline"] };
  }

  const printable = raw.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
  if (printable.trim().length >= 20 && printable.length / Math.max(raw.length, 1) > 0.8) {
    return { text: raw, warnings: ["decoded_text_document"] };
  }
  return { text: "", warnings: ["unreadable_document"] };
}

export class LocalOcrAdapter implements OcrAdapter {
  readonly name = "local";
  constructor(private readonly extraWarning?: string) {}

  async extract(input: DocumentInput): Promise<OcrExtraction> {
    if (!input.base64) return { text: "", warnings: ["missing_document_bytes"], extractor: this.name };
    const warnings = this.extraWarning ? [this.extraWarning] : [];
    try {
      const found = extractLocalText(decodeBase64(input.base64), input.mime);
      return { text: found.text, warnings: warnings.concat(found.warnings), extractor: this.name };
    } catch {
      return { text: "", warnings: warnings.concat(["document_decode_failed"]), extractor: this.name };
    }
  }
}

export interface OcrEnv {
  CLOSER_OCR_MODE: "local" | "llm";
  CLOSER_OCR_ALLOW_NETWORK: boolean;
  CLOSER_LLM_API_KEY: string;
  CLOSER_LLM_BASE_URL: string;
  CLOSER_LLM_MODEL: string;
}

/**
 * LLM OCR is opt-in and still prefers local text.
 * Network transcription runs only when CLOSER_OCR_ALLOW_NETWORK=1 and a key is set.
 */
export class LlmOcrAdapter implements OcrAdapter {
  readonly name = "llm";
  constructor(
    private readonly env: OcrEnv,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async extract(input: DocumentInput): Promise<OcrExtraction> {
    const local = await new LocalOcrAdapter().extract(input);
    if (local.text.trim().length >= 40) {
      return {
        text: local.text,
        warnings: local.warnings.concat(["llm_ocr_skipped_local_text_present"]),
        extractor: this.name,
      };
    }
    if (!this.env.CLOSER_OCR_ALLOW_NETWORK || !this.env.CLOSER_LLM_API_KEY) {
      return {
        text: local.text,
        warnings: local.warnings.concat(["llm_ocr_network_disabled"]),
        extractor: this.name,
      };
    }
    const base = this.env.CLOSER_LLM_BASE_URL.replace(/\/$/, "");
    const response = await this.fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.env.CLOSER_LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.env.CLOSER_LLM_MODEL,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Transcribe the utility bill into plain text. Do not add savings claims, tax advice, or installer brand names. Return only the transcription.",
          },
          {
            role: "user",
            content: `Transcribe this ${input.mime || "document"} named ${input.filename || "bill"}. Existing text:\n${local.text || "(none)"}`,
          },
        ],
      }),
    });
    if (!response.ok) {
      return { text: local.text, warnings: local.warnings.concat([`llm_ocr_http_${response.status}`]), extractor: this.name };
    }
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content?.trim() || local.text;
    return { text, warnings: local.warnings.concat(["llm_ocr_used"]), extractor: this.name };
  }
}

export function createOcrAdapter(env: OcrEnv, fetchImpl?: typeof fetch): OcrAdapter {
  if (env.CLOSER_OCR_MODE === "llm") {
    if (!env.CLOSER_LLM_API_KEY) return new LocalOcrAdapter("llm_ocr_requested_without_api_key_using_local");
    return new LlmOcrAdapter(env, fetchImpl);
  }
  return new LocalOcrAdapter();
}
