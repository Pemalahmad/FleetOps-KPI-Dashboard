"use client";

import { useEffect, useState } from "react";
import { BASE } from "@/components/engine-provider";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { markdown } from "@/lib/markdown";

const DOCS = [
  { id: "privacy", file: "PRIVACY.md", label: "Privacy Policy" },
  { id: "eula", file: "EULA.md", label: "EULA" },
  { id: "dmca", file: "DMCA.md", label: "Copyright & DMCA" },
] as const;
type DocId = (typeof DOCS)[number]["id"];

export default function LegalPage() {
  const [active, setActive] = useState<DocId>("privacy");
  const [html, setHtml] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  useEffect(() => {
    const fromHash = () => { const h = location.hash.slice(1); if (DOCS.some((d) => d.id === h)) setActive(h as DocId); };
    fromHash();
    addEventListener("hashchange", fromHash);
    return () => removeEventListener("hashchange", fromHash);
  }, []);
  useEffect(() => {
    let live = true;
    Promise.all(DOCS.map(async (d) => {
      const r = await fetch(BASE + "/content/" + d.file);
      if (!r.ok) throw new Error(d.file);
      return [d.id, markdown(await r.text())] as const;
    })).then((all) => { if (live) setHtml(Object.fromEntries(all)); }, () => { if (live) setError(true); });
    return () => { live = false; };
  }, []);
  return <>
    <PageHeader eyebrow="Legal" title="Privacy, licence terms and copyright"><p className="mt-2 max-w-2xl text-[14px] text-muted">FleetOps keeps your fleet data on your device. These documents also ship in the offline package.</p></PageHeader>
    <div role="tablist" aria-label="Legal documents" className="mb-5 flex flex-wrap gap-1.5">
      {DOCS.map((d) => <a key={d.id} role="tab" href={"#" + d.id} aria-selected={active === d.id}
        className={`rounded-full border px-3 py-1.5 text-[13px] transition active:scale-95 ${active === d.id ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-muted hover:text-text"}`}>{d.label}</a>)}
    </div>
    <Card className="p-5 md:p-8">
      {error ? <p className="text-sm text-bad">The documents could not be loaded. Reconnect and reload, or read them in the repository.</p>
        : html[active] ? <article role="tabpanel" className="prose-doc max-w-3xl" dangerouslySetInnerHTML={{ __html: html[active] }} />
        : <Skeleton height={384} />}
    </Card>
  </>;
}
