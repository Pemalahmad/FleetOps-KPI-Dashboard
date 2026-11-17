/** Files the owner takes away: calendar reminders and the register as Excel. Pure builders, unit-tested. */

export interface Renewal {
  vehicle: string;          // plate or fleet number shown to the owner
  kind: "Registration" | "Insurance";
  date: string;             // ISO yyyy-mm-dd
  detail?: string | null;   // insurer, VIN…
}

/** RFC 5545 text escaping. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|[\r\n]/g, "\\n");
/** Lines longer than 75 octets are folded (RFC 5545 §3.1). */
const fold = (line: string) => {
  const encoder = new TextEncoder();
  let result = "", bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) { result += "\r\n "; bytes = 1; }
    result += char;
    bytes += size;
  }
  return result;
};

/** One all-day event per renewal, with alarms 30 and 7 days before. Stable UIDs, so re-importing updates rather than duplicates. */
export function renewalsIcs(items: Renewal[], stamp = new Date()): string {
  const dt = (iso: string) => iso.replace(/-/g, "");
  const now = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FleetOps KPI//Renewals//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Fleet renewals"];
  for (const r of items) {
    const next = new Date(`${r.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const uid = `${r.kind.toLowerCase()}-${r.vehicle.replace(/[^A-Za-z0-9]/g, "")}-${dt(r.date)}@fleetops`;
    lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${dt(r.date)}`,
      `DTEND;VALUE=DATE:${dt(next.toISOString().slice(0, 10))}`,
      `SUMMARY:${esc(`${r.kind} expires · ${r.vehicle}`)}`,
      `DESCRIPTION:${esc(`${r.kind} for ${r.vehicle} expires on ${r.date}.${r.detail ? ` ${r.detail}.` : ""} An expired vehicle is grounded until renewed.`)}`,
      "TRANSP:TRANSPARENT");
    for (const days of [30, 7]) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `TRIGGER:-P${days}D`,
      `DESCRIPTION:${esc(`${r.kind} for ${r.vehicle} expires in ${days} days`)}`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * Spreadsheet formula injection: a cell starting with = + - @ (or a tab / carriage return) can run as a formula
 * when the file is opened. Such text is prefixed with an apostrophe, which spreadsheets show as plain text.
 */
export function safeCell(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = String(v);
  return /^[\t\r\n]|^\s*[=+\-@]/.test(s) ? `'${s}` : s;
}

export const safeRows = (rows: Record<string, unknown>[]) =>
  rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, safeCell(v)])));

