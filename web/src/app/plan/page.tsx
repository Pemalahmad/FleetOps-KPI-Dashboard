"use client";

import { useEffect, useState } from "react";
import { CheckCircle, DownloadSimple, Key, LockSimpleOpen, ShieldCheck, WifiSlash } from "@phosphor-icons/react";
import { cacheDocumentReader, useInstallPrompt } from "@/components/offline";
import { ProtectCard } from "@/components/vault";
import { useEngine } from "@/components/engine-provider";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { currentEntitlement, PLAN_FEATURES, saveKey, type Entitlement } from "@/lib/license";

const RELEASES = "https://github.com/Pemalahmad/FleetOps-KPI-Dashboard/releases/latest";

export default function PlanPage() {
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [key, setKey] = useState("");
  const [keyMsg, setKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ocr, setOcr] = useState<string | null>(null);
  const { canInstall, install } = useInstallPrompt();

  useEffect(() => {
    currentEntitlement().then(setEnt);
  }, []);

  return (
    <>
      <PageHeader art="plan" eyebrow="Your plan" title="Plan, licence and offline use">
        FleetOps runs entirely on your device. Use it in the browser, install it as an app, or download it and run it with no internet.
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-start gap-3">
            <LockSimpleOpen size={28} className="shrink-0 text-good" />
            <div>
              <h3 className="text-[17px] font-semibold">{ent?.open ? "Early access: everything is unlocked" : `Plan: ${ent?.plan ?? "…"}`}</h3>
              <p className="mt-1 text-[13.5px] text-muted">
                {ent?.open
                  ? "Every feature, any fleet size, no key needed. Paid plans may come later; if they do, early users will hear first, and your data stays yours whatever happens."
                  : ent?.valid ? `Licensed to ${ent.customer}, valid until ${ent.expires}.` : ent?.reason}
              </p>
            </div>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
            {PLAN_FEATURES["early-access"].features.map((f) => (
              <li key={f} className="flex items-center gap-1.5 text-muted">
                <CheckCircle size={14} weight="fill" className={ent?.can(f) ? "text-good" : "text-faint"} />
                {{ import: "Excel / CSV import", documents: "Document scanning", "vin-decode": "VIN decoding", register: "Fleet register",
                  operations: "Operations KPIs", network: "Metric network", export: "Excel export", reminders: "Calendar reminders", offline: "Offline use" }[f]}
              </li>
            ))}
          </ul>
        </Card>

        <ProtectCard />
        <Card className="lg:col-span-2" title="Licence key" sub="Not needed during early access. A key is checked on this device; it is never sent anywhere.">
          <div className="flex max-w-xl gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-border px-2.5">
              <Key size={15} className="text-faint" />
              <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste a licence key" className="w-full bg-transparent py-2 text-[13px] outline-none" />
            </div>
            <button disabled={!key.trim()} onClick={async () => {
              const r = await saveKey(key);
              setKeyMsg({ ok: r.ok, text: r.ok ? "Key verified and saved on this device." : r.reason ?? "Invalid key." });
              setEnt(await currentEntitlement());
            }} className="rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-white transition active:scale-95 disabled:opacity-40">Check</button>
          </div>
          {keyMsg && <p className="mt-2 text-[12.5px]" style={{ color: keyMsg.ok ? "var(--good)" : "var(--bad)" }}>{keyMsg.text}</p>}
        </Card>
      </div>

      <SectionTitle sub="Everything you change in this browser, newest first: imports, accident reports, handovers, procedure notes and settings. Kept with your fleet data, encrypted when a passphrase is set.">Activity log</SectionTitle>
      <ActivityLog />

      <SectionTitle sub="Three ways to run FleetOps without depending on a connection.">Offline</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Install as an app" sub="Chrome, Edge or Safari: the app opens in its own window and works offline after the first visit.">
          <button onClick={() => install()} disabled={!canInstall}
            className="inline-flex items-center gap-2 rounded-lg border border-accent px-3 py-2 text-[13px] font-medium text-accent-ink transition hover:bg-accent-soft active:scale-95 disabled:opacity-40">
            <DownloadSimple size={15} /> {canInstall ? "Install FleetOps" : "Use your browser's Install / Add to Home Screen"}
          </button>
        </Card>
        <Card title="Scan documents offline" sub="Keep the document reader (about 9 MB, English + Arabic) on this device too.">
          <button onClick={async () => {
            setOcr("Downloading…");
            try { setOcr(`Ready offline (${await cacheDocumentReader()} files).`); } catch (e) { setOcr((e as Error).message); }
          }} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] text-muted transition hover:text-text active:scale-95">
            <WifiSlash size={15} /> Keep the reader offline
          </button>
          {ocr && <p className="mt-2 text-[12.5px] text-muted">{ocr}</p>}
        </Card>
        <Card title="Download the package" sub="A zip with Mac, Windows and Linux launchers. Runs on your computer at http://127.0.0.1:8765, reachable only from that computer.">
          <a href={RELEASES} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-white transition hover:opacity-90 active:scale-95">
            <DownloadSimple size={15} /> Latest release
          </a>
        </Card>
      </div>

      <SectionTitle>Privacy, in one card</SectionTitle>
      <Card>
        <div className="flex gap-3 text-[13.5px] text-muted">
          <ShieldCheck size={26} className="shrink-0 text-good" />
          <ul className="list-disc space-y-1 pl-4">
            <li>Your sheets, documents and their scans are processed and stored only in this browser (IndexedDB). There is no FleetOps server.</li>
            <li>No accounts, no cookies, no analytics, no trackers. Fonts and engines are served from this site, not third parties.</li>
            <li>The only outside call is optional: decoding VINs with NHTSA vPIC sends the VINs, nothing else, and only when you click.</li>
            <li>&ldquo;Delete my fleet data&rdquo; on the Import page removes everything from this browser.</li>
          </ul>
        </div>
      </Card>
    </>
  );
}

const KIND_LABEL = { data: "Data", garage: "Garage", procedure: "Procedure", settings: "Settings" } as const;

function ActivityLog() {
  const { workspace, dataset } = useEngine();
  const [all, setAll] = useState(false);
  const entries = [...(workspace?.activity ?? [])].reverse();
  if (!workspace || dataset === "demo") {
    return <Card><p className="text-[13px] text-muted">The demo keeps no log. Once you import your own fleet, every change you make is recorded here with its time, on this device only.</p></Card>;
  }
  if (!entries.length) return <Card><p className="text-[13px] text-muted">Nothing recorded yet. Changes appear here as you make them.</p></Card>;
  return (
    <Card className="!p-0">
      <ul className="divide-y divide-border">
        {(all ? entries : entries.slice(0, 15)).map((e, i) => (
          <li key={e.at + i} className="grid grid-cols-[150px_86px_minmax(0,1fr)] items-baseline gap-3 px-4 py-2 text-[12.5px]">
            <span className="tnum text-faint">{new Date(e.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            <span className="mono-label !text-[10px] !text-muted">{KIND_LABEL[e.kind]}</span>
            <span className="min-w-0 truncate">{e.detail}</span>
          </li>
        ))}
      </ul>
      {entries.length > 15 && <button onClick={() => setAll(!all)} className="w-full border-t border-border px-4 py-2 text-left text-[12px] font-medium text-accent-ink">{all ? "Show fewer" : `Show all ${entries.length}`}</button>}
    </Card>
  );
}
