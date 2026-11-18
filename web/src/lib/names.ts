/** Display form of a free-text name: trimmed, single-spaced, and title-cased when it arrived in one case. */
export function cleanName(raw: string | null | undefined): string | null {
  const t = raw?.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t;
  return t.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())
    .replace(/\b(Ev|Phev|Hev|Bev|Suv|Awd|Fwd|Rwd|4wd|Gt|Rs|Xl|Lx|Ex|Se|Le|Xle|Gl|Gls)\b/g, (m) => m.toUpperCase());
}
/** Remove a leading parent name ("Toyota Camry" under Toyota is "Camry"). */
export function withoutPrefix(name: string, parent: string) {
  const re = new RegExp("^" + parent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\-]+", "i");
  const rest = name.replace(re, "");
  return rest && rest !== name ? rest : name;
}
