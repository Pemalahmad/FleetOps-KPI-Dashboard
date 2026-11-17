import { describe, expect, it } from "vitest";
import { inlineMarkdown, markdown } from "./markdown";

describe("procedure Markdown boundary", () => {
  it("renders formatting while escaping raw HTML", () => {
    const html = markdown('**Review** <img src=x onerror="alert(1)"><script>alert(2)</script>');
    expect(html).toContain("<strong>Review</strong>");
    expect(html).not.toMatch(/<img|<script/);
  });
  it.each(["javascript:alert(1)", "data:text/html,test", "java&#x73;cript:alert(1)", "//evil.test", "java\tscript:alert(1)"])("rejects executable or ambiguous link %s", (href) => {
    expect(inlineMarkdown("[open](<" + href + ">)")).not.toContain("<a ");
  });
  it("allows local and HTTPS references without loading external images", () => {
    expect(inlineMarkdown("[source](https://example.com)")).toContain('href="https://example.com"');
    expect(inlineMarkdown("[contract](DATA_CONTRACT.md)")).toContain('href="DATA_CONTRACT.md"');
    expect(markdown("![tracker](https://evil.test/image)")).not.toContain("<img");
  });
});
