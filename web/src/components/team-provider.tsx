"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { teamClient, type Team, type TeamCase, type TeamMember, type TeamNotification } from "@/lib/team-cases";

const POLL_MS = 15_000;
const EMPTY = { teams: [] as Team[], members: [] as TeamMember[], cases: [] as TeamCase[], inbox: [] as TeamNotification[], user: "", scope: "" };

function useTeamState() {
  const [session, setSession] = useState<Session | null>(null);
  const [teamId, selectTeam] = useState("");
  const [data, setData] = useState(EMPTY);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const desktopSeen = useRef(new Set<number>());
  const user = session?.user.id ?? "";
  const refresh = useCallback(async () => {
    if (!teamClient || !user) return;
    const request = ++generation.current;
    const [teams, inbox, cases, members] = await Promise.all([
      teamClient.from("fleet_teams").select("id,name").order("name"),
      teamClient.from("fleet_case_notifications").select("id,team_id,case_id,event_type,created_at,read_at")
        .eq("recipient_id", user).order("id", { ascending: false }).limit(100),
      teamId ? teamClient.from("fleet_team_cases").select("*").eq("team_id",teamId).order("updated_at",{ ascending: false }).limit(500) : null,
      teamId ? teamClient.from("fleet_team_members").select("team_id,user_id,email,role").eq("team_id",teamId).order("email") : null,
    ]);
    if (request !== generation.current) return;
    const failure = teams.error ?? inbox.error ?? cases?.error ?? members?.error;
    if (failure) { setError(failure.message); return; }
    setError("");
    const available = teams.data ?? [];
    if (!available.some((team) => team.id === teamId)) selectTeam(available[0]?.id ?? "");
    setData({ teams: available, cases: cases?.data ?? [], members: members?.data ?? [], inbox: inbox.data ?? [], user, scope: teamId });
  }, [teamId, user]);

  useEffect(() => {
    const listener = teamClient?.auth.onAuthStateChange((_event, value) => {
      if (value?.user.id !== user) {
        generation.current += 1;
        desktopSeen.current.clear();
      }
      setSession(value);
    });
    return () => listener?.data.subscription.unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const scheduled = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    return () => { generation.current += 1; window.clearTimeout(scheduled); window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [refresh, user]);

  const ownData = user && user === data.user ? data : EMPTY;
  const inbox = ownData.inbox;
  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const item of inbox) {
      if (item.read_at || desktopSeen.current.has(item.id)) continue;
      desktopSeen.current.add(item.id);
      const body = item.event_type === "assigned" ? "A FleetOps case was assigned to you." : "A FleetOps case needs overdue follow-up.";
      try { new Notification("FleetOps team cases", { body, tag: "fleetops-case-" + item.id }); } catch { /* Inbox remains available on devices without desktop notifications. */ }
    }
  }, [inbox]);

  const markRead = useCallback(async (id: number) => {
    if (!teamClient) return;
    const { error } = await teamClient.rpc("fleet_mark_read", { p_id: id });
    if (error) throw new Error(error.message);
    await refresh();
  }, [refresh]);

  return useMemo(() => ({
    ...(ownData.scope === teamId ? ownData : { ...ownData, cases: EMPTY.cases, members: EMPTY.members }),
    session, teamId, selectTeam, refresh, markRead, error: user ? error : "",
  }), [ownData, session, teamId, refresh, markRead, user, error]);
}

const TeamContext = createContext<ReturnType<typeof useTeamState> | null>(null);
export function TeamProvider({ children }: { children: ReactNode }) {
  return <TeamContext.Provider value={useTeamState()}>{children}</TeamContext.Provider>;
}
export function useTeam() {
  const team = useContext(TeamContext);
  if (!team) throw new Error("TeamProvider is required.");
  return team;
}
