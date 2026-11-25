"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import {
  BookOpenText, Car, ChartPieSlice, CircleNotch, FileArrowUp, Garage, Graph, IdentificationCard, Moon, ShieldCheck, Smiley, Sun,
  HardDrives, TreeStructure, WifiSlash, Wrench,
  SteeringWheel, Truck, ClipboardText,
} from "@phosphor-icons/react";
import { useTheme } from "./chart";
import { LiveBadge, LiveDriver } from "./live";
import { useEngine } from "./engine-provider";
import { OfflineRegistration } from "./offline";
import { UnlockBanner } from "./vault";

const NAV = [
  { group: "Operate", items: [
    { href: "/", label: "Daily command", icon: Garage },
    { href: "/overview/", label: "Analytics", icon: ChartPieSlice },
    { href: "/network/", label: "Metric network", icon: Graph },
    { href: "/dispatch/", label: "Dispatch lab", icon: Truck },
    { href: "/customer/", label: "Customer clock", icon: Smiley },
    { href: "/service/", label: "Service board", icon: ClipboardText },
    { href: "/workshop/", label: "Workshop", icon: Wrench },
    { href: "/ledger/", label: "Ledger & assets", icon: Car },
    { href: "/licence/", label: "Licence", icon: ShieldCheck },
  ] },
  { group: "Fleet", items: [
    { href: "/fleet/", label: "Fleet register", icon: Garage },
    { href: "/drivers/", label: "Drivers & trips", icon: SteeringWheel },
    { href: "/documents/", label: "Documents", icon: IdentificationCard },
    { href: "/import/", label: "Import", icon: FileArrowUp },
    { href: "/plan/", label: "Plan & offline", icon: WifiSlash },
  ] },
  { group: "Govern", items: [
    { href: "/pipeline/", label: "Pipeline & your data", icon: TreeStructure },
    { href: "/system/", label: "System design", icon: HardDrives },
    { href: "/doctrine/", label: "Doctrine & SOPs", icon: BookOpenText },
  ] },
];

const isActive = (href: string, path: string) => href === "/" ? path === "/" : path.startsWith(href);

function MobileNav({ path }: { path: string }) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const active = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest", inline: "center" });
  }, [path]);
  return (
    <nav ref={nav} aria-label="Mobile navigation" className="mt-2 flex gap-1 overflow-x-auto lg:hidden">
      {NAV.flatMap((group) => group.items).map(({ href, label }) => {
        const active = isActive(href, path);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined}
          className={`shrink-0 rounded-full px-3 py-1 text-[12.5px] ${active ? "bg-accent-soft font-medium text-accent-ink" : "text-muted"}`}>
          {label}
        </Link>;
      })}
    </nav>
  );
}

function ThemeToggle() {
  const dark = useTheme();
  const flip = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
  };
  return (
    <button onClick={flip} aria-label="Dark mode" aria-pressed={dark} title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-border bg-panel px-3 text-[13px] text-muted transition hover:text-text active:scale-95">
      {dark ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
      <span className="hidden sm:inline">{dark ? "Light mode" : "Dark mode"}</span>
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
    `rounded-full border px-2.5 py-1 text-[12px] transition active:scale-95 ${active ? "border-accent bg-accent-soft text-accent-ink font-medium" : "border-border text-muted hover:text-text"}`;
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
    <p className={`flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted ${className}`}>
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
                const active = isActive(href, path);
                return (
                  <Link key={href} href={href} aria-current={active ? "page" : undefined}
                    className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] transition ${active ? "bg-accent-soft font-medium text-accent-ink" : "text-muted hover:bg-panel-2 hover:text-text"}`}>
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
          <MobileNav path={path} />
          <div className="mt-2.5"><Regions /></div>
        </div>
        <main id="main-content" tabIndex={-1} className="app-frame w-full px-4 py-8 md:px-8"><UnlockBanner /><LiveDriver /><div key={path} className="route-in">{children}</div></main>
        <footer className="w-full px-4 pb-8 md:px-8 lg:hidden"><LegalLinks /></footer>
      </div>
    </div>
  );
}


