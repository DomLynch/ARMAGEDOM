import test from "node:test";
import assert from "node:assert/strict";
import { MAX_NAME, cleanName, displayName, firstName, guestName } from "./names.js";

const A = "00000000-0000-4000-8000-00000000000a",
  B = "00000000-0000-4000-8000-00000000000b";

test("guest names: Survivor-NNNN, stable per account, different accounts differ (almost always)", () => {
  assert.match(guestName(A), /^Survivor-\d{4}$/);
  assert.equal(guestName(A), guestName(A));
  assert.notEqual(guestName(A), guestName(B));
  assert.ok(guestName(A).length <= MAX_NAME);
});

test("clean: control and invisible characters go, whitespace collapses, 16 characters at most, never an email", () => {
  const chars = (...codes) => String.fromCodePoint(...codes); // the source stays plain ASCII
  const NUL = chars(0), BEL = chars(7), RLO = chars(0x202e), ZWSP = chars(0x200b), BOM = chars(0xfeff), SEP = chars(0x2028), SOFT = chars(0xad);
  assert.equal(cleanName(`  Ada${NUL}${BEL} ${RLO}Lovelace  `), "Ada Lovelace");
  assert.equal(cleanName(`Zero${ZWSP}Width`), "ZeroWidth");
  assert.equal(cleanName(`${BOM}Ada${SEP}${SOFT}`), "Ada");
  assert.equal(cleanName("a".repeat(40)), "a".repeat(16));
  assert.equal([...cleanName(chars(0x1f600).repeat(40))].length, 16, "counted in characters, not bytes");
  assert.equal(cleanName("name@example.com"), null);
  for (const empty of ["", "   ", NUL + ZWSP, null, undefined, 42, {}, ["x"]]) assert.equal(cleanName(empty), null, String(empty));
});

test("first name: given_name, else the first word of full_name or name; nothing else of the profile; guests have none", () => {
  const user = (meta, extra = {}) => ({ id: A, email: "ada.lovelace@example.com", user_metadata: meta, ...extra });
  assert.equal(firstName(user({ given_name: "Ada", full_name: "Ada Lovelace" })), "Ada");
  assert.equal(firstName(user({ full_name: "Ada Lovelace" })), "Ada");
  assert.equal(firstName(user({ name: "Ada King Lovelace" })), "Ada");
  assert.equal(firstName(user({ given_name: "Ada Augusta" })), "Ada", "a double given name shows the first word only");
  assert.equal(firstName(user({ given_name: "ada@example.com" })), null, "an email in a name field is not shown");
  assert.equal(firstName(user({})), null, "the email address is never a fallback");
  assert.equal(firstName(user({ given_name: "Ada" }, { is_anonymous: true })), null);
  assert.equal(firstName(null), null);
  assert.equal(firstName(user({ given_name: "A".repeat(50) })).length, 16);
});

test("display name: the hint when there is one, else the guest name", () => {
  assert.equal(displayName(A, "Ada"), "Ada");
  assert.equal(displayName(A, null), guestName(A));
  assert.equal(displayName(A, "x@y.z"), guestName(A));
});
