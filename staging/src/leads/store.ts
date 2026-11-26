import { randomUUID } from "node:crypto";

export interface LeadRecord {
  id: string;
  received_at: string;
  staging: true;
  binding: false;
  credit_check: "not_run";
  esign: "not_sent";
  requires_binh_approval: true;
  payload: Record<string, unknown>;
}

export class LeadStore {
  private readonly leads = new Map<string, LeadRecord>();

  save(payload: Record<string, unknown>, now = new Date()): LeadRecord {
    const id = randomUUID();
    const record: LeadRecord = {
      id,
      received_at: now.toISOString(),
      staging: true,
      binding: false,
      credit_check: "not_run",
      esign: "not_sent",
      requires_binh_approval: true,
      payload: trimPayload(payload),
    };
    this.leads.set(id, record);
    return record;
  }

  get(id: string): LeadRecord | undefined {
    return this.leads.get(id);
  }
}

function trimPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...payload };
  const file = copy.bill_file;
  if (file && typeof file === "object" && "base64" in file) {
    const base64 = String((file as { base64?: unknown }).base64 || "");
    if (base64.length > 100_000) {
      copy.bill_file = {
        name: (file as { name?: unknown }).name || "",
        type: (file as { type?: unknown }).type || "",
        omitted: true,
        size: base64.length,
      };
    }
  }
  return copy;
}
