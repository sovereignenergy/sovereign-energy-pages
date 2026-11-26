import { ERIC_SYSTEM_PROMPT } from "../compliance/prompt.js";
import type { StagingEnv } from "../env.js";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: ChatMessage[];
}

export interface LlmProvider {
  readonly name: string;
  complete(request: LlmRequest): Promise<string>;
}

export class MockEricProvider implements LlmProvider {
  readonly name = "mock";

  async complete(request: LlmRequest): Promise<string> {
    const last = [...request.messages].reverse().find((message) => message.role === "user")?.content || "";
    if (last.includes("[probe:unsafe]")) {
      return "You will save $180 a month. Sunrun guarantees the 30% federal tax credit. Your credit is approved and the contract was sent. I can call you tonight to walk through it.";
    }
    const name = readDisplayName(last);
    const state = readState(last);
    const usage = readUsage(last);
    const intro = `I'm ${name}, an AI assistant working with Binh Phan, not a human.`;
    if (state === "analyze") {
      const fact = usage ? ` The usage figure I can see is about ${usage} kWh.` : "";
      return `${intro}${fact} I can describe the numbers in front of me. I can't promise savings or a lower bill, and I don't give tax advice. Binh verifies the bill before any design is final. This is not a binding offer.`;
    }
    return `${intro} I can help you get ready for a design conversation with Binh. I can't promise savings or a lower bill, and I don't give tax advice. Nothing here is a quote or a contract.`;
  }
}

function readDisplayName(text: string): string {
  const match = text.match(/display_name:\s*([A-Za-z][A-Za-z .'-]{0,40})/);
  const name = match?.[1]?.trim();
  if (!name) return "Eric";
  if (/sun[\s-]*run/i.test(name)) return "Eric";
  return name;
}

function readState(text: string): string {
  return text.match(/state:\s*([a-z0-9_-]+)/i)?.[1] || "";
}

function readUsage(text: string): string {
  return text.match(/current_period_kwh:\s*([0-9.]+)/)?.[1] || text.match(/monthly_average_kwh:\s*([0-9.]+)/)?.[1] || "";
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = "openai";
  constructor(
    private readonly env: StagingEnv,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async complete(request: LlmRequest): Promise<string> {
    const base = this.env.CLOSER_LLM_BASE_URL.replace(/\/$/, "");
    const response = await this.fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.env.CLOSER_LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.env.CLOSER_LLM_MODEL,
        temperature: 0.2,
        messages: [{ role: "system", content: request.system }, ...request.messages],
      }),
    });
    if (!response.ok) throw new Error(`llm_http_${response.status}`);
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("llm_empty");
    return text;
  }
}

export function createLlmProvider(env: StagingEnv, fetchImpl?: typeof fetch): LlmProvider {
  if (env.CLOSER_LLM_MODE === "openai" && env.CLOSER_LLM_API_KEY) {
    return new OpenAiCompatibleProvider(env, fetchImpl);
  }
  return new MockEricProvider();
}

export function systemPrompt(): string {
  return ERIC_SYSTEM_PROMPT;
}
