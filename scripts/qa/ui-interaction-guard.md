# Checked UI interactions

`checkedControl(page,{selector,method:'click'|'tap',ack,timeoutMs,label})` and
`checkedNavigation(page,{url|reload:true,ack,timeoutMs,label})` share one finite
wall deadline for observation, one ordinary dispatch and acknowledgement.
There is no force click, route guessing, retry loop or game-state mutation.

Control selectors are ordinary CSS. Before input, a read-only browser snapshot
checks one matching element, current document visibility, ancestor hidden/style,
closed details, viewport intersection, disabled/inert state and pointer hit-test.
Click retains native Playwright actionability checks. Touch takes a second
read-only snapshot immediately before dispatch, rejects changed geometry or
readiness, and uses `page.touchscreen.tap` at the tested visible-intersection
centre. It does not use selector tap or wait for its post-handler action phase.
The acknowledgement must be false before control dispatch and truthy afterward;
an already-true predicate cannot prove a new action. Navigation uses bounded
DOMContentLoaded plus the supplied predicate; it may start on an already loaded
document. Settings/disclosure/Retry routing belongs to the maintained consumer.

Known failed prerequisites throw `QAInteractionError` with
`phase:'precondition',dispatched:false,classification:'driver/setup'` and before/
after screen/state diagnostics (rect, style, viewport, hit-test, menu/settings/
details state and available game clock/HP/weapon). Observation transport errors
instead have snapshot/baseline-acknowledgement phases and unknown classification;
they cannot masquerade as a successful hidden-Retry negative. Post-dispatch
failures report their actual dispatch/acknowledgement phase and `dispatched:true`.
No unknown failure is labelled a product defect.

Every entered guard attempts bounded mouse release in finally. Tap also attempts
Chromium CDP touchCancel and session detach. A broken transport cannot guarantee
physical delivery; release errors are explicit, never swallowed as success.
The helper does not press/release keyboard keys it never owned. It emits no
screenshot, browser launch, capture or submission job.

The AST policy binds exact helper bytes, the two exported functions, reviewed
internals `perform` and `releaseInputs`, and only their `ack` parameter for
evaluate/waitForFunction. Untrusted consumer dynamic code/callback indirection
remains rejected; there is no whole-module whitelist.

Node tests call the actual guard and browser snapshot against a controlled DOM/
Playwright API fixture. They cover before-input rejection, valid one-shot action,
ack/dispatch hangs, navigation, cleanup and failure diagnostics. They do not prove
actual browser visibility, touch behavior or native session adoption. The run
consumer owner must supply those observations in the existing required session.

The stage-local QA manifest pins Playwright1.63.0 alongside Acorn8.15.0. Install
with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --prefix scripts/qa
--ignore-scripts --no-audit --no-fund`. Browser binaries are not downloaded.
The checked runner owns the explicitly selected, verified Chromium executable;
this helper never chooses a global/default/Snap browser.

A successful atomic Playwright tap may leave no touch sequence to cancel. Only
the exact observed `cdpSession.send: Protocol error (Input.dispatchTouchEvent):
Must send a TouchStart first to start a new touch.` response counts as already
released. Bare lookalikes, suffixed messages and other transport errors remain
fatal; mouse cleanup and session detach are still attempted. The original
checked171 EXIT1/report is preserved, not relabelled PASS.

Click/navigation dispatch uses the original remaining Playwright action timeout. Only its outer
wall race has a fixed250ms diagnostic grace so a native timeout call log can
arrive. A success arriving after the original action deadline is still rejected
before acknowledgement. The native functional budget and acceptance criteria
are unchanged; a stalled transport remains bounded. This does not establish the
cause or correction of an observed menu click failure.

Coordinate touch uses the original remaining wall budget with no diagnostic
grace. Independent acknowledgement and finally cleanup remain mandatory.
A timed-out selector attempt remains failed even if its handler changed the UI.
