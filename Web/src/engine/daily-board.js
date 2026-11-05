import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";

// DAILY BOARD (data/dailyBoard.json): a small read-only panel on the death screen (index.html #daily-board inside #ending). One signed request to the
// writer's `leaderboard` op answers today's top rows and the player's own rank; the client sends no score. Names come from the server (a guest is
// "Survivor-NNNN") and are cleaned here. Offline, signed out or a refused read: the button is hidden or the panel shows a friendly line, never an error.
// Off with ?noboard=1 or dailyBoard.json enabled false: nothing is drawn and no request is made.
const RULES = GAME_DATA.dailyBoard;

export function boardOn(search, rules = RULES) {
  const query = typeof search === "string" ? search : "";
  return rules.enabled === true && new URLSearchParams(query).get(rules.offSwitch) !== "1";
}

const whole = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

// The server's answer, cleaned: known shape only, whole numbers, names without control characters and cut to nameMax. null when it is not a board.
export function normalizeBoard(reply, rules = RULES) {
  if (!reply || !Array.isArray(reply.top)) return null;
  const rows = [];
  for (const row of reply.top) {
    const name = typeof row?.name === "string" ? [...row.name.replace(CONTROL, "")].slice(0, rules.nameMax).join("").trim() : "",
      rank = whole(row?.rank),
      score = whole(row?.score),
      kills = whole(row?.kills);
    if (!name || !rank || score === null || kills === null) continue;
    rows.push({ rank, name, score, kills, you: row.you === true });
    if (rows.length >= rules.maxRows) break;
  }
  const rank = whole(reply.me?.rank),
    score = whole(reply.me?.score),
    kills = whole(reply.me?.kills);
  return { rows, me: rank && score !== null && kills !== null ? { rank, score, kills } : null };
}

// The one place the client asks for the board. `send(op, body)` is the save client's request function (it adds the token) and answers a parsed
// reply or {error}. An answer is reused for cacheMs; a refused or failed read answers the last good board when there is one.
export function createBoardApi({ send, rules = RULES, now = Date.now }) {
  let kept = null,
    pending = null;
  return {
    async load() {
      if (typeof send !== "function") return { ok: false, reason: "offline" };
      if (kept && now() - kept.at < rules.cacheMs) return kept.board;
      pending ??= (async () => {
        try {
          const board = normalizeBoard(await send(rules.op, {}), rules);
          if (board) kept = { at: now(), board: { ok: true, ...board } };
          return board ? kept.board : (kept?.board ?? { ok: false, reason: "offline" });
        } catch {
          return kept?.board ?? { ok: false, reason: "offline" };
        } finally {
          pending = null;
        }
      })();
      return pending;
    },
  };
}

const inert = { sync() {}, dispose() {} };

// The panel. `online()` says whether the world is running (a save client exists); the button shows only then, each time the death screen opens.
export function createDailyBoard({ search, doc = globalThis.document, request, online = () => false, rules = RULES, now, watch = true } = {}) {
  const $ = (id) => doc?.getElementById?.(id),
    root = $("daily-board"),
    button = $("daily-board-open"),
    panel = $("daily-board-panel");
  if (!root || !button || !panel || !boardOn(search, rules)) {
    if (root) root.hidden = true;
    return inert;
  }
  const heading = $("daily-board-heading"),
    list = $("daily-board-list"),
    mine = $("daily-board-me"),
    status = $("daily-board-status"),
    api = createBoardApi({ send: (op, body) => request?.(op, body), rules, ...(now ? { now } : {}) });
  let open = false,
    ticket = 0;
  heading.textContent = webText("board.heading");
  function draw(result) {
    list.replaceChildren();
    mine.textContent = "";
    if (!result.ok) {
      status.textContent = webText("board.offline");
      return;
    }
    status.textContent = result.rows.length ? "" : webText("board.empty");
    for (const row of result.rows) {
      const item = doc.createElement("li"),
        rank = doc.createElement("span"),
        name = doc.createElement("span"),
        score = doc.createElement("b");
      rank.className = "db-rank";
      name.className = "db-name";
      score.className = "db-score";
      rank.textContent = webText("board.rank", { rank: row.rank });
      name.textContent = row.you ? `${row.name} ${webText("board.you")}` : row.name;
      score.textContent = webText("board.score", { score: row.score });
      item.classList.toggle("db-you", row.you);
      item.setAttribute("aria-label", webText("board.rowAria", { rank: row.rank, name: row.name, score: row.score, kills: row.kills }));
      item.append(rank, name, score);
      list.append(item);
    }
    // The player's own line only when they are not among the rows already drawn (outside the top, or no row marked as them).
    if (result.me && !result.rows.some((row) => row.you)) mine.textContent = webText("board.me", { rank: result.me.rank, score: result.me.score });
  }
  function setOpen(next) {
    open = next;
    panel.hidden = !open;
    button.textContent = webText(open ? "board.close" : "board.open");
    button.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const mark = ++ticket;
    list.replaceChildren();
    mine.textContent = "";
    status.textContent = webText("board.loading");
    api.load().then((result) => {
      if (open && mark === ticket) draw(result);
    });
  }
  const toggle = () => setOpen(!open);
  button.addEventListener("click", toggle);
  // The death screen opens and closes by its `hidden` attribute: each time it changes, the button follows the world and the panel folds shut.
  function sync() {
    root.hidden = !online();
    setOpen(false);
  }
  const ending = watch ? $("ending") : null,
    observer = ending && typeof globalThis.MutationObserver === "function" ? new globalThis.MutationObserver(sync) : null;
  observer?.observe(ending, { attributes: true, attributeFilter: ["hidden"] });
  sync();
  return {
    sync,
    dispose() {
      observer?.disconnect();
      button.removeEventListener("click", toggle);
      root.hidden = true;
    },
  };
}
