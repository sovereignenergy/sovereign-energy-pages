export interface StagingEnv {
  HOST: string;
  PORT: number;
  NODE_ENV: string;
  CLOSER_LLM_MODE: "mock" | "openai";
  CLOSER_LLM_API_KEY: string;
  CLOSER_LLM_BASE_URL: string;
  CLOSER_LLM_MODEL: string;
  CLOSER_OCR_MODE: "local" | "llm";
  CLOSER_OCR_ALLOW_NETWORK: boolean;
  STAGING_CORS_ORIGIN: string;
  STAGING_ALLOW_PRODUCTION: boolean;
}

export function resolveEnv(source: NodeJS.ProcessEnv = process.env): StagingEnv {
  const mode = (source.CLOSER_LLM_MODE || "mock").toLowerCase();
  const ocr = (source.CLOSER_OCR_MODE || "local").toLowerCase();
  const port = Number(source.PORT || 8787);
  return {
    HOST: source.HOST || "127.0.0.1",
    PORT: Number.isFinite(port) && port > 0 ? port : 8787,
    NODE_ENV: source.NODE_ENV || "development",
    CLOSER_LLM_MODE: mode === "openai" ? "openai" : "mock",
    CLOSER_LLM_API_KEY: source.CLOSER_LLM_API_KEY || "",
    CLOSER_LLM_BASE_URL: source.CLOSER_LLM_BASE_URL || "https://api.openai.com/v1",
    CLOSER_LLM_MODEL: source.CLOSER_LLM_MODEL || "gpt-4o-mini",
    CLOSER_OCR_MODE: ocr === "llm" ? "llm" : "local",
    CLOSER_OCR_ALLOW_NETWORK: source.CLOSER_OCR_ALLOW_NETWORK === "1",
    STAGING_CORS_ORIGIN: source.STAGING_CORS_ORIGIN || "*",
    STAGING_ALLOW_PRODUCTION: source.STAGING_ALLOW_PRODUCTION === "1",
  };
}

/** Staging process gate. Production customer hosting is refused by default. */
export function stagingBootCheck(env: StagingEnv): { ok: true } | { ok: false; reason: string } {
  if (env.NODE_ENV === "production" && !env.STAGING_ALLOW_PRODUCTION) {
    return {
      ok: false,
      reason:
        "Refusing to start. This is a staging server. NODE_ENV=production is blocked unless STAGING_ALLOW_PRODUCTION=1, and that override is not for customer-facing hosting.",
    };
  }
  return { ok: true };
}
