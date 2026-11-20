"use client";

import { useMemo, useState } from "react";
import { BODY_STYLES, guessBodyStyle, modelKey, paintColor, profilePath, type BodyStyle } from "@/lib/car-styles";
import { cleanName, withoutPrefix } from "@/lib/names";
import { useCarStyles } from "./use-car-styles";
import { Glare } from "../bits/fleetops-bits";

/** Side view of a body style, drawn from the same profile as the 3D car. */
export function CarSilhouette({ style, paint = "#a9aeb8", className = "" }: { style: BodyStyle; paint?: string; className?: string }) {
  const p = profilePath(style, 10);
  return (
    <svg viewBox={`-4 -4 ${p.w + 8} ${p.h + 8}`} preserveAspectRatio="xMidYMax meet" className={className} aria-hidden="true">
      {p.cargo && <path d={p.cargo} fill="var(--panel-2)" stroke="var(--muted)" strokeWidth={1.2} />}
      <path d={p.d} fill={paint} stroke="var(--text)" strokeOpacity={0.35} strokeWidth={1.2} strokeLinejoin="round" />
      <path d={p.glass} fill="#1d2a40" opacity={0.85} />
      {p.wheels.map((w) => (
        <g key={w.cx}>
          <circle cx={w.cx} cy={p.h - w.r} r={w.r} fill="#16181f" />
          <circle cx={w.cx} cy={p.h - w.r} r={w.r * 0.55} fill="#c3c7cf" />
        </g>
      ))}
    </svg>
  );
}

interface Row { make: string | null; model: string | null; color: string | null }

/** Each make and model in the fleet with the car shape the garage draws for it; the owner can change any of them. */
export function CarShapes({ rows }: { rows: Row[] }) {
  const { chosen, set, demo } = useCarStyles();
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const models = useMemo(() => {
    const m = new Map<string, { key: string; name: string; make: string | null; model: string | null; n: number; colors: Map<string, number> }>();
    for (const r of rows) {
      const key = modelKey(r.make, r.model);
      const make = cleanName(r.make), model = cleanName(r.model);
      const e = m.get(key) ?? { key, name: [make, model ? withoutPrefix(model, make ?? "") : null].filter(Boolean).join(" ") || "Model not recorded", make: r.make, model: r.model, n: 0, colors: new Map() };
      e.n++;
      const c = cleanName(r.color) ?? "";
      e.colors.set(c, (e.colors.get(c) ?? 0) + 1);
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [rows]);
  const shown = all ? models : models.slice(0, 8);
  const change = async (key: string, value: string) => {
    setBusy(key); setError(null);
    try { await set(key, value === "auto" ? null : (value as BodyStyle)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };
  return (
    <div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {shown.map((m) => {
          const auto = guessBodyStyle(m.make, m.model), pick = chosen[m.key], style = pick ?? auto;
          const topColor = [...m.colors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
          return (
            <li key={m.key} className="car-shape-wrap"><Glare><div className="car-shape">
              <CarSilhouette style={style} paint={paintColor(topColor)} className="car-shape-art" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold" title={m.name}>{m.name}</p>
                <p className="tnum text-[11.5px] text-muted">{m.n.toLocaleString()} vehicle{m.n === 1 ? "" : "s"}{topColor ? " · mostly " + topColor.toLowerCase() : ""}</p>
              </div>
              <label className="sr-only" htmlFor={"shape-" + m.key}>Car shape for {m.name}</label>
              <select id={"shape-" + m.key} className="ops-input car-shape-select" value={pick ?? "auto"} disabled={busy === m.key}
                onChange={(e) => void change(m.key, e.target.value)}>
                <option value="auto">Auto · {BODY_STYLES.find((s) => s.id === auto)!.label}</option>
                {BODY_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div></Glare></li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <span>{demo ? "Demo choices last until this tab reloads." : "Saved with this fleet in this browser (encrypted if a passphrase is set)."} Auto picks a shape from the model name.</span>
        {models.length > 8 && <button className="font-medium text-accent-ink hover:underline" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${models.length} models`}</button>}
      </div>
      {error && <p role="alert" className="mt-2 text-[12px] text-bad">{error}</p>}
    </div>
  );
}
