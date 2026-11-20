"use client";

import { useState } from "react";
import Link from "next/link";
import { LockSimple, LockKey, ShieldCheck } from "@phosphor-icons/react";
import { useEngine } from "./engine-provider";
import { Card } from "./ui";
import { lockVault, protectWorkspace, unprotectWorkspace } from "@/lib/workspace";
import { passphraseProblem } from "@/lib/vault";

const field = "w-full rounded-lg border border-border bg-transparent px-2.5 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent/50";
const primary = "inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-white transition active:scale-95 disabled:opacity-40";
const quiet = "rounded-lg border border-border px-3 py-2 text-[13px] text-muted transition hover:text-text active:scale-95 disabled:opacity-40";

/** Shown on every page while a protected fleet is locked. */
export function UnlockBanner() {
  const { vault, unlock } = useEngine();
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  if (vault !== "locked") return null;
  return (
    <form className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-panel px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await unlock(pass);
        setBusy(false);
        setWrong(!ok);
        if (ok) setPass("");
      }}>
      <LockSimple size={20} className="text-accent-ink" />
      <p className="min-w-[220px] flex-1 text-[13.5px]">
        <span className="font-medium">Your fleet data is locked.</span>{" "}
        <span className="text-muted">You are looking at the demo fleet. Enter your passphrase to open your own.</span>
      </p>
      <input type="password" autoComplete="current-password" aria-label="Passphrase" value={pass}
        onChange={(e) => { setPass(e.target.value); setWrong(false); }} placeholder="Passphrase" className={`${field} max-w-[240px]`} />
      <button disabled={!pass || busy} className={primary}>{busy ? "Unlocking…" : "Unlock"}</button>
      {wrong && <p className="w-full text-[12.5px]" style={{ color: "var(--bad)" }}>
        That passphrase is not right. Forgotten it? The data cannot be recovered; you can delete it on the{" "}
        <Link href="/import/" className="underline">Import page</Link> and import again.
      </p>}
    </form>
  );
}

/** Plan page: set, use or remove the passphrase. */
export function ProtectCard() {
  const { vault, refreshVault, workspace } = useEngine();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const problem = p1 || p2 ? passphraseProblem(p1, p2) : null;

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: done });
      setP1("");
      setP2("");
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
    await refreshVault();
  };

  return (
    <Card title="Protect my fleet data with a passphrase"
      sub="Encrypts everything this browser keeps (sheets, documents and their scans) with AES-256. Useful on a shared or office computer.">
      {vault === "none" && (
        <div className="space-y-2">
          <input type="password" autoComplete="new-password" aria-label="New passphrase" value={p1} onChange={(e) => setP1(e.target.value)} placeholder="New passphrase (12+ characters)" className={field} />
          <input type="password" autoComplete="new-password" aria-label="Repeat passphrase" value={p2} onChange={(e) => setP2(e.target.value)} placeholder="Repeat it" className={field} />
          {problem && <p className="text-[12.5px] text-muted">{problem}</p>}
          <p className="text-[12.5px] text-muted">
            <span className="font-medium text-text">There is no reset.</span> The passphrase is never stored or sent anywhere, so nobody, including us,
            can recover the data without it. Keep it in your password manager.
          </p>
          <button disabled={!!problem || !p1 || busy} className={primary}
            onClick={() => run(() => protectWorkspace(p1), workspace ? "Protected. Your fleet data is now encrypted on this device." : "Protected. Anything you import from now on is encrypted on this device.")}>
            <ShieldCheck size={15} /> {busy ? "Encrypting…" : "Protect"}
          </button>
        </div>
      )}
      {vault === "unlocked" && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-[13.5px]"><LockKey size={18} className="text-good" /> Protected and unlocked in this tab.</p>
          <div className="flex flex-wrap gap-2">
            <button className={primary} onClick={() => { lockVault(); location.reload(); }}><LockSimple size={15} /> Lock now</button>
            <button disabled={busy} className={quiet} onClick={() => run(unprotectWorkspace, "Protection removed. Your fleet data is stored unencrypted again.")}>Remove protection</button>
          </div>
          <p className="text-[12.5px] text-muted">The fleet locks again whenever this tab is closed or reloaded.</p>
        </div>
      )}
      {vault === "locked" && <p className="text-[13.5px] text-muted">Locked. Enter the passphrase in the bar at the top of the page.</p>}
      {msg && <p className="mt-2 text-[12.5px]" style={{ color: msg.ok ? "var(--good)" : "var(--bad)" }}>{msg.text}</p>}
    </Card>
  );
}
