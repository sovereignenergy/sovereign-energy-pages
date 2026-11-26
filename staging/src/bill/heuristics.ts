export type UtilityProvider = "SDG&E" | "PG&E" | "SCE" | "HECO" | "unknown";

export interface MonthlyUsage {
  label: string;
  kwh: number;
  bill_amount?: number;
}

export interface HeuristicBill {
  utility_provider: UtilityProvider;
  monthly: MonthlyUsage[];
  annual_kwh_stated: number | null;
  current_period_kwh: number | null;
  current_bill_amount: number | null;
  monthly_average_bill_stated: number | null;
  account_number: string | null;
  meter_number: string | null;
  service_address: string | null;
  rate_schedule: string | null;
  warnings: string[];
}

const MONTH =
  "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

const UTILITY_RULES: Array<{ id: UtilityProvider; pattern: RegExp; note?: string }> = [
  { id: "SDG&E", pattern: /san diego gas(?:\s*(?:&|and)\s*electric)?|\bsdge\b|\bsdg\s*&\s*e\b/i },
  { id: "PG&E", pattern: /pacific gas(?:\s*(?:&|and)\s*electric)?|\bpge\b|\bpg\s*&\s*e\b/i },
  { id: "SCE", pattern: /southern california edison|\bsce\b/i },
  { id: "HECO", pattern: /hawaiian electric|hawaii electric light|maui electric|\bheco\b|\bhelco\b|\bmeco\b/i },
];

export function normalizeUtility(raw?: string | null): UtilityProvider {
  const text = String(raw || "");
  if (!text.trim()) return "unknown";
  let best: UtilityProvider = "unknown";
  for (const rule of UTILITY_RULES) {
    if (rule.pattern.test(text)) best = rule.id;
  }
  return best;
}

function detectUtility(text: string, warnings: string[]): UtilityProvider {
  const scores = new Map<UtilityProvider, number>();
  for (const rule of UTILITY_RULES) {
    const hits = text.match(new RegExp(rule.pattern.source, "gi"));
    if (hits?.length) scores.set(rule.id, hits.length);
  }
  if (scores.size === 0) return "unknown";
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const winner = ranked[0][0];
  if (/maui electric|hawaii electric light|\bhelco\b|\bmeco\b/i.test(text) && winner === "HECO") {
    warnings.push("sister_utility_mapped_to_heco");
  }
  return winner;
}

function parseNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function cleanId(raw: string, min: number, max: number): string | null {
  const clipped = raw.split(/\b(meter|rate|service|billing|amount|electric|usage|total)\b/i)[0].trim();
  const id = clipped.replace(/[^A-Za-z0-9-]/g, "");
  if (!/\d/.test(id) || id.length < min || id.length > max) return null;
  return id;
}

function cleanRate(raw: string): string | null {
  const value = raw.split(/[|]/)[0].trim();
  const known = value.match(
    /\b(TOU-DR1|TOU-DR2|EV-TOU-5|EV-TOU-2|TOU-DR|DR-SES|E-TOU-C|E-TOU-D|E-TOU-B|E-ELEC|EV2A|TOU-D-4-9PM|TOU-D-5-8PM|TOU-D-PRIME|TOU-D-A|TOU-D-B|TOU-RI|EV-R|EV-J|DR)\b/i,
  );
  if (known) return known[1].toUpperCase();
  const token = value.split(/\s+/)[0]?.replace(/[^A-Za-z0-9-]/g, "") || "";
  if (/^[A-Z]$/i.test(token)) return token.toUpperCase();
  if (/^[A-Z0-9][A-Z0-9-]{1,24}$/i.test(token)) return token.toUpperCase();
  return null;
}

function lineValue(lines: string[], label: RegExp): string | null {
  for (const line of lines) {
    const match = line.trim().match(label);
    if (match) return match[1] ?? "";
  }
  return null;
}

function extractAddress(lines: string[]): string | null {
  const index = lines.findIndex((line) => /service\s+(address|for)\b/i.test(line));
  if (index < 0) return null;
  const first = lines[index];
  const inline = first.replace(/^.*?service\s+(?:address|for)\s*[:\-]?\s*/i, "").trim();
  const parts: string[] = [];
  if (inline && !/^(rate|meter|account|billing)\b/i.test(inline)) parts.push(inline);
  if (!inline) {
    for (let i = index + 1; i < Math.min(lines.length, index + 4); i++) {
      const line = lines[i].trim();
      if (!line) {
        if (parts.length) break;
        continue;
      }
      if (/^(account|acct|meter|rate|schedule|billing|total|amount|electric|energy|usage|average)\b/i.test(line)) break;
      parts.push(line);
    }
  }
  const address = parts.join(", ").replace(/\s+/g, " ").trim();
  if (address.length < 8) return null;
  return address;
}

function moneyAfter(label: RegExp, text: string): number | null {
  const match = text.match(label);
  if (!match) return null;
  return parseNumber(match[1]);
}

function extractMonthly(lines: string[]): MonthlyUsage[] {
  const monthYear = new RegExp(`^${MONTH}\\.?\\s+(20\\d{2})\\s+([0-9]{1,5}(?:\\.[0-9]+)?)\\b`, "i");
  const yearMonth = /^(20\d{2})[-/](0?[1-9]|1[0-2])\s+([0-9]{1,5}(?:\.[0-9]+)?)\b/;
  const monthSlashYear = /^(0?[1-9]|1[0-2])[/-](20\d{2})\s+([0-9]{1,5}(?:\.[0-9]+)?)\b/;
  const monthOnly = new RegExp(`^${MONTH}\\.?\\s+([0-9]{1,5}(?:\\.[0-9]+)?)\\b`, "i");
  const bareMonthYear = new RegExp(`^${MONTH}\\.?\\s+20\\d{2}\\s*$`, "i");
  const rows: MonthlyUsage[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || bareMonthYear.test(line)) continue;
    let label = "";
    let kwh: number | null = null;
    const a = line.match(monthYear);
    const b = line.match(yearMonth);
    const c = line.match(monthSlashYear);
    const d = !a && line.match(monthOnly);
    if (a) {
      label = `${a[1]} ${a[2]}`;
      kwh = parseNumber(a[3]);
    } else if (b) {
      label = `${b[1]}-${b[2].padStart(2, "0")}`;
      kwh = parseNumber(b[3]);
    } else if (c) {
      label = `${c[2]}-${c[1].padStart(2, "0")}`;
      kwh = parseNumber(c[3]);
    } else if (d) {
      label = d[1];
      kwh = parseNumber(d[2]);
      if (kwh !== null && kwh >= 1990 && kwh <= 2100) continue;
    }
    if (kwh === null || kwh <= 0 || kwh > 8000) continue;
    const dollars = line.match(/\$\s*([0-9,]+\.\d{2})/);
    const row: MonthlyUsage = { label, kwh };
    if (dollars) {
      const amount = parseNumber(dollars[1]);
      if (amount !== null) row.bill_amount = amount;
    }
    rows.push(row);
  }
  return rows.length > 12 ? rows.slice(rows.length - 12) : rows;
}

export function parseBillText(text: string): HeuristicBill {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/);
  const utility = detectUtility(text, warnings);

  const accountRaw = lineValue(
    lines,
    /^(?:account(?:\s+(?:number|no\.?|#))?|acct(?:\s*#)?|service account|customer account)\s*[:#-]?\s*(.*)$/i,
  );
  const meterRaw = lineValue(lines, /^(?:meter(?:\s+(?:number|no\.?|id|#))?)\s*[:#-]?\s*(.*)$/i);
  const rateRaw = lineValue(lines, /^(?:rate(?:\s+(?:schedule|plan))?|schedule)\s*[:#-]?\s*(.*)$/i);

  const currentBill =
    moneyAfter(/(?:total amount due|amount due)\s*[:\-]?\s*\$?\s*([0-9,]+\.\d{2})/i, text) ??
    moneyAfter(/(?:total electric charges|current electric charges|electric charges)\s*[:\-]?\s*\$?\s*([0-9,]+\.\d{2})/i, text);

  const averageBill = moneyAfter(/average(?:\s+monthly)?\s+bill\s*[:\-]?\s*\$?\s*([0-9,]+\.\d{2})/i, text);

  const annualMatch = text.match(
    /(?:total\s+kwh(?:\s*\(12\s*months\))?|annual(?:\s+(?:usage|kwh))?|12[-\s]months?\s+(?:total\s+)?(?:usage|kwh))\s*[:\-]?\s*([0-9,]{3,8})/i,
  );
  const periodMatch = text.match(
    /(?:this period(?:'s)? usage|total usage|kwh usage|total kwh this period)\s*[:\-]?\s*([0-9,]{2,6})/i,
  );

  return {
    utility_provider: utility,
    monthly: extractMonthly(lines),
    annual_kwh_stated: annualMatch ? parseNumber(annualMatch[1]) : null,
    current_period_kwh: periodMatch ? parseNumber(periodMatch[1]) : null,
    current_bill_amount: currentBill,
    monthly_average_bill_stated: averageBill,
    account_number: accountRaw ? cleanId(accountRaw, 6, 20) : null,
    meter_number: meterRaw ? cleanId(meterRaw, 5, 20) : null,
    service_address: extractAddress(lines),
    rate_schedule: rateRaw ? cleanRate(rateRaw) : null,
    warnings,
  };
}
