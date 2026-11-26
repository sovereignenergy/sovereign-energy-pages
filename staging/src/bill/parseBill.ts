import { createOcrAdapter, LocalOcrAdapter, type OcrAdapter, type OcrEnv } from "./ocr.js";
import { normalizeUtility, parseBillText, type MonthlyUsage, type UtilityProvider } from "./heuristics.js";

export interface ParsedBill {
  utility_provider: UtilityProvider;
  monthly_kwh: number[];
  monthly_labels: string[];
  annual_kwh: number | null;
  monthly_average_kwh: number | null;
  monthly_average_bill: number | null;
  current_bill_amount: number | null;
  current_period_kwh: number | null;
  account_number: string | null;
  meter_number: string | null;
  service_address: string | null;
  rate_schedule: string | null;
  confidence: number;
  warnings: string[];
  source: "json" | "text" | "document" | "mixed" | "empty";
}

export interface ParseBillInput {
  text?: string;
  json?: unknown;
  document?: { filename?: string; mime?: string; base64?: string };
}

export interface ParseBillResult {
  ok: boolean;
  bill: ParsedBill;
  extractor: string;
}

export interface JsonBill {
  utility_provider?: string;
  utility?: string;
  monthly_kwh?: number[];
  monthly_labels?: string[];
  annual_kwh?: number;
  monthly_average_kwh?: number;
  monthly_average_bill?: number;
  current_bill_amount?: number;
  current_period_kwh?: number;
  account_number?: string;
  meter_number?: string;
  service_address?: string;
  rate_schedule?: string;
  monthly_bill_amounts?: number[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyBill(warnings: string[], source: ParsedBill["source"]): ParsedBill {
  return {
    utility_provider: "unknown",
    monthly_kwh: [],
    monthly_labels: [],
    annual_kwh: null,
    monthly_average_kwh: null,
    monthly_average_bill: null,
    current_bill_amount: null,
    current_period_kwh: null,
    account_number: null,
    meter_number: null,
    service_address: null,
    rate_schedule: null,
    confidence: 0,
    warnings,
    source,
  };
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(asNumber).filter((n): n is number => n !== null && n > 0 && n <= 8000);
}

function readJson(value: unknown): JsonBill | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonBill;
}

function score(bill: ParsedBill, fromJson: boolean): number {
  let value = 0.12;
  if (bill.utility_provider !== "unknown") value += 0.2;
  if (bill.account_number) value += 0.12;
  if (bill.meter_number) value += 0.08;
  if (bill.service_address) value += 0.1;
  if (bill.rate_schedule) value += 0.1;
  if (bill.monthly_kwh.length === 12) value += 0.15;
  else if (bill.monthly_kwh.length > 0) value += 0.05;
  if (bill.annual_kwh) value += 0.05;
  if (bill.current_bill_amount || bill.monthly_average_bill) value += 0.05;
  if (fromJson && bill.utility_provider !== "unknown" && (bill.annual_kwh || bill.monthly_kwh.length > 0)) value += 0.08;
  return Math.min(0.99, Math.round(value * 100) / 100);
}

function hasSignal(bill: ParsedBill): boolean {
  return (
    bill.utility_provider !== "unknown" ||
    bill.monthly_kwh.length > 0 ||
    bill.annual_kwh !== null ||
    bill.account_number !== null ||
    bill.current_bill_amount !== null ||
    bill.current_period_kwh !== null
  );
}

function applyDerived(bill: ParsedBill, monthlyBills: number[], statedAnnual: number | null, statedAverageBill: number | null): void {
  if (bill.monthly_kwh.length > 12) {
    bill.monthly_kwh = bill.monthly_kwh.slice(-12);
    bill.monthly_labels = bill.monthly_labels.slice(-12);
  }
  if (bill.monthly_kwh.length === 12) {
    const sum = round1(bill.monthly_kwh.reduce((total, n) => total + n, 0));
    if (statedAnnual !== null && Math.abs(statedAnnual - sum) / sum > 0.05) bill.warnings.push("annual_mismatch");
    bill.annual_kwh = sum;
    bill.monthly_average_kwh = round1(sum / 12);
  } else if (bill.monthly_kwh.length > 0) {
    bill.warnings.push("partial_usage_history");
    bill.monthly_average_kwh = bill.monthly_average_kwh ?? round1(bill.monthly_kwh.reduce((t, n) => t + n, 0) / bill.monthly_kwh.length);
    if (statedAnnual !== null) bill.annual_kwh = statedAnnual;
  } else if (statedAnnual !== null) {
    bill.annual_kwh = statedAnnual;
    bill.monthly_average_kwh = bill.monthly_average_kwh ?? round1(statedAnnual / 12);
  } else if (bill.current_period_kwh) {
    bill.monthly_average_kwh = bill.monthly_average_kwh ?? bill.current_period_kwh;
    bill.warnings.push("average_from_single_period");
  }

  if (monthlyBills.length === 12) {
    bill.monthly_average_bill = round2(monthlyBills.reduce((t, n) => t + n, 0) / 12);
  } else if (statedAverageBill !== null) {
    bill.monthly_average_bill = round2(statedAverageBill);
  } else if (bill.current_bill_amount !== null) {
    bill.monthly_average_bill = round2(bill.current_bill_amount);
    bill.warnings.push("average_from_single_bill");
  }

  if (bill.utility_provider === "unknown") bill.warnings.push("unknown_utility");
  if (!bill.account_number) bill.warnings.push("missing_account_number");
  if (!bill.meter_number) bill.warnings.push("missing_meter_number");
  if (!bill.service_address) bill.warnings.push("missing_service_address");
  if (!bill.rate_schedule) bill.warnings.push("missing_rate_schedule");
  if (!bill.annual_kwh && bill.monthly_kwh.length === 0 && !bill.current_period_kwh) bill.warnings.push("missing_usage");
  if (!bill.current_bill_amount && bill.monthly_average_bill === null) bill.warnings.push("missing_bill_amount");
}

function fromHeuristic(text: string): { bill: ParsedBill; statedAnnual: number | null; statedAverage: number | null; monthlyBills: number[] } {
  const parsed = parseBillText(text);
  const monthlyBills = parsed.monthly.map((row) => row.bill_amount).filter((n): n is number => typeof n === "number");
  const bill = emptyBill([...parsed.warnings], "text");
  bill.utility_provider = parsed.utility_provider;
  bill.monthly_kwh = parsed.monthly.map((row: MonthlyUsage) => row.kwh);
  bill.monthly_labels = parsed.monthly.map((row) => row.label);
  bill.current_period_kwh = parsed.current_period_kwh;
  bill.current_bill_amount = parsed.current_bill_amount;
  bill.account_number = parsed.account_number;
  bill.meter_number = parsed.meter_number;
  bill.service_address = parsed.service_address;
  bill.rate_schedule = parsed.rate_schedule;
  return { bill, statedAnnual: parsed.annual_kwh_stated, statedAverage: parsed.monthly_average_bill_stated, monthlyBills };
}

function overlayJson(bill: ParsedBill, json: JsonBill): { statedAnnual: number | null; statedAverage: number | null; monthlyBills: number[] } {
  const utility = normalizeUtility(json.utility_provider || json.utility);
  if (utility !== "unknown") bill.utility_provider = utility;
  const months = asNumberList(json.monthly_kwh);
  if (months.length) {
    bill.monthly_kwh = months;
    bill.monthly_labels = Array.isArray(json.monthly_labels) ? json.monthly_labels.map(String).slice(0, months.length) : months.map((_, i) => `m${i + 1}`);
  }
  const annual = asNumber(json.annual_kwh);
  const averageKwh = asNumber(json.monthly_average_kwh);
  const averageBill = asNumber(json.monthly_average_bill);
  const currentBill = asNumber(json.current_bill_amount);
  const currentKwh = asNumber(json.current_period_kwh);
  if (averageKwh !== null) bill.monthly_average_kwh = averageKwh;
  if (currentBill !== null) bill.current_bill_amount = currentBill;
  if (currentKwh !== null) bill.current_period_kwh = currentKwh;
  if (typeof json.account_number === "string" && json.account_number.trim()) bill.account_number = json.account_number.trim();
  if (typeof json.meter_number === "string" && json.meter_number.trim()) bill.meter_number = json.meter_number.trim();
  if (typeof json.service_address === "string" && json.service_address.trim()) bill.service_address = json.service_address.trim();
  if (typeof json.rate_schedule === "string" && json.rate_schedule.trim()) bill.rate_schedule = json.rate_schedule.trim();
  return {
    statedAnnual: annual,
    statedAverage: averageBill,
    monthlyBills: asNumberList(json.monthly_bill_amounts),
  };
}

export async function parseBill(input: ParseBillInput, ocr?: OcrAdapter, env?: OcrEnv): Promise<ParseBillResult> {
  const adapter = ocr || (env ? createOcrAdapter(env) : input.document?.base64 ? new LocalOcrAdapter() : undefined);
  let extractor = "heuristic";
  const textParts: string[] = [];
  const warnings: string[] = [];
  let sawDocument = false;

  if (input.text && input.text.trim()) textParts.push(input.text);
  if (input.document?.base64) {
    sawDocument = true;
    if (!adapter) {
      warnings.push("document_present_without_ocr_adapter");
    } else {
      const extracted = await adapter.extract(input.document);
      extractor = extracted.extractor;
      warnings.push(...extracted.warnings);
      if (extracted.text.trim()) textParts.push(extracted.text);
    }
  }

  const json = readJson(input.json);
  const text = textParts.join("\n").trim();
  if (!text && !json) {
    const bill = emptyBill(warnings.concat(["empty_input"]), "empty");
    return { ok: false, bill, extractor };
  }

  let statedAnnual: number | null = null;
  let statedAverage: number | null = null;
  let monthlyBills: number[] = [];
  let bill: ParsedBill;
  if (text) {
    const heuristic = fromHeuristic(text);
    bill = heuristic.bill;
    statedAnnual = heuristic.statedAnnual;
    statedAverage = heuristic.statedAverage;
    monthlyBills = heuristic.monthlyBills;
    bill.warnings.push(...warnings);
  } else {
    bill = emptyBill(warnings, "json");
  }

  if (json) {
    const over = overlayJson(bill, json);
    if (over.statedAnnual !== null) statedAnnual = over.statedAnnual;
    if (over.statedAverage !== null) statedAverage = over.statedAverage;
    if (over.monthlyBills.length) monthlyBills = over.monthlyBills;
    bill.source = text ? "mixed" : "json";
  } else if (sawDocument) {
    bill.source = "document";
  } else {
    bill.source = "text";
  }

  applyDerived(bill, monthlyBills, statedAnnual, statedAverage);
  bill.warnings = [...new Set(bill.warnings)];
  bill.confidence = hasSignal(bill) ? score(bill, Boolean(json)) : 0;
  if (bill.confidence < 0.45 && hasSignal(bill)) bill.warnings.push("low_confidence");
  return { ok: hasSignal(bill), bill, extractor };
}
