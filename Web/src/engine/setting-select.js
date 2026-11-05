// One labelled <select> row in the menu's Settings panel, built by script so index.html needs no markup for it. The row goes right after
// the View preset row (its parent), else at the end of #menu-settings; with neither on the page (a test, a stripped page) nothing is made.
// The same shape as the View preset select (engine/game-feel.js): the label text and options come from data, the change event goes
// through the session's owner registry (`listen`) so its removal is automatic, and `set` moves the shown value without firing a change.
export function addSettingSelect(doc, { id, label, options, value, onChange, listen, after = "view-preset" }) {
  const host = doc?.getElementById?.("menu-settings");
  const anchor = doc?.getElementById?.(after)?.parentElement;
  if (!host && !anchor) return null;
  const row = doc.createElement("div"),
    tag = doc.createElement("label"),
    select = doc.createElement("select");
  tag.textContent = label;
  tag.setAttribute("for", id);
  select.id = id;
  for (const choice of options) {
    const option = doc.createElement("option");
    option.value = choice.value;
    option.textContent = choice.text;
    select.append(option);
  }
  select.value = value;
  row.append(tag, select);
  if (anchor?.after) anchor.after(row);
  else host.append(row);
  const handler = () => onChange(select.value),
    attach = listen ?? ((target, type, fn) => target.addEventListener(type, fn));
  attach(select, "change", handler);
  return {
    row,
    select,
    set(next) {
      if (select.value !== next) select.value = next;
    },
    remove() {
      select.removeEventListener?.("change", handler);
      row.remove();
    },
  };
}
