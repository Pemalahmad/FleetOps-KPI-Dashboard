"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useEngine } from "./engine-provider";
import { useGarageOperations } from "./garage/use-garage";
import { useTeam } from "./team-provider";
import { caseOwner } from "@/lib/garage-escalations";
import {
  changeTeamCase, ehsSource, escalationSource, publishTeamCase, shareableEhs, shareableEscalation, verifiedTeamProof,
} from "@/lib/team-cases";

/** A linked fleet publishes case summaries. The server owns shared assignments, notes and EHS transitions. */
export function TeamCaseSync() {
  const engine = useEngine();
  const { state } = useGarageOperations();
  const { session, teamId, teams, members, cases, refresh } = useTeam();
  const user = session?.user.id;
  const scope = engine.status === "ready" && engine.dataset === "mine" && user && state.sharedTeamId === teamId
    && teams.some((team) => team.id === teamId) && members.some((member) => member.user_id === user) ? teamId : "";
  const [error, setError] = useState("");
  const busy = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const latestScope = useRef("");
  useEffect(() => {
    latestScope.current = scope;
    return () => { latestScope.current = ""; };
  }, [scope]);

  useEffect(() => {
    if (!scope || busy.current) return;
    const remote = new Map(cases.map((item) => [item.source_key, item]));
    const updates: (() => Promise<unknown>)[] = [];
    for (const item of state.ehsCases ?? []) {
      if (item.stage !== "closed" && !remote.has(ehsSource(item))) {
        updates.push(() => publishTeamCase(scope, shareableEhs(item)));
      }
    }
    for (const item of state.complianceEscalations ?? []) {
      const known = remote.get(escalationSource(item));
      if (!known && item.stage !== "closed") {
        updates.push(() => publishTeamCase(scope, shareableEscalation(item, caseOwner(item, state.reminderOwners))));
        continue;
      }
      const proof = verifiedTeamProof(item);
      if (known && known.stage !== "closed" && proof) updates.push(() => changeTeamCase({
        p_id: known.id, p_revision: known.revision, p_stage: "closed", p_owner: known.owner_id, p_manager: known.manager_id,
        p_follow_up: known.follow_up, p_reporting: null, p_reporting_reference: null, p_proof: proof,
        p_note: "Recorded the verified replacement document from the linked fleet.",
      }));
    }
    if (updates.length === 0) return;
    busy.current = true;
    void (async () => {
      try {
        for (const update of updates) {
          if (latestScope.current !== scope) return;
          await update();
        }
        if (latestScope.current === scope) setError("");
      } catch (err) {
        if (latestScope.current === scope) setError(err instanceof Error ? err.message : "Team case sync failed.");
        return;
      } finally {
        busy.current = false;
      }
      if (latestScope.current === scope && updates.length) await refresh();
    })();
  }, [scope, cases, state.ehsCases, state.complianceEscalations, state.reminderOwners, refresh, attempt]);

  if (!scope || !error) return null;
  return <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
    <p role="alert" className="text-bad">Team case sync could not finish. {error}</p>
    <button className="ops-button" onClick={() => setAttempt((value) => value + 1)}>Retry sync</button>
  </div>;
}

export function TeamCaseLink({ source, teamId }: { source: string; teamId: string | undefined }) {
  const team = useTeam();
  if (!teamId) return null;
  const shared = team.teamId === teamId ? team.cases.find((item) => item.source_key === source) : null;
  return <Link href={shared ? `/team-cases/#case-${shared.id}` : "/team-cases/"} className="ops-button mt-3 inline-flex">
    {shared ? "Open shared case" : "Open team cases"}
  </Link>;
}
