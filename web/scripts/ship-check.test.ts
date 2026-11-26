import { describe, expect, it } from "vitest";
import {
  attributionLines, briefDrift, changelogVerdict, countClaims, countMismatches, countSql, formatReport, gifScenes,
  localRefs, unreleasedEntries,
} from "./ship-check.mjs";

describe("unreleasedEntries", () => {
  it("returns the bullets and sub-headings under Unreleased, stopping at the next version", () => {
    const md = "# Changelog\n\n## Unreleased\n\n### Replace or keep\n- New page.\n  more text\n\n## 0.5.0 (2026-11-01)\n- Old.\n";
    expect(unreleasedEntries(md)).toEqual(["### Replace or keep", "- New page."]);
  });
  it("is empty for an empty Unreleased and null when the section is missing", () => {
    expect(unreleasedEntries("## Unreleased\n\n## 0.5.0\n- Old.")).toEqual([]);
    expect(unreleasedEntries("## 0.5.0\n- Old.")).toBeNull();
  });
});

describe("changelogVerdict", () => {
  const entries = ["- New page."];
  it.each([
    [{ entries: null, ahead: 2, changedFiles: [] }, "FAIL"],
    [{ entries: [], ahead: 2, changedFiles: ["CHANGELOG.md"] }, "FAIL"],
    [{ entries, ahead: 2, changedFiles: ["README.md"] }, "FAIL"],
    [{ entries, ahead: 2, changedFiles: ["CHANGELOG.md", "README.md"] }, "PASS"],
    [{ entries, ahead: 0, changedFiles: [] }, "PASS"],
    [{ entries: [], ahead: 0, changedFiles: [] }, "SKIP"],
    [{ entries, ahead: null, changedFiles: [] }, "PASS"],
    [{ entries: [], ahead: null, changedFiles: [] }, "SKIP"],
  ])("%j -> %s", (input, status) => {
    expect(changelogVerdict(input).status).toBe(status);
  });
});

describe("localRefs", () => {
  it("collects local images, links, posters and src, ignoring URLs, anchors and code", () => {
    const md = [
      '<img src="docs/social-preview.png" alt="x" />',
      "[![CI](https://github.com/x/badge.svg)](https://github.com/x)",
      "[Run locally](#run-locally) · [Licence](LICENSE.md) · [Pilot](docs/CASE_STUDY.md#four-week-depot-pilot)",
      "[![Poster](docs/walkthrough-poster.jpg)](docs/walkthrough.mp4)",
      "![GIF](./docs/web-overview.gif) and `![not real](docs/missing.gif)`",
      "```bash\ncat docs/also-missing.png](x)\n```",
      "[mail](mailto:someone@example.com)",
    ].join("\n");
    expect(localRefs(md)).toEqual([
      "LICENSE.md", "docs/CASE_STUDY.md", "docs/social-preview.png", "docs/walkthrough-poster.jpg", "docs/walkthrough.mp4",
      "docs/web-overview.gif",
    ]);
  });
});

describe("README counts", () => {
  const readme = "the same pipeline: **70 SQL models, 47 validation rules, and 29 data tests**.\n" +
    'V --> D[("DuckDB-WASM<br/>70 SQL models")]\nV["47 validation rules"]\nT["29 data tests"]';
  it("reads every count claim, in prose and in diagrams", () => {
    expect(countClaims(readme)).toEqual([
      { key: "models", label: "SQL models", n: 70 }, { key: "validation", label: "validation rules", n: 47 },
      { key: "tests", label: "data tests", n: 29 }, { key: "models", label: "SQL models", n: 70 },
      { key: "validation", label: "validation rules", n: 47 }, { key: "tests", label: "data tests", n: 29 },
    ]);
  });
  it("reads the generated catalog's bold counts", () => {
    expect(countClaims("**71 models** in three layers, **47 validation rules**, **30 data tests**.").map((c) => c.n)).toEqual([71, 47, 30]);
  });
  it("counts only .sql files in the three folders", () => {
    expect(countSql([
      "fleetkpi/sql/models/staging/stg_a.sql", "fleetkpi/sql/models/marts/mart_b.sql", "fleetkpi/sql/validation/v1.sql",
      "fleetkpi/sql/tests/t1.sql", "fleetkpi/sql/README.md", "fleetkpi/sql/macros/m.sql", "fleetkpi/sql/models/x.yml",
    ])).toEqual({ models: 2, validation: 1, tests: 1 });
  });
  it("reports each claim that disagrees with the files", () => {
    expect(countMismatches(countClaims(readme), { models: 71, validation: 47, tests: 30 }, "README")).toEqual([
      "README says 70 SQL models, fleetkpi/sql has 71", "README says 29 data tests, fleetkpi/sql has 30",
      "README says 70 SQL models, fleetkpi/sql has 71", "README says 29 data tests, fleetkpi/sql has 30",
    ]);
    expect(countMismatches(countClaims(readme), { models: 70, validation: 47, tests: 29 }, "README")).toEqual([]);
  });
});

describe("gifScenes", () => {
  it("maps each GIF to the scene that records it", () => {
    const src = "const SCENES = {\n  garage: () => record('web-garage', '/', async (page) => {}),\n" +
      "  replace: () => record(\"web-replace-or-keep\", '/replace/', async () => {}),\n};";
    expect(gifScenes(src)).toEqual({ "docs/web-garage.gif": "garage", "docs/web-replace-or-keep.gif": "replace" });
  });
});

describe("attributionLines", () => {
  it("flags co-author trailers and tool credits, and nothing else", () => {
    const commits = [
      { sha: "aaaaaaa1", message: "Add a replace-or-keep planner\n\nPrices keep against replace." },
      { sha: "bbbbbbb2", message: "Fix import\n\nCo-Authored-By: Someone <x@example.com>" },
      { sha: "ccccccc3", message: "Docs\n\n\u{1F916} Generated with some tool" },
      { sha: "ddddddd4", message: "Explain co-authored work in the README" },
    ];
    expect(attributionLines(commits)).toEqual([
      "bbbbbbb: Co-Authored-By: Someone <x@example.com>", "ccccccc: \u{1F916} Generated with some tool",
    ]);
  });
});

describe("briefDrift", () => {
  it("names briefs that are missing on one side or differ", () => {
    expect(briefDrift({ "a.md": "x", "b.md": "y", "c.md": "z" }, { "a.md": "x", "b.md": "changed", "d.md": "w" }))
      .toEqual(["b.md differs", "c.md only in .agents/", "d.md only in .claude/agents/"]);
    expect(briefDrift({ "a.md": "x" }, { "a.md": "x" })).toEqual([]);
  });
});

describe("formatReport", () => {
  it("prints one aligned line per check and the totals", () => {
    expect(formatReport([
      { name: "changelog", status: "PASS", detail: "2 Unreleased lines" },
      { name: "readme-counts", status: "FAIL", detail: "README says 70 SQL models, fleetkpi/sql has 71" },
      { name: "commands", status: "SKIP", detail: "--fast" },
    ])).toBe([
      "PASS changelog      2 Unreleased lines",
      "FAIL readme-counts  README says 70 SQL models, fleetkpi/sql has 71",
      "SKIP commands       --fast",
      "1 failed, 1 passed, 1 skipped",
    ].join("\n"));
  });
});
