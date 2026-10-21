import type { RecurringBlock, Section } from "./types";

// Words too generic to identify a section on their own (they still count inside a
// full multi-word name like "Check on").
const WEAK = new Set(["lab", "on", "the", "and", "of", "a", "to", "cs", "up", "ups", "check", "weekly", "prep", "side"]);

export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[·•|/\\,.;:!?()[\]"]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(s: string): string[] {
  return norm(s).split(" ").filter(Boolean);
}

/** A matchable phrase plus the casing to use when rewriting it in a title. */
interface Key {
  phrase: string;
  canonical: string;
  weight: number;
}

function keysFor(name: string, aliases: string[]): Key[] {
  const keys: Key[] = [];
  const add = (raw: string, weight: number) => {
    const phrase = norm(raw);
    if (!phrase) return;
    if (!phrase.includes(" ") && WEAK.has(phrase)) return;
    if (phrase.length < 2) return;
    keys.push({ phrase, canonical: raw.trim(), weight });
  };
  add(name, 6);
  for (const part of name.split("·")) {
    add(part, 4);
    for (const tok of part.trim().split(/\s+/)) add(tok, 0);
  }
  for (const a of aliases) add(a, 3);
  return keys;
}

/** Blocks match on their full name, or the name minus filler ("Home Depot weekly" -> "Home Depot"). */
function blockKeys(name: string): Key[] {
  const trimmed = name
    .split(/\s+/)
    .filter((w) => !WEAK.has(w.toLowerCase()))
    .join(" ");
  const keys = keysFor(name, []).filter((k) => k.weight > 0);
  if (trimmed && trimmed !== name) keys.push({ phrase: norm(trimmed), canonical: trimmed, weight: 4 });
  return keys;
}

export function sectionAliases(s: Pick<Section, "aliases">): string[] {
  return s.aliases
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
}

export interface SectionMatch {
  section: Section | null;
  /** set when the text names a recurring block that has no section yet (e.g. "vip") */
  suggest: { name: string; area: string } | null;
  phrase: string;
  canonical: string;
  score: number;
}

function hasPhrase(haystack: string, phrase: string): boolean {
  return ` ${haystack} `.includes(` ${phrase} `);
}

function scoreKeys(text: string, keys: Key[]): { key: Key; score: number } | null {
  const hay = norm(text);
  const hayWords = hay.split(" ");
  let best: { key: Key; score: number } | null = null;
  for (const key of keys) {
    let score = 0;
    if (hasPhrase(hay, key.phrase)) {
      score = key.phrase.length + key.weight;
    } else if (!key.phrase.includes(" ") && key.phrase.length >= 4 && !/^\d+$/.test(key.phrase)) {
      // prefix in either direction: "invest" ~ "investments", "physics" ~ "phys"
      for (const w of hayWords) {
        if (w.length < 3 || WEAK.has(w)) continue;
        if (key.phrase.startsWith(w) || (w.startsWith(key.phrase) && w.length - key.phrase.length <= 3)) {
          score = Math.max(score, Math.min(w.length, key.phrase.length) - 1);
        }
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { key, score };
  }
  return best;
}

/**
 * Best section for a short phrase. Falls back to recurring blocks: a block whose
 * kind names a section ("Home Depot weekly" -> Product@GT) maps there, and a block
 * with no section at all ("VIP") comes back as a suggestion to create one.
 */
export function matchSection(text: string, sections: Section[], blocks: RecurringBlock[] = []): SectionMatch | null {
  const live = sections.filter((s) => !s.archived);
  let best: SectionMatch | null = null;
  const consider = (m: SectionMatch) => {
    if (!best || m.score > best.score) best = m;
  };

  for (const s of live) {
    const hit = scoreKeys(text, keysFor(s.name, sectionAliases(s)));
    if (hit) consider({ section: s, suggest: null, phrase: hit.key.phrase, canonical: hit.key.canonical, score: hit.score });
  }

  for (const b of blocks) {
    const hit = scoreKeys(text, blockKeys(b.name));
    if (!hit) continue;
    const viaKind = live.find((s) => norm(s.name) === norm(b.kind));
    const viaName = live.find((s) => scoreKeys(b.name, keysFor(s.name, sectionAliases(s))));
    const target = viaKind ?? viaName;
    if (target) {
      consider({ section: target, suggest: null, phrase: hit.key.phrase, canonical: hit.key.canonical, score: hit.score - 0.5 });
    } else {
      consider({
        section: null,
        suggest: { name: b.name, area: b.survivesDaysOff ? "Clubs & open questions" : "Coursework" },
        phrase: hit.key.phrase,
        canonical: hit.key.canonical,
        score: hit.score - 0.5,
      });
    }
  }
  return best;
}

/** Replace the matched phrase in a title with its canonical casing ("home depot" -> "Home Depot"). */
export function recase(title: string, m: Pick<SectionMatch, "phrase" | "canonical"> | null): string {
  if (!m || !m.canonical || norm(m.canonical) !== m.phrase) return title;
  const pattern = m.phrase
    .split(" ")
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s\\-–·]+");
  return title.replace(new RegExp(`(^|[^\\w@])(${pattern})(?=$|[^\\w@])`, "i"), (_, pre) => pre + m.canonical);
}

const STOP = new Set(["the", "a", "an", "my", "to", "for", "of", "on", "with", "and", "up"]);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\w/@&\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w && !STOP.has(w));
}

/** Fraction of the query's words found in the candidate (prefix matches count half). */
export function similarity(query: string, candidate: string): number {
  const q = tokens(query);
  if (!q.length) return 0;
  const c = tokens(candidate);
  let score = 0;
  for (const w of q) {
    if (c.includes(w)) score += 1;
    else if (w.length >= 3 && c.some((x) => x.startsWith(w) || (x.length >= 3 && w.startsWith(x)))) score += 0.5;
  }
  return score / q.length;
}
