"use client";

import { useEffect, useState } from "react";
import { Chart, PALETTE } from "@/components/chart";
import { Card, PageHeader, SectionTitle, Skeleton } from "@/components/ui";
import { FLEETS, RULES, compareRules, type DispatchRule, type FleetKind, type RuleResult } from "@/lib/dispatch-sim";

const DAYS = 20;
const KINDS: FleetKind[] = ["van", "bus", "truck"];
const DEMAND = [{ value: 0.8, label: "Quiet" }, { value: 1, label: "Normal" }, { value: 1.3, label: "Peak" }, { value: 1.6, label: "Overload" }];

type Metric = { key: Exclude<keyof RuleResult, "rule">; label: string; better: "high" | "low"; fmt: (v: number) => string; help: string };
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const METRICS: Metric[] = [
  { key: "onTimePct", label: "SLA on-time delivery", better: "high", fmt: pct, help: "Jobs delivered by their deadline, out of all jobs (jobs never served count as late)." },
  { key: "deadheadRatio", label: "Empty-mile (deadhead) ratio", better: "low", fmt: pct, help: "Empty kilometres to pickups and back to the depot, out of all kilometres." },
  { key: "utilisation", label: "Driver shift utilisation", better: "high", fmt: pct, help: "Productive minutes (driving loaded, loading, unloading) out of the paid shift. Empty driving is not counted." },
  { key: "turnaroundMin", label: "Turnaround per job", better: "low", fmt: (v) => `${v.toFixed(0)} min`, help: "From dispatch to delivered: empty drive, loading, loaded drive and unloading." },
  { key: "marginPerVehicle", label: "Margin per vehicle-day", better: "high", fmt: (v) => `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(0)}`, help: "Revenue minus distance cost and the paid driver shift, per vehicle." },
  { key: "served", label: "Jobs served per day", better: "high", fmt: (v) => v.toFixed(0), help: "Jobs completed before the shift ended, out of the day's demand." },
];
const label = (r: DispatchRule) => RULES.find((x) => x.id === r)!.label;

function Segmented<T extends string | number>({ value, options, onChange, name }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={"min-h-11 rounded-full border px-3.5 text-[13px] transition active:scale-[0.97] md:min-h-0 md:py-1.5 " +
            (o.value === value ? "border-accent bg-accent-soft text-accent-ink" : "border-border text-muted hover:text-text")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function DispatchLabPage() {
  const [kind, setKind] = useState<FleetKind>("van");
  const [vehicles, setVehicles] = useState(40);
  const [demand, setDemand] = useState(1.3);
  const [seed, setSeed] = useState(7);
  const key = `${kind}|${vehicles}|${demand}|${seed}`;
  const [run, setRun] = useState<{ key: string; results: RuleResult[] } | null>(null);
  const results = run?.key === key ? run.results : null;   // stale results never show under new settings

  useEffect(() => {
    // Let the skeleton paint first; a run is 20 days × 4 rules and takes well under a second.
    const t = window.setTimeout(() => setRun({ key, results: compareRules(kind, vehicles, demand, seed, DAYS) }), 30);
    return () => window.clearTimeout(t);
  }, [key, kind, vehicles, demand, seed]);

  const f = FLEETS[kind];
  const best = (m: Metric) => {
    if (!results) return null;
    const vals = results.map((r) => r[m.key].mean);
    const target = m.better === "high" ? Math.max(...vals) : Math.min(...vals);
    return results.filter((r) => r[m.key].mean === target).map((r) => r.rule);
  };

  return (
    <>
      <PageHeader eyebrow="Dispatch lab" title="Which dispatch rule wins, and at what cost" art="fleet">
        The same simulated jobs run through four dispatch rules so their trade-offs show side by side: on-time delivery, empty miles, driver
        utilisation, turnaround and margin. Change the fleet, its size and the demand to see where each rule holds up.
      </PageHeader>
      <p className="as-of">Simulated · {DAYS} operating days per rule · seed {seed} · the same jobs for every rule</p>

      <Card className="mt-6">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <p className="tile-label mb-2">Fleet</p>
            <Segmented name="Fleet type" value={kind} onChange={(k) => { setKind(k); setVehicles(k === "van" ? 40 : 20); }}
              options={KINDS.map((k) => ({ value: k, label: FLEETS[k].label }))} />
            <p className="mt-2 text-[12px] text-muted">{f.speedKmh} km/h average · {f.loadMin}+{f.unloadMin} min at stops · {(f.shiftMin / 60).toFixed(0)} h shift · {f.slaMin} min SLA · {f.tripKm[0]}–{f.tripKm[1]} km per {f.unit}</p>
          </div>
          <div>
            <label htmlFor="fleet-size" className="tile-label mb-2 block">Vehicles: <span className="tnum font-medium text-text">{vehicles}</span></label>
            <input id="fleet-size" type="range" min={5} max={80} step={5} value={vehicles} onChange={(e) => setVehicles(Number(e.target.value))}
              className="w-full accent-[var(--accent)]" />
            <div className="mt-3 flex items-center gap-2">
              <label htmlFor="seed" className="text-[12px] text-muted">Seed</label>
              <input id="seed" type="number" min={1} max={9999} value={seed} onChange={(e) => setSeed(Math.max(1, Math.min(9999, Number(e.target.value) || 1)))}
                className="tnum w-20 rounded-lg border border-border bg-panel px-2 py-1 text-[13px]" />
              <button onClick={() => setSeed((s) => (s % 9999) + 1)} className="rounded-lg border border-border px-2.5 py-1 text-[12px] text-muted transition hover:text-text active:scale-[0.97]">
                New days
              </button>
            </div>
          </div>
          <div>
            <p className="tile-label mb-2">Demand</p>
            <Segmented name="Demand level" value={demand} onChange={setDemand} options={DEMAND} />
            <p className="mt-2 text-[12px] text-muted">{Math.round(f.jobsPerVehicle * demand * vehicles).toLocaleString()} jobs a day on average. The rule matters most when demand outruns the fleet.</p>
          </div>
        </div>
      </Card>

      <SectionTitle sub="Mean of 20 simulated days with its 95% confidence interval. Where intervals overlap, the difference may be noise.">Rule comparison</SectionTitle>
      {!results ? <Skeleton height={320} /> : (
        <Card>
          {/* Phones: one block per metric, rules listed down the block (data reflows instead of scrolling sideways). */}
          <div className="space-y-4 md:hidden">
            {METRICS.map((m) => {
              const winners = best(m) ?? [];
              return (
                <section key={m.key} className="border-b border-border pb-3 last:border-0">
                  <h3 className="font-medium">{m.label}</h3>
                  <p className="text-[11.5px] text-muted">{m.help}</p>
                  <dl className="mt-2 space-y-1">
                    {results.map((r) => (
                      <div key={r.rule} className="flex items-baseline justify-between gap-3 text-[13px]">
                        <dt className="text-muted">{label(r.rule)}</dt>
                        <dd className="tile-figure"><span className={winners.includes(r.rule) ? "font-semibold text-accent-ink" : ""}>{m.fmt(r[m.key].mean)}</span>
                          {winners.includes(r.rule) && <span className="ms-1.5 text-[11px] font-semibold text-good">Best</span>}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="tnum w-full min-w-[640px] text-[13px]">
              <thead className="text-left text-faint">
                <tr><th className="py-2 font-medium">Metric</th>{results.map((r) => (
                  <th key={r.rule} className="py-2 text-right font-medium">{label(r.rule)}{RULES.find((x) => x.id === r.rule)?.reference && <span className="block text-[10.5px] font-normal">reference</span>}</th>))}</tr>
              </thead>
              <tbody>
                {METRICS.map((m) => {
                  const winners = best(m) ?? [];
                  return (
                    <tr key={m.key} className="border-t border-border align-top">
                      <td className="py-2.5 pr-3"><span className="font-medium">{m.label}</span><span className="block text-[11.5px] text-muted">{m.help}</span></td>
                      {results.map((r) => {
                        const e = r[m.key], won = winners.includes(r.rule);
                        return (
                          <td key={r.rule} className="tile-figure py-2.5 text-right">
                            <span className={won ? "font-semibold text-accent-ink" : ""}>{m.fmt(e.mean)}</span>
                            <span className="block text-[11px] text-faint">± {m.key === "served" || m.key === "turnaroundMin" || m.key === "marginPerVehicle" ? m.fmt(e.half).replace("−", "") : pct(e.half)}</span>
                            {won && <span className="mt-0.5 block text-[11px] font-semibold text-good">Best</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card title="The trade-off" sub="On-time delivery against empty miles; bubble size is margin per vehicle-day">
          {results ? <Chart height={300} option={() => ({
            tooltip: { formatter: (p: unknown) => { const d = (p as { data: [number, number, number, string] }).data; return `${d[3]}<br/>On time ${d[1].toFixed(1)}% · empty miles ${d[0].toFixed(1)}%<br/>Margin $${d[2].toFixed(0)} per vehicle-day`; } },
            legend: { bottom: 0 }, grid: { left: 8, right: 24, top: 28, bottom: 44, containLabel: true },
            xAxis: { type: "value", name: "Empty-mile ratio %", nameLocation: "middle", nameGap: 26, scale: true },
            yAxis: { type: "value", name: "On time %", scale: true },
            series: results.map((r, i) => ({
              type: "scatter" as const, name: label(r.rule),
              symbolSize: Math.max(12, Math.min(46, 12 + Math.abs(r.marginPerVehicle.mean) / 6)),
              itemStyle: { color: PALETTE[i], opacity: 0.85 },
              data: [[r.deadheadRatio.mean * 100, r.onTimePct.mean * 100, r.marginPerVehicle.mean, label(r.rule)]],
            })),
          })} /> : <Skeleton height={300} />}
        </Card>
        <Card title="How each rule chooses" sub="Every minute, idle vehicles and waiting jobs are paired greedily by the rule">
          <dl className="space-y-3 text-[13px]">
            {RULES.map((r) => (
              <div key={r.id}><dt className="font-medium">{r.label}{r.reference && <span className="text-faint"> · reference</span>}</dt><dd className="mt-0.5 text-muted">{r.detail}</dd></div>
            ))}
          </dl>
          <p className="mt-4 text-[12px] leading-relaxed text-faint">
            A vehicle takes a job only if it can deliver it and drive back to the depot before its shift ends. One load at a time and no booked
            return loads, so long-haul trucks run about half their kilometres empty. Model and assumptions: docs/DISPATCH_LAB.md.
          </p>
        </Card>
      </div>
    </>
  );
}
