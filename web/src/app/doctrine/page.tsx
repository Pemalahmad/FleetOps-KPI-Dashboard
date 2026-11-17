"use client";

import { useEffect, useState } from "react";
import { marked } from "marked";
import { BASE } from "@/components/engine-provider";
import { Card, PageHeader, SectionTitle, Skeleton } from "@/components/ui";

interface Sop {
  file: string;
  meta: Record<string, string>;
  steps: string[];
  body: string;
}

function parseSop(file: string, text: string): Sop {
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta: Record<string, string> = {};
  for (const line of (fm?.[1] ?? "").split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const body = fm ? text.slice(fm[0].length) : text;
  const steps = [...body.matchAll(/^- \[ \] (.+)$/gm)].map((m) => m[1]);
  return { file, meta, steps, body };
}

const inline = (s: string) => marked.parseInline(s) as string;

export default function DoctrinePage() {
  const [doc, setDoc] = useState<string | null>(null);
  const [sops, setSops] = useState<Sop[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/content/DOCTRINE.md`).then((r) => r.text()).then((t) => setDoc(marked.parse(t.replace(/^# .*\n/, "")) as string));
    fetch(`${BASE}/content/sops.json`).then((r) => r.json()).then(async (files: string[]) => {
      setSops(await Promise.all(files.map(async (f) => parseSop(f, await (await fetch(`${BASE}/content/${f}`)).text()))));
    });
  }, []);

  return (
    <>
      <PageHeader eyebrow="Doctrine" title="The Three Clocks Doctrine">
        A vehicle in the workshop runs three clocks at once. Manage all three, or someone pays for the one you forgot.
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="p-6 md:p-8">
          {doc ? <article className="prose-doc" dangerouslySetInnerHTML={{ __html: doc }} /> : <Skeleton height={600} />}
        </Card>

        <div>
          <SectionTitle sub="Law 5: every flag has an owner within 48 hours.">Standard operating procedures</SectionTitle>
          {sops ? (
            <div className="space-y-3">
              {sops.map((s) => (
                <Card key={s.file} className="p-4">
                  <button className="w-full text-left" onClick={() => setOpen(open === s.file ? null : s.file)} aria-expanded={open === s.file}>
                    <p className="text-[12px] font-semibold text-accent">{s.meta.id}</p>
                    <p className="text-[15px] font-semibold">{s.meta.title}</p>
                    <p className="mt-1 text-[12.5px] text-muted"><b className="font-medium text-text">Owner</b> {s.meta.owner} · <b className="font-medium text-text">Cadence</b> {s.meta.cadence}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted"><b className="font-medium text-text">Trigger</b> {s.meta.trigger}</p>
                  </button>
                  {open === s.file && (
                    <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px] text-muted">
                      {s.steps.map((st, i) => <li key={i} dangerouslySetInnerHTML={{ __html: inline(st) }} />)}
                    </ol>
                  )}
                </Card>
              ))}
            </div>
          ) : <Skeleton height={500} />}
        </div>
      </div>
    </>
  );
}
