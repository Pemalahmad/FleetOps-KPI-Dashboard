import { describe, expect, it } from "vitest";
import { formatSummary, makeEntry, parseArgs, summarize } from "./log-papercut.mjs";

const NOW = new Date("2026-11-26T08:00:00Z");

describe("parseArgs", () => {
  it("reads --key value, --key=value and bare switches", () => {
    expect(parseArgs(["--area", "ship-feature", "--tried=npm run gifs", "--summary"]))
      .toEqual({ area: "ship-feature", tried: "npm run gifs", summary: true });
  });
});

describe("makeEntry", () => {
  const args = { area: "Ship-Feature", tried: "npm run gifs replace", expected: "one GIF", happened: "all GIFs changed", fix: "name the scene" };
  it("builds the JSON line with every field in order", () => {
    expect(JSON.stringify(makeEntry(args, NOW))).toBe(
      '{"time":"2026-11-26T08:00:00.000Z","area":"ship-feature","tried":"npm run gifs replace","expected":"one GIF",' +
      '"happened":"all GIFs changed","suggested_fix":"name the scene"}');
  });
  it("accepts --skill for the area and --suggested-fix for the fix", () => {
    const e = makeEntry({ skill: "refresh-readme-gifs", tried: "a", expected: "b", happened: "c", "suggested-fix": "d" }, NOW);
    expect([e.area, e.suggested_fix]).toEqual(["refresh-readme-gifs", "d"]);
  });
  it("names every missing field", () => {
    expect(() => makeEntry({ area: "ci", tried: " " }, NOW)).toThrow("missing --tried, --expected, --happened, --fix");
  });
});

describe("summarize", () => {
  const line = (area: string, time: string, fix: string) => JSON.stringify({ time, area, tried: "t", expected: "e", happened: "h", suggested_fix: fix });
  const log = [
    line("ship-feature", "2026-11-20T10:00:00Z", "print the merge SHA"),
    line("refresh-readme-gifs", "2026-11-21T10:00:00Z", "wait for data"),
    line("ship-feature", "2026-11-25T10:00:00Z", "print the merge SHA"),
    "not json",
    line("ship-feature", "2026-11-22T10:00:00Z", "fetch before ship-check"),
    "",
  ].join("\n");
  it("groups by area, most reported first, with the latest time and distinct fixes", () => {
    expect(summarize(log)).toEqual({
      bad: 1,
      areas: [
        { area: "ship-feature", count: 3, last: "2026-11-25T10:00:00Z", fixes: ["print the merge SHA", "fetch before ship-check"] },
        { area: "refresh-readme-gifs", count: 1, last: "2026-11-21T10:00:00Z", fixes: ["wait for data"] },
      ],
    });
  });
  it("prints the summary", () => {
    expect(formatSummary(summarize(log))).toBe([
      "ship-feature  3 reports, last 2026-11-25", "  - print the merge SHA", "  - fetch before ship-check",
      "refresh-readme-gifs  1 report, last 2026-11-21", "  - wait for data", "(1 unreadable line skipped)",
    ].join("\n"));
    expect(formatSummary(summarize(""))).toBe("No papercuts logged.");
  });
});
