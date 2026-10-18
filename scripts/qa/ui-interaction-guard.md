# Checked UI interactions

`checkedControl(page,{selector,method:'click'|'tap',ack,timeoutMs,label})` and
`checkedNavigation(page,{url|reload:true,ack,timeoutMs,label})` share one finite
wall deadline for observation, one ordinary dispatch and acknowledgement.
There is no force click, route guessing, retry loop or game-state mutation.

Control selectors are ordinary CSS. Before input, a read-only browser snapshot
checks one matching element, current document visibility, ancestor hidden/style,
closed details, viewport intersection, disabled/inert state and pointer hit-test.
Native Playwright actionability checks still run during the bounded click/tap.
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
