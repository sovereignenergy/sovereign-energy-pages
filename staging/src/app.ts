import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBill, type ParseBillInput } from "./bill/parseBill.js";
import { createOcrAdapter, type OcrAdapter } from "./bill/ocr.js";
import { closerTurn, type CloserInput } from "./closer/eric.js";
import { createLlmProvider, type LlmProvider } from "./closer/provider.js";
import { isCustomerSafe } from "./compliance/filter.js";
import { NON_BINDING_DISCLAIMER, POLICY_VERSION, SAFE_FALLBACK } from "./compliance/notices.js";
import { sizeSystem, type DesignInput } from "./design/sizeSystem.js";
import { resolveEnv, type StagingEnv } from "./env.js";
import { sensitiveIdentifier, stageCreditCheck, stageEsign, type GateInput } from "./gated/actions.js";
import { LeadStore } from "./leads/store.js";
import { priceDesign } from "./pricing/options.js";

export interface AppResponse {
  status: number;
  body: unknown;
  contentType?: string;
}

export interface StagingApp {
  env: StagingEnv;
  llm: LlmProvider;
  ocr: OcrAdapter;
  leads: LeadStore;
  handle(method: string, urlPath: string, body: unknown): Promise<AppResponse>;
}

const MAX_BODY = 8 * 1024 * 1024;
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

function asRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function safeDisclaimer(text: string): string {
  return isCustomerSafe(text) ? text : SAFE_FALLBACK;
}

export function createApp(options?: {
  env?: Partial<StagingEnv>;
  fetchImpl?: typeof fetch;
  llm?: LlmProvider;
  ocr?: OcrAdapter;
  leads?: LeadStore;
}): StagingApp {
  const env = { ...resolveEnv({ ...process.env, NODE_ENV: process.env.NODE_ENV || "test" }), ...options?.env };
  const llm = options?.llm || createLlmProvider(env, options?.fetchImpl);
  const ocr = options?.ocr || createOcrAdapter(env, options?.fetchImpl);
  const leads = options?.leads || new LeadStore();

  return {
    env,
    llm,
    ocr,
    leads,
    async handle(method: string, urlPath: string, body: unknown): Promise<AppResponse> {
      const pathOnly = urlPath.split("?")[0] || "/";
      if (method === "GET" && (pathOnly === "/" || pathOnly === "/index.html")) {
        const html = readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
        return { status: 200, body: html, contentType: "text/html; charset=utf-8" };
      }
      if (method === "GET" && pathOnly === "/api/health") {
        return {
          status: 200,
          body: {
            ok: true,
            service: "sovereign-closer-staging",
            mode: "staging",
            production: false,
            llm: llm.name,
            llm_mode: env.CLOSER_LLM_MODE,
            ocr: ocr.name,
            policy_version: POLICY_VERSION,
          },
        };
      }
      if (method !== "POST" && method !== "GET") return { status: 405, body: { ok: false, error: "method_not_allowed" } };

      if (method === "POST" && pathOnly === "/api/parse-bill") {
        const result = await parseBill((asRecord(body) || {}) as ParseBillInput, ocr, env);
        return { status: 200, body: result };
      }
      if (method === "POST" && pathOnly === "/api/design") {
        const design = sizeSystem((asRecord(body) || {}) as DesignInput);
        design.disclaimer = safeDisclaimer(design.disclaimer);
        return { status: 200, body: design };
      }
      if (method === "POST" && pathOnly === "/api/pricing") {
        const record = asRecord(body);
        const design = record && "design" in record ? (record.design as Partial<ReturnType<typeof sizeSystem>>) : record;
        const priced = priceDesign(design);
        priced.disclaimer = safeDisclaimer(priced.disclaimer || NON_BINDING_DISCLAIMER);
        return { status: 200, body: priced };
      }
      if (method === "POST" && pathOnly === "/api/closer/chat") {
        const turn = await closerTurn((asRecord(body) || {}) as CloserInput, llm);
        return { status: 200, body: turn };
      }
      if (method === "POST" && pathOnly === "/api/credit-check") {
        const record = asRecord(body);
        if (!record) return { status: 400, body: { ok: false, error: "expected_object" } };
        const result = stageCreditCheck(record as GateInput);
        if ("error" in result) return { status: 400, body: { ok: false, error: result.error, ran: false } };
        return { status: 200, body: result };
      }
      if (method === "POST" && pathOnly === "/api/esign") {
        const record = asRecord(body);
        if (!record) return { status: 400, body: { ok: false, error: "expected_object" } };
        const result = stageEsign(record as GateInput);
        if ("error" in result) return { status: 400, body: { ok: false, error: result.error, sent: false } };
        return { status: 200, body: result };
      }
      if (method === "POST" && pathOnly === "/api/leads") {
        const record = asRecord(body);
        if (!record) return { status: 400, body: { ok: false, error: "expected_object" } };
        const sensitive = sensitiveIdentifier(record as GateInput);
        if (sensitive) return { status: 400, body: { ok: false, error: sensitive } };
        const saved = leads.save(record);
        return {
          status: 201,
          body: {
            ok: true,
            id: saved.id,
            received_at: saved.received_at,
            staging: true,
            binding: false,
            credit_check: saved.credit_check,
            esign: saved.esign,
            requires_binh_approval: true,
          },
        };
      }
      if (method === "GET" && pathOnly.startsWith("/api/leads/")) {
        const id = decodeURIComponent(pathOnly.slice("/api/leads/".length));
        const found = leads.get(id);
        if (!found) return { status: 404, body: { ok: false, error: "not_found" } };
        return { status: 200, body: { ok: true, lead: found } };
      }
      return { status: 404, body: { ok: false, error: "not_found" } };
    },
  };
}

export function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("body_too_large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve(undefined);
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("invalid_json"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

export function startServer(app: StagingApp = createApp()): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    const method = req.method || "GET";
    applyHeaders(app, res);
    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
      const result = await app.handle(method, req.url || "/", body);
      const payload = result.contentType?.includes("text/html") ? String(result.body) : JSON.stringify(result.body);
      res.writeHead(result.status, { "Content-Type": result.contentType || "application/json; charset=utf-8" });
      res.end(payload);
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: status === 500 ? "server_error" : (error as Error).message }));
    }
  });
  return server;
}

function applyHeaders(app: StagingApp, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", app.env.STAGING_CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Sovereign-Staging", "true");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "no-store");
}
