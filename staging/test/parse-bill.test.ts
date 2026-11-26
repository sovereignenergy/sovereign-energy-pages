import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeUtility } from "../src/bill/heuristics.js";
import { extractLocalText } from "../src/bill/ocr.js";
import { parseBill, type ParsedBill } from "../src/bill/parseBill.js";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/bills");

function read(name: string): string {
  return readFileSync(path.join(fixtures, name), "utf8");
}

async function billFrom(text: string): Promise<ParsedBill> {
  const result = await parseBill({ text });
  assert.equal(result.ok, true);
  return result.bill;
}

describe("utility normalization", () => {
  it("maps the four supported providers", () => {
    assert.equal(normalizeUtility("SDG&E"), "SDG&E");
    assert.equal(normalizeUtility("San Diego Gas & Electric"), "SDG&E");
    assert.equal(normalizeUtility("PG&E"), "PG&E");
    assert.equal(normalizeUtility("Pacific Gas and Electric"), "PG&E");
    assert.equal(normalizeUtility("SCE"), "SCE");
    assert.equal(normalizeUtility("Southern California Edison"), "SCE");
    assert.equal(normalizeUtility("HECO"), "HECO");
    assert.equal(normalizeUtility("Hawaiian Electric"), "HECO");
    assert.equal(normalizeUtility(""), "unknown");
    assert.equal(normalizeUtility("City Water"), "unknown");
  });
});

describe("full bills", () => {
  it("parses an SDG&E bill", async () => {
    const bill = await billFrom(read("sdge-full.txt"));
    assert.equal(bill.utility_provider, "SDG&E");
    assert.equal(bill.account_number, "8600221109");
    assert.equal(bill.meter_number, "100234567");
    assert.match(bill.service_address || "", /1420 ANONYMOUS AVE/);
    assert.equal(bill.rate_schedule, "TOU-DR1");
    assert.equal(bill.monthly_kwh.length, 12);
    assert.equal(bill.annual_kwh, 6905);
    assert.equal(bill.monthly_average_kwh, 575.4);
    assert.equal(bill.current_period_kwh, 580);
    assert.equal(bill.current_bill_amount, 248.16);
    assert.equal(bill.monthly_average_bill, 248.16);
    assert.ok(bill.warnings.includes("average_from_single_bill"));
    assert.ok(bill.confidence >= 0.9);
    assert.equal(bill.warnings.includes("annual_mismatch"), false);
  });

  it("parses a PG&E bill with a wrapped service address", async () => {
    const bill = await billFrom(read("pge-full.txt"));
    assert.equal(bill.utility_provider, "PG&E");
    assert.equal(bill.account_number, "1234567890-1");
    assert.equal(bill.meter_number, "1012345678");
    assert.match(bill.service_address || "", /55 EXAMPLE CT/);
    assert.match(bill.service_address || "", /95112/);
    assert.equal(bill.rate_schedule, "E-TOU-C");
    assert.equal(bill.monthly_kwh.length, 12);
    assert.equal(bill.annual_kwh, 9072);
    assert.equal(bill.monthly_average_kwh, 756);
    assert.equal(bill.current_period_kwh, 842);
    assert.equal(bill.current_bill_amount, 312.44);
    assert.equal(bill.monthly_average_bill, 240);
    assert.equal(bill.warnings.includes("average_from_single_bill"), false);
  });

  it("parses an SCE bill", async () => {
    const bill = await billFrom(read("sce-full.txt"));
    assert.equal(bill.utility_provider, "SCE");
    assert.equal(bill.account_number, "3-000-8841-22");
    assert.equal(bill.meter_number, "35912345");
    assert.match(bill.service_address || "", /900 HIDDEN LN/);
    assert.equal(bill.rate_schedule, "TOU-D-4-9PM");
    assert.equal(bill.annual_kwh, 6922);
    assert.equal(bill.monthly_average_kwh, 576.8);
    assert.equal(bill.current_period_kwh, 552);
    assert.equal(bill.current_bill_amount, 276.09);
  });

  it("parses a HECO bill", async () => {
    const bill = await billFrom(read("heco-full.txt"));
    assert.equal(bill.utility_provider, "HECO");
    assert.equal(bill.account_number, "345678901234");
    assert.equal(bill.meter_number, "H8812345");
    assert.match(bill.service_address || "", /1600 ALOHA ST/);
    assert.equal(bill.rate_schedule, "R");
    assert.equal(bill.annual_kwh, 6955);
    assert.equal(bill.monthly_average_kwh, 579.6);
    assert.equal(bill.current_period_kwh, 615);
    assert.equal(bill.current_bill_amount, 214.77);
  });

  it("maps Maui Electric onto the HECO rules and says so", async () => {
    const bill = await billFrom(read("heco-maui.txt"));
    assert.equal(bill.utility_provider, "HECO");
    assert.ok(bill.warnings.includes("sister_utility_mapped_to_heco"));
    assert.equal(bill.current_period_kwh, 430);
  });
});

describe("partial bills and missing fields", () => {
  it("keeps an SDG&E bill that has no meter and no 12-month chart", async () => {
    const bill = await billFrom(read("sdge-partial.txt"));
    assert.equal(bill.utility_provider, "SDG&E");
    assert.equal(bill.account_number, "8600998877");
    assert.equal(bill.meter_number, null);
    assert.equal(bill.rate_schedule, "DR");
    assert.equal(bill.annual_kwh, null);
    assert.equal(bill.monthly_kwh.length, 0);
    assert.equal(bill.current_period_kwh, 505);
    assert.equal(bill.monthly_average_kwh, 505);
    assert.equal(bill.current_bill_amount, 190.22);
    assert.ok(bill.warnings.includes("missing_meter_number"));
    assert.ok(bill.warnings.includes("average_from_single_period"));
    assert.equal(bill.warnings.includes("missing_usage"), false);
  });

  it("does not annualize a six-month PG&E history", async () => {
    const bill = await billFrom(read("pge-partial.txt"));
    assert.equal(bill.utility_provider, "PG&E");
    assert.equal(bill.monthly_kwh.length, 6);
    assert.equal(bill.annual_kwh, null);
    assert.equal(bill.monthly_average_kwh, 425);
    assert.equal(bill.service_address, null);
    assert.equal(bill.rate_schedule, "E-TOU-D");
    assert.ok(bill.warnings.includes("partial_usage_history"));
    assert.ok(bill.warnings.includes("missing_service_address"));
  });

  it("flags an SCE bill with no account number", async () => {
    const bill = await billFrom(read("sce-partial.txt"));
    assert.equal(bill.utility_provider, "SCE");
    assert.equal(bill.account_number, null);
    assert.equal(bill.meter_number, "35900001");
    assert.equal(bill.rate_schedule, "TOU-D-PRIME");
    assert.equal(bill.current_period_kwh, 210);
    assert.ok(bill.warnings.includes("missing_account_number"));
  });

  it("flags a HECO bill that is only an account and an amount", async () => {
    const bill = await billFrom(read("heco-partial.txt"));
    assert.equal(bill.utility_provider, "HECO");
    assert.equal(bill.account_number, "111122223333");
    assert.equal(bill.meter_number, null);
    assert.equal(bill.rate_schedule, null);
    assert.equal(bill.annual_kwh, null);
    assert.equal(bill.current_bill_amount, 99.5);
    assert.ok(bill.warnings.includes("missing_meter_number"));
    assert.ok(bill.warnings.includes("missing_rate_schedule"));
    assert.ok(bill.warnings.includes("missing_usage"));
  });

  it("prefers the 12 monthly readings when the printed annual total disagrees", async () => {
    const bill = await billFrom(read("sdge-mismatch.txt"));
    assert.equal(bill.annual_kwh, 6905);
    assert.ok(bill.warnings.includes("annual_mismatch"));
  });

  it("returns a low-confidence result for an unknown bill", async () => {
    const result = await parseBill({ text: read("unknown.txt") });
    assert.equal(result.ok, true);
    assert.equal(result.bill.utility_provider, "unknown");
    assert.equal(result.bill.account_number, "000111");
    assert.ok(result.bill.warnings.includes("unknown_utility"));
    assert.ok(result.bill.warnings.includes("low_confidence"));
    assert.ok(result.bill.confidence < 0.45);
  });

  it("rejects an empty payload", async () => {
    const result = await parseBill({ text: "   \n" });
    assert.equal(result.ok, false);
    assert.ok(result.bill.warnings.includes("empty_input"));
    assert.equal(result.bill.confidence, 0);
  });
});

describe("json and document adapters", () => {
  it("reads a structured JSON bill without using the regex path", async () => {
    const json = JSON.parse(read("sdge-full.json"));
    const result = await parseBill({ json });
    assert.equal(result.ok, true);
    assert.equal(result.bill.source, "json");
    assert.equal(result.bill.utility_provider, "SDG&E");
    assert.equal(result.bill.annual_kwh, 6000);
    assert.equal(result.bill.monthly_average_kwh, 500);
    assert.equal(result.bill.monthly_average_bill, 200);
    assert.equal(result.bill.account_number, "8600123400");
    assert.equal(result.bill.rate_schedule, "EV-TOU-5");
    assert.equal(result.bill.warnings.includes("average_from_single_bill"), false);
  });

  it("accepts a partial JSON object", async () => {
    const result = await parseBill({ json: { utility: "PG&E", current_period_kwh: 100 } });
    assert.equal(result.ok, true);
    assert.equal(result.bill.utility_provider, "PG&E");
    assert.equal(result.bill.monthly_average_kwh, 100);
    assert.equal(result.bill.annual_kwh, null);
    assert.ok(result.bill.warnings.includes("missing_account_number"));
    assert.ok(result.bill.warnings.includes("average_from_single_period"));
  });

  it("lets JSON fill a field the text missed", async () => {
    const result = await parseBill({
      text: read("sce-partial.txt"),
      json: { account_number: "3-000-0000-01" },
    });
    assert.equal(result.bill.source, "mixed");
    assert.equal(result.bill.utility_provider, "SCE");
    assert.equal(result.bill.account_number, "3-000-0000-01");
  });

  it("averages monthly dollar amounts that sit on the usage rows", async () => {
    const lines = [
      "SDG&E",
      "Account Number: 8600555666",
      "Meter Number: 12345678",
      "Service Address: 5 COST ST, SAN DIEGO CA 92126",
      "Rate Schedule: TOU-DR2",
    ];
    for (let month = 1; month <= 12; month++) lines.push(`M${month} 2025 is not used`);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    for (const month of months) lines.push(`${month} 2025  400  $100.00`);
    const bill = await billFrom(lines.join("\n"));
    assert.equal(bill.monthly_kwh.length, 12);
    assert.equal(bill.annual_kwh, 4800);
    assert.equal(bill.monthly_average_bill, 100);
    assert.equal(bill.warnings.includes("average_from_single_bill"), false);
  });

  it("extracts a text-layer PDF offline", async () => {
    const lines = read("sdge-partial.txt").split(/\n/).map((line) => line.trim()).filter(Boolean);
    const commands = lines.map((line) => `(${line.replace(/[()\\]/g, "")}) Tj`).join("\n");
    const pdf = `%PDF-1.4\n1 0 obj<< /Length 10 >>stream\nBT\n${commands}\nET\nendstream\nendobj\n%%EOF`;
    const extracted = extractLocalText(Buffer.from(pdf), "application/pdf");
    assert.match(extracted.text, /SDG&E/);
    const result = await parseBill({
      document: { filename: "bill.pdf", mime: "application/pdf", base64: Buffer.from(pdf).toString("base64") },
    });
    assert.equal(result.ok, true);
    assert.equal(result.extractor, "local");
    assert.equal(result.bill.source, "document");
    assert.equal(result.bill.utility_provider, "SDG&E");
    assert.equal(result.bill.account_number, "8600998877");
    assert.ok(result.bill.warnings.includes("pdf_text_operators"));
  });

  it("reads an image only when the offline marker is embedded", async () => {
    const marked = Buffer.from(`SOVEREIGN_BILL_TEXT\n${read("heco-partial.txt")}`).toString("base64");
    const found = await parseBill({ document: { filename: "bill.png", mime: "image/png", base64: marked } });
    assert.equal(found.ok, true);
    assert.equal(found.bill.utility_provider, "HECO");
    assert.ok(found.bill.warnings.includes("extracted_embedded_bill_text"));

    const blank = await parseBill({
      document: { filename: "blank.png", mime: "image/png", base64: Buffer.from([0, 1, 2, 255, 10, 30]).toString("base64") },
    });
    assert.equal(blank.ok, false);
    assert.ok(blank.bill.warnings.includes("image_ocr_unavailable_offline"));
  });
});
