import { Marked } from "marked";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Bundled procedures support Markdown, never executable HTML or external images. */
const parser = new Marked({ renderer: {
  html: ({ text }) => escape(text),
  link({ href, tokens }) {
    const label = this.parser.parseInline(tokens);
    const clean = !/[\s\\\u0000-\u001f]/.test(href);
    const safe = clean && (/^(?:https?:\/\/|mailto:|#)/i.test(href) || (!/[:&]|^\/\//.test(href)));
    return safe ? `<a href="${escape(href)}" rel="noopener noreferrer">${label}</a>` : label;
  },
  image: ({ text }) => escape(text),
} });

export const markdown = (text: string) => parser.parse(text, { async: false }) as string;
export const inlineMarkdown = (text: string) => parser.parseInline(text, { async: false }) as string;
