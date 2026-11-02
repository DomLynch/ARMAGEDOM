// The name other players see over a player's head. Never an email, never a full name, at most 16 characters, no control characters.
// A guest gets "Survivor-NNNN", stable for their account (derived from the account id, so a reconnect keeps it). A signed-in player gets
// their first name from Supabase's profile (given_name, else the first word of full_name or name). Nothing else of the profile is read.
import { createHash } from "node:crypto";

export const MAX_NAME = 16;
const INVISIBLE_RANGES = [
  [0x00, 0x1f], // C0 controls
  [0x7f, 0x9f], // DEL and C1 controls
  [0xad, 0xad], // soft hyphen
  [0x200b, 0x200f], // zero-width space and joiners, direction marks
  [0x2028, 0x202f], // line and paragraph separators, bidirectional embeddings and overrides, narrow no-break space
  [0x2060, 0x206f], // word joiner, invisible operators, bidirectional isolates
  [0xfeff, 0xfeff], // byte order mark
];
const isInvisible = (char) => INVISIBLE_RANGES.some(([low, high]) => char.codePointAt(0) >= low && char.codePointAt(0) <= high);

/** "Survivor-4821": four digits from a hash of the account id. */
export function guestName(account) {
  const n = createHash("sha256").update(String(account)).digest().readUInt32BE(0) % 10000;
  return `Survivor-${String(n).padStart(4, "0")}`;
}

/** A name safe to show, or null if there is nothing usable (empty, or looks like an email address). */
export function cleanName(raw) {
  if (typeof raw !== "string") return null;
  const text = [...raw].filter((char) => !isInvisible(char)).join("").replace(/\s+/g, " ").trim();
  if (!text || text.includes("@")) return null;
  return [...text].slice(0, MAX_NAME).join("").trim() || null;
}

/** The first name from a Supabase user object (the JSON of /auth/v1/user); null for a guest or when there is none. */
export function firstName(user) {
  if (!user || user.is_anonymous) return null;
  const meta = user.user_metadata ?? {};
  const given = cleanName(meta.given_name);
  if (given) return cleanName(given.split(" ")[0]);
  for (const full of [meta.full_name, meta.name]) {
    const word = typeof full === "string" ? cleanName(full.trim().split(/\s+/)[0]) : null;
    if (word) return word;
  }
  return null;
}

export const displayName = (account, hint) => cleanName(hint) ?? guestName(account);
