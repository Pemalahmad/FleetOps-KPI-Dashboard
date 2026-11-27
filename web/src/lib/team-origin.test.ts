import { expect, it } from "vitest";
import { teamConfiguration } from "./team-origin.mjs";

it("allows only a configured project origin paired with a publishable key", () => {
  const origin = "https://fleetopstestfixturex.supabase.co";
  const key = "sb_publishable_fixture_001";
  expect(teamConfiguration(undefined, undefined)).toBe("");
  expect(teamConfiguration(origin + "/", key)).toBe(origin);
  for (const url of [origin + "/rest/v1", origin + ".outside.test", origin + " https://outside.test",
    origin.replace("https:", "http:"), "https://user@" + new URL(origin).host]) {
    expect(() => teamConfiguration(url, key)).toThrow("one HTTPS Supabase project");
  }
  expect(() => teamConfiguration(origin, undefined)).toThrow("publishable API key");
  expect(() => teamConfiguration(origin, "sb_secret_fixture_001")).toThrow("publishable API key");
});
