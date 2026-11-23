"use client";
import type { ReactNode } from "react";

export const inputCls = "w-full rounded-lg border border-border bg-panel px-2.5 py-1.5 text-[13px] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60";
export const buttonCls = "inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-3 text-[13px] text-muted transition hover:text-text active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 md:py-1.5";
export const primaryCls = "inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-3.5 text-[13px] font-medium text-white transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 md:py-1.5";

export function Field({ label, children, hint, className = "" }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={"block text-[12px] " + className}>
      <span className="mb-1 block text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

/** A number input that keeps blank as null instead of 0. */
export function NumberInput({ value, onChange, step = 1, min, max, disabled }: { value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; max?: number; disabled?: boolean }) {
  return <input type="number" inputMode="decimal" className={inputCls + " tnum"} value={value ?? ""} step={step} min={min} max={max} disabled={disabled}
    onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
}

export function Section({ title, sub, children, right }: { title: string; sub?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-t border-border pt-4 first:border-0 first:pt-0">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><h3 className="text-[14px] font-semibold">{title}</h3>{sub && <p className="text-[12px] text-muted">{sub}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

export const money = (v: number) => (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
