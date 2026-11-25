"use client";

import { ArrowSquareOut } from "@phosphor-icons/react";
import { regionWhere, useEngine, useSql } from "./engine-provider";
import { Card, EmptyRow, SectionTitle, Skeleton } from "./ui";

/** Status words always carry their meaning; colour only reinforces it. */
const STATES = ["Non-compliant", "Evidence missing", "Expiring", "Compliant"] as const;
const TONE: Record<string, string> = { "Non-compliant": "var(--bad)", "Evidence missing": "var(--warn)", Expiring: "var(--warn)", Compliant: "var(--good)" };
const RULES_AS_OF = "23 Nov 2026";
const BAHRAIN_RULES_AS_OF = "26 Nov 2026";

interface CountryRow {
  country_code: string; country: string; registration_name: string; authority: string; inspection_rule: string;
  renewal_note: string; operating_card_note: string | null; confidence: string; source_url: string; status: string; vehicles: number;
}
interface VehicleRow { vehicle_id: string; plate_number: string | null; country: string; status: string; reasons: string }

export function GccCompliance() {
  const { region } = useEngine();
  const w = regionWhere(region, "AND");
  const rows = useSql<CountryRow>(`SELECT country_code, country, registration_name, authority, inspection_rule, renewal_note, operating_card_note,
    confidence, source_url, status, count(*)::INT AS vehicles FROM mart_gcc_compliance WHERE country IS NOT NULL${w} GROUP BY ALL ORDER BY country`);
  const outside = useSql<{ n: number }>(`SELECT count(*)::INT AS n FROM mart_gcc_compliance WHERE country IS NULL${w}`);
  const action = useSql<VehicleRow>(`SELECT vehicle_id, plate_number, country, status, reasons FROM mart_gcc_compliance
    WHERE status IN ('Non-compliant', 'Evidence missing', 'Expiring')${w}
    ORDER BY CASE status WHEN 'Non-compliant' THEN 0 WHEN 'Evidence missing' THEN 1 ELSE 2 END, country, vehicle_id LIMIT 25`);

  const countries = rows.data ? [...new Map(rows.data.map((r) => [r.country_code, r])).values()] : [];
  const count = (code: string, state: string) => rows.data?.find((r) => r.country_code === code && r.status === state)?.vehicles ?? 0;

  return (
    <>
      <SectionTitle sub="Country requirements checked against the report. Garage rechecks applicable evidence on the date of handover. Confirm requirements with the authority before acting.">
        GCC compliance by country
      </SectionTitle>
      {!rows.data ? <Skeleton height={220} /> : countries.length === 0 ? (
        <Card><p className="text-sm text-muted">No vehicles in the UAE, Saudi Arabia, Qatar, Kuwait, Bahrain or Oman{region ? " in this region" : ""}. Set each vehicle&apos;s region (or its site&apos;s) to its country or city to check it here.</p></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {countries.map((c) => (
            <Card key={c.country_code} title={c.country} sub={c.authority}>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                {STATES.map((s) => (
                  <li key={s} className="tnum"><span className="inline-block size-2 rounded-full align-middle" style={{ background: TONE[s] }} aria-hidden /> {s}{" "}
                    <span className="font-medium">{count(c.country_code, s).toLocaleString()}</span></li>
                ))}
              </ul>
              <dl className="mt-3 space-y-1.5 text-[12.5px] leading-relaxed text-muted">
                <div><dt className="inline font-medium text-text">{c.registration_name}. </dt><dd className="inline">{c.renewal_note}</dd></div>
                <div><dt className="inline font-medium text-text">Inspection. </dt><dd className="inline">{c.inspection_rule}</dd></div>
                {c.operating_card_note && <div><dt className="inline font-medium text-text">Operating card. </dt><dd className="inline">{c.operating_card_note}</dd></div>}
              </dl>
              <p className="mt-3 text-[11px] text-faint">
                <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-accent-ink">
                  Source <ArrowSquareOut size={11} aria-hidden /><span className="sr-only">(opens the authority&apos;s page in a new tab)</span>
                </a>{" · "}confidence {c.confidence}{" · "}as of {c.country_code === "BH" ? BAHRAIN_RULES_AS_OF : RULES_AS_OF}
              </p>
            </Card>
          ))}
        </div>
      )}
      {(outside.data?.[0]?.n ?? 0) > 0 && (
        <p className="mt-2 text-[12px] text-faint">{outside.data![0].n.toLocaleString()} active vehicle(s) are outside the six GCC countries and are not checked here.</p>
      )}
      <div className="mt-4">
        <Card title="Vehicles to act on" sub="Non-compliant first, then missing evidence, then renewals due">
          {action.data ? (
            <table className="tnum w-full text-[12.5px]">
              <thead className="text-left text-faint"><tr><th className="py-1 font-medium">Vehicle</th><th className="font-medium">Country</th><th className="font-medium">Status</th><th className="font-medium">Why</th></tr></thead>
              <tbody>{action.data.length === 0 && <EmptyRow cols={4}>Every checked vehicle meets its country&apos;s rules on the records held.</EmptyRow>}{action.data.map((v) => (
                <tr key={v.vehicle_id} className="border-t border-border align-top">
                  <td className="py-1.5 font-mono text-[12px]">{v.plate_number || v.vehicle_id}</td><td>{v.country}</td>
                  <td className="whitespace-nowrap font-medium" style={{ color: TONE[v.status] }}>{v.status}</td>
                  <td className="text-muted">{v.reasons}</td>
                </tr>))}
              </tbody>
            </table>
          ) : <Skeleton />}
        </Card>
      </div>
    </>
  );
}
