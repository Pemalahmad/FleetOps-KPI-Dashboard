/**
 * Read registration cards, insurance policies and other vehicle documents in the browser:
 *   photos  -> Tesseract.js OCR (English + Arabic), self-hosted under public/tesseract/
 *   PDFs    -> pdf.js text layer; scanned PDFs are rendered and OCR'd
 * then `extractFields` (pure, tested) finds which vehicle it is and the dates that matter.
 * Nothing leaves the browser. The owner confirms every document before it counts.
 */
import { findVins } from "./vin";

export type DocType = "Registration" | "Insurance" | "Inspection" | "Permit" | "Other";

export interface KnownVehicle {
  vehicle_id: string;
  plate_number: string | null;
  vin: string | null;
}

export interface Extracted {
  vehicle_ref: string | null;
  vehicle_id: string | null;
  matched_by: "vin" | "plate" | "vehicle_id" | null;
  vin_in_text: string | null;
  plate_in_text: string | null;
  doc_type: DocType;
  issue_date: string | null;
  expiry_date: string | null;
  document_number: string | null;
  issuer: string | null;
  dates: string[];
}

// ------------------------------------------------------------------------------------------- text helpers
/** Arabic-Indic and Eastern Arabic-Indic digits to ASCII. */
export const asciiDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

const alnum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

interface FoundDate { date: string; index: number }

/** Every date in the text with its position. Numeric dates are day-first (GCC, Europe) unless that is impossible. */
export function findDates(text: string): FoundDate[] {
  const t = asciiDigits(text);
  const out: FoundDate[] = [];
  for (const m of t.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const d = iso(+m[1], +m[2], +m[3]);
    if (d) out.push({ date: d, index: m.index! });
  }
  for (const m of t.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g)) {
    const a = +m[1], b = +m[2], y = +m[3];
    const d = a > 12 ? iso(y, b, a) : b > 12 ? iso(y, a, b) : iso(y, b, a);
    if (d) out.push({ date: d, index: m.index! });
  }
  for (const m of t.matchAll(/\b(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-,]+(\d{4})\b/g)) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    const d = mi >= 0 ? iso(+m[3], mi + 1, +m[1]) : null;
    if (d) out.push({ date: d, index: m.index! });
  }
  for (const m of t.matchAll(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    const d = mi >= 0 ? iso(+m[3], mi + 1, +m[2]) : null;
    if (d) out.push({ date: d, index: m.index! });
  }
  return out.sort((x, y) => x.index - y.index);
}

/** The date closest after a keyword on the same or next line, if any. */
function dateNear(text: string, dates: FoundDate[], keyword: RegExp): string | null {
  let best: { date: string; gap: number } | null = null;
  for (const m of asciiDigits(text).matchAll(new RegExp(keyword.source, "gi"))) {
    for (const d of dates) {
      const gap = d.index - m.index!;
      if (gap >= 0 && gap < 80 && (!best || gap < best.gap)) best = { date: d.date, gap };
    }
  }
  return best?.date ?? null;
}

// Strong words name the document itself; weak words merely appear on it (a UAE vehicle licence prints its insurance
// expiry and policy number, so "policy" alone must not make it an insurance policy). The title line counts double.
const TYPE_WORDS: Record<Exclude<DocType, "Other">, { strong: RegExp; weak: RegExp }> = {
  Registration: {
    strong: /vehicle licen[cs]e|vehicle registration|registration card|registration certificate|mulkiya|istimara|logbook|v5c|ملكية|رخصة سير|رخصة مركبة|استمارة|ruhsat|tescil belgesi/gi,
    weak: /registration|traffic plate|plate no|reg\. date|chassis|tescil|plaka/gi,
  },
  Insurance: {
    strong: /insurance policy|motor insurance|certificate of insurance|policyholder|policy schedule|وثيقة تأمين|بوليصة|sigorta poliçe|trafik sigortası|kasko/gi,
    weak: /insur|policy|premium|sum insured|تأمين|sigorta/gi,
  },
  Inspection: { strong: /inspection certificate|roadworthiness|technical inspection|\bmot\b|fahes|tasjeel|شهادة فحص|muayene/gi, weak: /inspection|test result|فحص/gi },
  Permit: { strong: /operating permit|operating card|بطاقة تشغيل|تصريح/gi, weak: /permit/gi },
};

export function classify(text: string): DocType {
  const title = text.split("\n").slice(0, 2).join(" ");
  let best: DocType = "Other", bestScore = 0;
  for (const [type, w] of Object.entries(TYPE_WORDS) as [Exclude<DocType, "Other">, { strong: RegExp; weak: RegExp }][]) {
    const count = (re: RegExp, t: string) => (t.match(re) ?? []).length;
    const score = 3 * count(w.strong, text) + count(w.weak, text) + 3 * count(w.strong, title);
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return best;
}

const ISSUERS = [
  "RTA", "Dubai Police", "Abu Dhabi Police", "Sharjah Police", "Ajman Police", "Ministry of Interior", "Muroor",
  "Traffic Department", "General Directorate of Traffic", "Emniyet", "DVLA", "Qatar Traffic", "Kuwait Traffic", "ROP",
];

export function extractFields(rawText: string, known: KnownVehicle[], insurers: string[] = []): Extracted {
  const text = asciiDigits(rawText);
  const flat = alnum(text);
  // 1. Which vehicle: a VIN is unambiguous; then the longest plate or id that appears in the text.
  const vins = findVins(text);
  let vehicle: KnownVehicle | null = null, matched: Extracted["matched_by"] = null;
  const byVin = new Map(known.filter((k) => k.vin).map((k) => [alnum(k.vin!), k]));
  for (const v of vins) {
    if (byVin.has(v)) {
      vehicle = byVin.get(v)!;
      matched = "vin";
      break;
    }
  }
  if (!vehicle) {
    let bestLen = 0;
    for (const k of known) {
      for (const [ref, how] of [[k.plate_number, "plate"], [k.vehicle_id, "vehicle_id"]] as const) {
        const a = ref ? alnum(ref) : "";
        if (a.length >= 4 && a.length > bestLen && flat.includes(a)) {
          vehicle = k;
          matched = how;
          bestLen = a.length;
        }
      }
    }
  }
  // 2. Type, dates, number, issuer.
  const doc_type = classify(text);
  const dates = findDates(text);
  const sorted = [...new Set(dates.map((d) => d.date))].sort();
  const expiry = dateNear(text, dates, /expir|exp\.?\s|valid (until|to|till)|end date|to date|انتهاء|ينتهي|تاريخ الانتهاء|bitiş/)
    ?? (sorted.length ? sorted[sorted.length - 1] : null);
  const issue = dateNear(text, dates, /issue|issued|start|from date|effective|registration date|تاريخ الإصدار|الإصدار|بداية|başlangıç/)
    ?? (sorted.length > 1 ? sorted[0] : null);
  // a number sits on the same line as its label and contains at least one digit
  const num = text.match(/(?:policy|certificate|registration|traffic code|licen[cs]e|document|رقم الوثيقة|رقم)[ \t]*(?:no\.?|number|#)?[ \t]*[:.]?[ \t]*(?=[A-Z0-9/-]*\d)([A-Z0-9][A-Z0-9/-]{4,})/i);
  const issuer = [...insurers, ...ISSUERS].find((n) => n && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) ?? null;
  // the plate as printed after its label, for cards whose vehicle is not in the fleet yet
  const plateM = text.match(/(?:traffic plate|plate)\s*(?:no\.?|number|#)?\s*[:.]?[ \t]*([A-Z]{0,3}[ \t-]?\d{1,6}(?:[ \t-]?[A-Z]{1,3})?)(?=[ \t]{2,}|\s*\n|\s*$|[ \t]+[A-Z][a-z])/i)
    ?? text.match(/(?:plaka|رقم اللوحة)\s*[:.]?[ \t]*([0-9]{2}[ \t]?[A-Z]{1,3}[ \t]?[0-9]{2,4})/i);
  const plate_in_text = plateM ? plateM[1].trim().replace(/\s+/g, " ").toUpperCase() : null;
  return {
    vehicle_ref: vehicle ? (matched === "vin" ? vehicle.vin : matched === "plate" ? vehicle.plate_number : vehicle.vehicle_id) : null,
    vehicle_id: vehicle?.vehicle_id ?? null, matched_by: matched, vin_in_text: vins[0] ?? null, plate_in_text,
    doc_type, issue_date: issue && expiry && issue > expiry ? null : issue, expiry_date: expiry,
    document_number: num?.[1] ?? null, issuer, dates: sorted,
  };
}

// ------------------------------------------------------------------------------------------- reading files
type Progress = (stage: string, pct: number) => void;
export const isSafeDocumentPreview = (mime: string) =>
  /^(?:application\/pdf|text\/plain|image\/(?:png|jpeg|webp|gif|bmp|tiff))$/i.test(mime);

let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

async function ocrWorker(base: string, progress?: Progress) {
  if (!workerPromise) {
    const { createWorker } = await import("tesseract.js");
    workerPromise = createWorker(["eng", "ara"], 1, {
      workerPath: `${base}/tesseract/worker.min.js`,
      corePath: `${base}/tesseract/core/`,
      langPath: `${base}/tesseract/lang`,
      gzip: true,
      logger: (m: { status: string; progress: number }) => progress?.(m.status, m.progress),
    });
  }
  return workerPromise;
}

export async function ocr(base: string, image: Blob | HTMLCanvasElement, progress?: Progress): Promise<string> {
  const w = await ocrWorker(base, progress);
  const { data } = await w.recognize(image);
  return data.text;
}

async function pdfText(base: string, blob: Blob, progress?: Progress): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdf/pdf.worker.min.mjs`;
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  try {
  const doc = await task.promise;
  let text = "";
  for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    text += tc.items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
  }
  if (text.replace(/\s/g, "").length > 40) return text;
  // A scan inside a PDF: render the first page and read it.
  progress?.("rendering scanned PDF", 0);
  const page = await doc.getPage(1);
  const original = page.getViewport({ scale: 1 });
  const scale = Math.min(2.2, Math.sqrt(12_000_000 / (original.width * original.height)));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
  return await ocr(base, canvas, progress);
  } finally { await task.destroy(); }
}

/** Text of any supported document file. */
export async function readDocument(base: string, file: Blob & { name?: string; type: string }, progress?: Progress): Promise<string> {
  if (file.size > 25 * 1024 * 1024) throw new Error("Document exceeds 25 MB. Split or compress it before scanning.");
  if (file.type && !isSafeDocumentPreview(file.type)) throw new Error("Use a PDF, raster image or plain-text document. HTML and SVG documents are not supported.");
  if (file.type === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf")) return pdfText(base, file, progress);
  if (file.type.startsWith("image/")) return ocr(base, file, progress);
  if (file.type === "text/plain") return file.text();
  throw new Error(`Unsupported document type: ${file.type || file.name}`);
}

