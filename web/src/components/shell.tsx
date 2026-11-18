"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  BookOpenText, Car, ChartPieSlice, CircleNotch, FileArrowUp, Garage, Graph, IdentificationCard, Moon, ShieldCheck, Smiley, Sun,
  TreeStructure, WifiSlash, Wrench,
  SteeringWheel,
} from "@phosphor-icons/react";
import { useTheme } from "./chart";
import { LiveBadge, LiveDriver } from "./live";
import { useEngine } from "./engine-provider";
import { OfflineRegistration } from "./offline";
import { UnlockBanner } from "./vault";

const NAV = [
  { group: "Fleet", items: [
    { href: "/fleet/", label: "Fleet register", icon: Garage },
    { href: "/drivers/", label: "Drivers & trips", icon: SteeringWheel },
  { href: "/documents/", label: "Documents", icon: IdentificationCard },
    { href: "/import/", label: "Import", icon: FileArrowUp },
    { href: "/plan/", label: "Plan & offline", icon: WifiSlash },
  ] },
  { group: "Operate", items: [
    { href: "/", label: "My garage", icon: Garage },
    { href: "/overview/", label: "Analytics", icon: ChartPieSlice },
    { href: "/network/", label: "Metric network", icon: Graph },
    { href: "/customer/", label: "Customer clock", icon: Smiley },
    { href: "/workshop/", label: "Workshop", icon: Wrench },
    { href: "/ledger/", label: "Ledger & assets", icon: Car },
    { href: "/licence/", label: "Licence", icon: ShieldCheck },
  ] },
  { group: "Govern", items: [
    { href: "/pipeline/", label: "Pipeline & your data", icon: TreeStructure },
    { href: "/doctrine/", label: "Doctrine & SOPs", icon: BookOpenText },
  ] },
];

function ThemeToggle() {
  const dark = useTheme();
  const flip = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
  };
  return (
    <button onClick={flip} aria-label="Toggle light / dark"
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-panel text-muted transition hover:text-text active:scale-95">
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

function Status() {
  const { status, message, dataset } = useEngine();
  const color = status === "ready" ? "var(--good)" : status === "failed" ? "var(--bad)" : "var(--warn)";
  return (
    <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-muted" role="status" aria-live="polite">
      {status === "ready" || status === "failed" ? (
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      ) : (
        <CircleNotch size={14} className="shrink-0 animate-spin" style={{ color }} />
      )}
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${dataset === "mine" ? "bg-accent text-white" : "bg-panel-2 text-muted"}`}>
        {dataset === "mine" ? "My fleet" : "Demo"}
      </span>
      <span className="truncate" title={message}>{message}</span>
      <LiveBadge />
    </div>
  );
}

function Regions() {
  const { regions, region, setRegion, status } = useEngine();
  if (status !== "ready" || !regions.length) return null;
  const pill = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-[12px] transition active:scale-95 ${active ? "border-accent bg-accent-soft text-accent font-medium" : "border-border text-muted hover:text-text"}`;
  return (
    <div className="flex flex-wrap gap-1.5">
      <button aria-pressed={region === null} className={pill(region === null)} onClick={() => setRegion(null)}>All regions</button>
      {regions.map((r) => (
        <button key={r} aria-pressed={region === r} className={pill(region === r)} onClick={() => setRegion(r)}>{r}</button>
      ))}
    </div>
  );
}

function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <p className={`flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-faint ${className}`}>
      <Link href="/legal/#privacy" className="hover:text-text">Privacy</Link>
      <Link href="/legal/#eula" className="hover:text-text">EULA</Link>
      <Link href="/legal/#dmca" className="hover:text-text">DMCA</Link>
    </p>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <OfflineRegistration />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-panel px-3 py-5 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-white">F</span>
          <span className="leading-tight">
            <span className="block text-[14px] font-semibold">FleetOps KPI</span>
            <span className="block text-[11px] text-muted">Three Clocks Doctrine</span>
          </span>
        </Link>
        <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-5 overflow-y-auto">
          {NAV.map((g) => (
            <div key={g.group}>
              <p className="mb-1.5 px-2 text-[12px] font-semibold text-faint">{g.group}</p>
              {g.items.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? path === "/" : path.startsWith(href);
                return (
                  <Link key={href} href={href} aria-current={(href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined}
                    className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] transition ${active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-panel-2 hover:text-text"}`}>
                    <Icon size={17} weight={active ? "fill" : "regular"} />
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <p className="px-2 text-[11px] leading-relaxed text-faint">
          Files are processed on this device. Optional VIN decoding sends selected VINs to NHTSA.
        </p>
        <LegalLinks className="mt-2 px-2" />
      </aside>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 border-b border-border bg-bg/85 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center justify-between gap-4">
            <Status />
            <ThemeToggle />
          </div>
          <nav aria-label="Mobile navigation" className="mt-2 flex gap-1 overflow-x-auto lg:hidden">
            {NAV.flatMap((g) => g.items).map(({ href, label }) => (
              <Link key={href} href={href} aria-current={(href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined}
                className={`shrink-0 rounded-full px-3 py-1 text-[12.5px] ${(href === "/" ? path === "/" : path.startsWith(href)) ? "bg-accent-soft text-accent" : "text-muted"}`}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-2.5"><Regions /></div>
        </div>
        <main id="main-content" tabIndex={-1} className="app-frame mx-auto max-w-[1480px] px-4 py-8 md:px-8"><UnlockBanner /><LiveDriver /><div key={path} className="route-in">{children}</div></main>
        <footer className="mx-auto max-w-[1480px] px-4 pb-8 md:px-8 lg:hidden"><LegalLinks /></footer>
      </div>
    </div>
  );
}


