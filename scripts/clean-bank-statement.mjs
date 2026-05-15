#!/usr/bin/env node
/**
 * Clean a bank statement CSV into a standardized CSV.
 *
 * Usage:
 *   node scripts/clean-bank-statement.mjs input.csv -o cleaned.csv
 *
 * Notes:
 * - Works with typical "statement export" CSVs (quoted fields, commas, CRLF).
 * - Tries to map common header names to standard columns.
 */

import fs from "node:fs/promises";
import path from "node:path";

function printHelp(exitCode = 0) {
  const msg = `
Clean a bank statement CSV into a standardized CSV.

Usage:
  node scripts/clean-bank-statement.mjs <input.csv> [-o output.csv] [--config mapping.json]

Output columns:
  date, description, amount, debit, credit, balance, reference

Options:
  -o, --output   Output CSV path (default: <input>.clean.csv)
  --config       Optional JSON mapping to override header detection
  -h, --help     Show help

Config JSON shape (all keys optional):
  {
    "date": ["Transaction Date", "Date"],
    "description": ["Narration", "Description"],
    "debit": ["Debit", "Withdrawal Amt."],
    "credit": ["Credit", "Deposit Amt."],
    "amount": ["Amount"],
    "balance": ["Balance"],
    "reference": ["Ref No", "UTR", "Cheque No"]
  }
`;
  // eslint-disable-next-line no-console
  console.log(msg.trim());
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { input: null, output: null, config: null };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token) continue;
    if (token === "-h" || token === "--help") printHelp(0);
    if (token === "-o" || token === "--output") {
      args.output = rest[i + 1];
      i += 1;
      continue;
    }
    if (token === "--config") {
      args.config = rest[i + 1];
      i += 1;
      continue;
    }
    if (token.startsWith("-")) {
      // eslint-disable-next-line no-console
      console.error(`Unknown option: ${token}`);
      printHelp(2);
    }
    if (!args.input) args.input = token;
    else {
      // eslint-disable-next-line no-console
      console.error(`Unexpected argument: ${token}`);
      printHelp(2);
    }
  }
  if (!args.input) printHelp(2);
  return args;
}

// Minimal RFC4180-ish CSV parser (handles quotes, commas, CRLF).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // Treat CRLF as a single newline
      if (text[i + 1] === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i += 2;
        continue;
      }
      // Lone CR
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // final field/row (if file doesn't end with newline)
  if (inQuotes) {
    throw new Error("CSV parse error: unterminated quote");
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toCsv(rows) {
  const escapeField = (value) => {
    const s = value == null ? "" : String(value);
    if (/[",\r\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  return rows.map((r) => r.map(escapeField).join(",")).join("\r\n") + "\r\n";
}

function normalizeHeader(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, " ")
    .replaceAll(/[._-]/g, " ");
}

function pickColumnIndex(headers, candidates) {
  const normalized = headers.map(normalizeHeader);
  for (const c of candidates) {
    const want = normalizeHeader(c);
    const idx = normalized.indexOf(want);
    if (idx !== -1) return idx;
  }
  return -1;
}

function cleanText(s) {
  return String(s || "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function parseAmount(value) {
  const s = cleanText(value);
  if (!s) return null;
  // Remove common thousand separators and currency labels.
  const stripped = s
    .replaceAll(/₹/g, "")
    .replaceAll(/inr/gi, "")
    .replaceAll(/,/g, "")
    .replaceAll(/\u00a0/g, " ")
    .trim();
  const n = Number(stripped);
  return Number.isFinite(n) ? n : null;
}

function parseDateLoose(value) {
  const s = cleanText(value);
  if (!s) return "";
  // Prefer returning the original if it looks like ISO.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Common statement formats: dd/mm/yyyy, dd-mm-yyyy, dd/mm/yy
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3].length === 2 ? `20${m[3]}` : String(m[3]);
    return `${yyyy}-${mm}-${dd}`;
  }

  // Fallback: let Date try, but only keep YYYY-MM-DD if valid.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = String(d.getFullYear()).padStart(4, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return s;
}

function buildMapping(headers, userMapping) {
  const defaults = {
    date: ["transaction date", "txn date", "date", "value date", "posting date"],
    description: [
      "narration",
      "description",
      "particulars",
      "remarks",
      "details",
      "transaction remarks",
    ],
    debit: ["debit", "withdrawal", "withdrawal amt", "withdrawal amount", "dr", "amount(dr)"],
    credit: ["credit", "deposit", "deposit amt", "deposit amount", "cr", "amount(cr)"],
    amount: ["amount", "transaction amount", "txn amount"],
    balance: ["balance", "closing balance", "available balance"],
    reference: ["reference", "ref no", "utr", "upi ref", "cheque no", "chq no", "rrn"],
  };

  const merged = { ...defaults };
  if (userMapping && typeof userMapping === "object") {
    for (const k of Object.keys(merged)) {
      if (Array.isArray(userMapping[k]) && userMapping[k].length > 0) merged[k] = userMapping[k];
    }
  }

  const idx = {
    date: pickColumnIndex(headers, merged.date),
    description: pickColumnIndex(headers, merged.description),
    debit: pickColumnIndex(headers, merged.debit),
    credit: pickColumnIndex(headers, merged.credit),
    amount: pickColumnIndex(headers, merged.amount),
    balance: pickColumnIndex(headers, merged.balance),
    reference: pickColumnIndex(headers, merged.reference),
  };

  return idx;
}

function ensureHeaderRow(rows) {
  if (rows.length === 0) throw new Error("Empty CSV");
  // Some exports include blank lines at top; skip empties.
  let headerRowIndex = 0;
  while (headerRowIndex < rows.length) {
    const row = rows[headerRowIndex];
    const nonEmpty = row.some((c) => cleanText(c) !== "");
    if (nonEmpty) break;
    headerRowIndex += 1;
  }
  if (headerRowIndex >= rows.length) throw new Error("CSV has no header row");
  const headers = rows[headerRowIndex].map(cleanText);
  const dataRows = rows.slice(headerRowIndex + 1);
  return { headers, dataRows };
}

async function main() {
  const { input, output, config } = parseArgs(process.argv);

  const inputPath = path.resolve(process.cwd(), input);
  const outPath = path.resolve(
    process.cwd(),
    output || `${inputPath.replace(/\.csv$/i, "")}.clean.csv`,
  );

  let userMapping = null;
  if (config) {
    const configPath = path.resolve(process.cwd(), config);
    const raw = await fs.readFile(configPath, "utf8");
    userMapping = JSON.parse(raw);
  }

  const rawCsv = await fs.readFile(inputPath, "utf8");
  const rows = parseCsv(rawCsv);
  const { headers, dataRows } = ensureHeaderRow(rows);
  const map = buildMapping(headers, userMapping);

  const outRows = [["date", "description", "amount", "debit", "credit", "balance", "reference"]];

  for (const r of dataRows) {
    // Skip totally empty rows
    if (!r || r.every((c) => cleanText(c) === "")) continue;

    const date = map.date >= 0 ? parseDateLoose(r[map.date]) : "";
    const description = map.description >= 0 ? cleanText(r[map.description]) : "";
    const debit = map.debit >= 0 ? parseAmount(r[map.debit]) : null;
    const credit = map.credit >= 0 ? parseAmount(r[map.credit]) : null;
    const amountRaw = map.amount >= 0 ? parseAmount(r[map.amount]) : null;
    const balance = map.balance >= 0 ? parseAmount(r[map.balance]) : null;
    const reference = map.reference >= 0 ? cleanText(r[map.reference]) : "";

    // Compute a single signed amount:
    // - If Amount column exists and debit/credit are missing, keep as-is.
    // - If debit/credit exist, prefer them and derive sign.
    let amount = amountRaw;
    let debitOut = debit;
    let creditOut = credit;

    if (debit != null || credit != null) {
      if (debit != null && debit !== 0) {
        amount = -Math.abs(debit);
        debitOut = Math.abs(debit);
        creditOut = null;
      } else if (credit != null && credit !== 0) {
        amount = Math.abs(credit);
        creditOut = Math.abs(credit);
        debitOut = null;
      } else {
        amount = amountRaw;
      }
    } else if (amountRaw != null) {
      // If amount is negative, derive debit; if positive, derive credit.
      if (amountRaw < 0) {
        debitOut = Math.abs(amountRaw);
        creditOut = null;
      } else if (amountRaw > 0) {
        creditOut = Math.abs(amountRaw);
        debitOut = null;
      }
    }

    outRows.push([
      date,
      description,
      amount == null ? "" : String(amount),
      debitOut == null ? "" : String(debitOut),
      creditOut == null ? "" : String(creditOut),
      balance == null ? "" : String(balance),
      reference,
    ]);
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, toCsv(outRows), "utf8");

  // eslint-disable-next-line no-console
  console.log(`Wrote cleaned CSV: ${outPath}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err?.message || err);
  process.exit(1);
});

