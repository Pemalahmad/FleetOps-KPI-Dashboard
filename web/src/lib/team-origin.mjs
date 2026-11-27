// Build-time configuration. A release with no team project stays fully local.
export function teamOrigin(value) {
  if (!value) return "";
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(value)) {
    throw new Error("NEXT_PUBLIC_FLEETOPS_TEAM_URL must name one HTTPS Supabase project.");
  }
  return value.replace(/\/$/, "");
}

export function teamConfiguration(url, key) {
  const origin = teamOrigin(url);
  if (Boolean(origin) !== Boolean(key) || (key && !/^sb_publishable_[a-zA-Z0-9_-]+$/.test(key))) {
    throw new Error("Configure both a FleetOps team project URL and its publishable API key.");
  }
  return origin;
}
