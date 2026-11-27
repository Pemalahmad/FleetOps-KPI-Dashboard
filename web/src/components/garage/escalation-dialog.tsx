"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useState } from "react";
import { FileText, X } from "@phosphor-icons/react";
import { REMINDER_LABELS } from "@/lib/garage-command";
import { caseOwner, ESCALATION_STAGES, recordEscalationUpdate, type ComplianceEscalation } from "@/lib/garage-escalations";
import { TeamCaseLink } from "../team-case-sync";
import { useTeam } from "../team-provider";
import { escalationSource, TEAM_STAGES } from "@/lib/team-cases";
import type { GarageState } from "@/lib/garage";

export function EscalationDialog({ item, owners, onClose, change, saving, error, linked }: {
  item: ComplianceEscalation;
  owners: GarageState["reminderOwners"];
  linked?: string;
  onClose: () => void;
  change: (update: (state: GarageState) => GarageState) => Promise<boolean>;
  saving: boolean;
  error: string | null;
}) {
  const [owner, setOwner] = useState(() => caseOwner(item, owners));
  const [manager, setManager] = useState(item.manager);
  const [followUp, setFollowUp] = useState(item.followUp);
  const [actor, setActor] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const team = useTeam();
  const shared = linked && team.teamId === linked ? team.cases.find((record) => record.source_key === escalationSource(item)) : undefined;
  const closed = item.stage === "closed";
  const sharedClosed = shared?.stage === "closed";
  const save = async (stage: ComplianceEscalation["stage"]) => {
    if (stage === "closed") return;
    setMessage("");
    if (await change((state) => recordEscalationUpdate(state, item.id, {
      owner, manager, followUp, actor, note, stage,
    }, new Date().toISOString()))) {
      setNote("");
      setMessage("Escalation update saved.");
    }
  };
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="garage-overlay" />
        <Dialog.Content className="garage-dialog">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-xl font-semibold [overflow-wrap:anywhere]">{item.plate} · {REMINDER_LABELS[item.kind]}</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted">{item.country} · Due <time className="font-mono" dateTime={item.dueOn}>{item.dueOn}</time> · {shared ? TEAM_STAGES[shared.stage] : ESCALATION_STAGES[item.stage]}</Dialog.Description>
            </div>
            <Dialog.Close disabled={saving} aria-label="Close escalation" className="garage-icon-button"><X size={20} /></Dialog.Close>
          </div>
          {closed ? <section className="garage-readiness-panel mt-5" aria-label="Verified document">
            <h3 className="text-sm font-semibold">Verified document</h3>
            <p className="mt-1 break-all text-sm">{item.proof?.name}</p>
            {item.proof?.reference && <p className="mt-1 text-xs text-muted">Reference {item.proof.reference}</p>}
            {item.proof && <p className="mt-1 text-xs text-muted">Valid through <time className="font-mono" dateTime={item.proof.expiresOn}>{item.proof.expiresOn}</time></p>}
            <p className="mt-2 text-xs text-muted">Owner {caseOwner(item, owners) || "Unassigned"} · Manager {item.manager || "Unassigned"}</p>
          </section> : shared ? <div className="mt-4">
            <p className="text-sm text-muted">{sharedClosed ? "The team has a verified document reference." : "The team case holds the assignments and follow-up."}</p>
            {!sharedClosed && <Link href="/documents/" className="ops-button mt-2 inline-flex gap-2"><FileText size={16} aria-hidden="true" /> Upload updated document</Link>}
          </div> : <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="garage-field">Case owner<input className="ops-input" maxLength={120} value={owner} onChange={(e) => setOwner(e.target.value)} disabled={saving} /></label>
              <label className="garage-field">Escalated to<input className="ops-input" maxLength={120} value={manager} onChange={(e) => setManager(e.target.value)} disabled={saving} /></label>
              <label className="garage-field">Follow-up date<input className="ops-input" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} disabled={saving} /></label>
              <label className="garage-field">Updated by<input className="ops-input" maxLength={120} value={actor} onChange={(e) => setActor(e.target.value)} disabled={saving} /></label>
              <label className="garage-field sm:col-span-2">Update notes<textarea className="ops-input min-h-24" maxLength={2000}
                value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} /></label>
            </div>
            <p className="mt-3 text-xs text-muted">Record the owner, the manager you contacted and what happens next.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="ops-button" disabled={saving || !actor.trim()}
                onClick={() => void save(item.stage)}>Save update</button>
              {item.stage === "open" && <button className="garage-primary" disabled={saving || !owner.trim() || !manager.trim() || !actor.trim()}
                onClick={() => void save("escalated")}>Record escalation</button>}
              {item.stage === "escalated" && <button className="garage-primary" disabled={saving || !owner.trim() || !manager.trim() || !actor.trim()}
                onClick={() => void save("awaiting_document")}>Mark awaiting document</button>}
            </div>
            <p className="mt-4 text-xs text-muted">The case stays open until a confirmed, current document matches this vehicle.</p>
            <Link href="/documents/" className="ops-button mt-2 inline-flex gap-2"><FileText size={16} aria-hidden="true" /> Upload updated document</Link>
          </>}
          <TeamCaseLink source={escalationSource(item)} teamId={linked} />
          {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
          {message && !error && <p role="status" className="mt-3 text-sm text-good">{message}</p>}
          <section className="mt-5" aria-label="Escalation history">
            <h3 className="text-sm font-semibold">Case history</h3>
            <ol className="mt-2 divide-y divide-border">
              {[...item.history].reverse().map((event, index) => <li className="py-2 text-xs [overflow-wrap:anywhere]" key={item.history.length - index}>
                <p className="font-semibold">{ESCALATION_STAGES[event.stage]} · {event.by}</p>
                <time className="mt-1 block font-mono text-muted" dateTime={event.at}>{new Date(event.at).toLocaleString()}</time>
                {(event.owner || event.manager || event.followUp) && <p className="mt-1 text-muted">
                  {event.owner && <>Owner {event.owner} · </>}{event.manager && <>Manager {event.manager} · </>}
                  {event.followUp ? "Follow up " + event.followUp : "No follow-up date"}
                </p>}
                {event.note && <p className="mt-1 whitespace-pre-wrap">{event.note}</p>}
                {event.proof && <p className="mt-1 text-muted">{event.proof.name} · Valid through {event.proof.expiresOn}</p>}
              </li>)}
            </ol>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
