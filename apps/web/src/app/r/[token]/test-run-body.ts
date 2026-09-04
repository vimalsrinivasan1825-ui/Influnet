/**
 * The two-phone QA checklist, served at <base>/test-run by ../[doc]/route.ts.
 *
 * Unlike plan-body.ts and release-body.ts this page is not a static document
 * with a remarks thread bolted on — it is a small stateful app. Each visitor
 * who starts a run gets a private session (../test-sessions/route.ts, backed
 * by migration 146): a random secret is minted on the device and kept in
 * localStorage, and every read or write of that session must present it.
 * Nobody else — not another tester on the same link, not a second tab without
 * the secret — can see or change a run that is not theirs. There is
 * deliberately no cross-tester dashboard here; if the team needs to compare
 * runs, that is a query against report_test_sessions, not a feature of this
 * unauthenticated page.
 *
 * Phases and expected results mirror the shipped app: the twelve-stage
 * pipeline in packages/core/src/project-lifecycle.ts, the payment gates that
 * mobile hands off to web (no in-app Razorpay SDK), and the Free-plan caps
 * enforced in migration 117.
 */
import { REPORT_HEAD, REPORT_THEMER } from './report-chrome';

const PHASES = [
{n:"00", t:"Before you start", s:"Setup and guardrails — five minutes here saves an hour later", steps:[
 {id:"0.1", d:"b", a:"Open Settings on both phones and compare the version stamp at the bottom.", e:"Both show the same update ID and date.", n:"A mismatch means one phone is on an older over-the-air update. Do not run a paired test on mismatched builds — you will chase ghosts."},
 {id:"0.2", d:"b", a:"Confirm which backend each app points at.", e:"A dev build talks to dev.influnet.io. Both phones must be on the same one.", n:"Dev and staging have separate databases. A mixed pair shares no data at all — the second phone will simply never see the first phone's account."},
 {id:"0.3", d:"w", a:"Open the web dashboard on a laptop and sign in with an admin account.", e:"The admin area loads.", n:"You need this for business approval in Phase 03 and for both payment stages. Do not start without it."},
 {id:"0.4", d:"b", a:"Put the two phones on different networks — one on WiFi, one on mobile data.", e:"Both reach the app.", n:"Registration is rate-limited to 10 per minute per IP address. Two phones behind one router share that budget and the second signup can fail for a reason that looks nothing like rate limiting."},
 {id:"0.5", d:"b", a:"Grant notification permission when each app asks for it.", e:"The prompt appears once and you accept on both phones.", n:"Declining silently invalidates every push assertion from Phase 07 onward."},
 {id:"0.6", d:"b", a:"Write down the two email addresses and passwords you are about to use, and the current time.", e:"You can correlate any bug to a server log later.", n:"Use a fresh pair per full run."},
 {id:"0.7", d:"b", a:"Uninstall and reinstall, or sign out fully, so both phones start from a truly cold state.", e:"Both land on the Welcome screen."}
]},
{n:"01", t:"Creator signup", s:"Phone 2 — the multi-step wizard, including going backwards", steps:[
 {id:"1.1", d:"2", a:"Open the app cold.", e:"Welcome screen appears with sign in and create account. No flash of a signed-in screen first."},
 {id:"1.2", d:"2", a:"Create account, then choose “I create content”.", e:"Both roles are offered with a plain description of each; picking creator starts the creator wizard."},
 {id:"1.3", d:"2", a:"Enter a full name on the first step.", e:"Continue stays disabled until a name is entered; the keyboard does not cover the field."},
 {id:"1.4", d:"2", a:"On “Claim your handle”, type a username you know already exists.", e:"A live availability check marks it taken and offers alternatives as tappable chips."},
 {id:"1.5", d:"2", a:"Tap one of the suggested chips.", e:"The suggestion fills the field and the availability check re-runs and clears."},
 {id:"1.6", d:"2", a:"On “Create your login”, enter a malformed email.", e:"An inline error explains the problem before you can continue."},
 {id:"1.7", d:"2", a:"Enter a deliberately weak password.", e:"The rule is stated up front, not only after you press continue."},
 {id:"1.8", d:"2", a:"Continue to the mobile number step.", e:"If phone verification is on, the step is titled “Verify your mobile” and a code is sent. If off, it only collects the number.", n:"This is behind a runtime flag. Record which behaviour you saw — the rest of this phase depends on it."},
 {id:"1.9", d:"2", a:"If a code was sent, enter a wrong one.", e:"Rejected clearly, with a way to retry, and the wizard does not advance."},
 {id:"1.10", d:"2", a:"If a code was sent, enter the correct one, then go back one step and forward again.", e:"The verified state survives; you are not asked to verify twice."},
 {id:"1.11", d:"2", a:"On “Link your socials”, type an Instagram handle.", e:"The connection is attempted when you finish typing or tap, never on every keystroke. A public account resolves with follower numbers; a private one says it is private."},
 {id:"1.12", d:"2", a:"Add a YouTube channel and one more platform.", e:"Each logo tap reveals its own field, and optional platforms can be left blank without blocking Continue."},
 {id:"1.13", d:"2", a:"Look for the “Prove the account is yours” sub-step.", e:"It appears once the handle resolves, and it can be deferred without blocking signup."},
 {id:"1.14", d:"2", a:"Fill the bio, then pick several niches and content formats.", e:"Chips multi-select, and they stay selected if you go back a step and return."},
 {id:"1.15", d:"2", a:"Set the rate band, city and state on the last step.", e:"The city field suggests real cities; state is a single choice."},
 {id:"1.16", d:"2", a:"Use the phone's back gesture in the middle of the wizard.", e:"It moves back exactly one step and keeps every answer — it does not drop you out of signup.", n:"This has broken before. Test it from at least two different steps."},
 {id:"1.17", d:"2", a:"Submit the wizard.", e:"The account is created and you land inside the app on Home — not back on Welcome."},
 {id:"1.18", d:"2", a:"Force-quit the app and reopen it.", e:"Still signed in, straight to Home, with no “getting things ready” hang."}
]},
{n:"02", t:"Business signup", s:"Phone 1 — the same wizard quality, plus the approval gate", steps:[
 {id:"2.1", d:"1", a:"Create account, then choose “I represent a business”.", e:"The business wizard starts."},
 {id:"2.2", d:"1", a:"Enter your name, company name and username.", e:"Username availability and suggestions behave exactly as they did on the creator side."},
 {id:"2.3", d:"1", a:"Enter a work email and password.", e:"Validation is as good as the creator side — no weaker rules here."},
 {id:"2.4", d:"1", a:"Complete the mobile number step.", e:"Matches whichever behaviour you recorded in step 1.8."},
 {id:"2.5", d:"1", a:"Pick an industry and business type.", e:"Industry is a single choice and the selection is obvious."},
 {id:"2.6", d:"1", a:"Choose how you want to collaborate and a budget band.", e:"Both save and survive going back a step."},
 {id:"2.7", d:"1", a:"Fill website, city, state, registered address and GST number.", e:"A well-formed GST number is accepted; leaving optional fields blank does not silently block Continue."},
 {id:"2.8", d:"1", a:"Submit.", e:"The wizard tells you the account goes to the team for review, and you land inside the app."},
 {id:"2.9", d:"1", a:"Look at Home.", e:"The app makes it clear the business is awaiting approval, rather than presenting a fully unlocked account."},
 {id:"2.10", d:"1", a:"While still unapproved, try to send a collaboration request to any creator.", e:"Record exactly what happens: allowed, blocked, or blocked with a reason.", n:"This is the most important observation in the phase. Silently allowing it, or refusing it with an unexplained error, are both findings."}
]},
{n:"03", t:"Business approval", s:"Laptop — the one step a tester cannot do from a phone", steps:[
 {id:"3.1", d:"w", a:"In the admin area, open the businesses list.", e:"The new business appears with a pending-review status."},
 {id:"3.2", d:"w", a:"Approve it.", e:"The status flips to approved and the change is recorded."},
 {id:"3.3", d:"1", a:"Pull to refresh Home.", e:"The pending state clears without needing to sign out and back in."},
 {id:"3.4", d:"1", a:"Check notifications.", e:"An approval notification arrived in-app, and as a push if the app was backgrounded."},
 {id:"3.5", d:"w", a:"Reject a throwaway second business account, if you made one.", e:"The rejection is explained to that account rather than leaving it in limbo."}
]},
{n:"04", t:"Instagram ownership verification", s:"Phone 2 — the bio-link handshake and the badge it must not hand out early", steps:[
 {id:"4.1", d:"2", a:"Open Verification from Settings or Profile.", e:"Status reads unverified with a plain-language explanation of what to do."},
 {id:"4.2", d:"2", a:"Tap “Get my link”.", e:"A unique link is generated and shown."},
 {id:"4.3", d:"2", a:"Tap “Copy link”, then paste it into a notes app.", e:"The button confirms it copied and the clipboard genuinely holds the link."},
 {id:"4.4", d:"2", a:"Tap “Open Instagram”.", e:"Instagram opens, or the store page does if it is not installed. The app does not dead-end."},
 {id:"4.5", d:"2", a:"Without adding the link anywhere, tap “I've added the link”.", e:"Verification fails honestly and says what is missing.", n:"If this awards a verified badge, stop and flag it immediately — a self-awarded badge is a trust failure, not a cosmetic bug."},
 {id:"4.6", d:"2", a:"Now add the link to the Instagram profile links, return, and tap “I've added the link”.", e:"Verification runs and the status moves to in review or verified."},
 {id:"4.7", d:"2", a:"Tap “Re-verify & Refresh Data”.", e:"Follower and engagement numbers refresh; the screen shows a loading state rather than blanking out."},
 {id:"4.8", d:"1", a:"Open the creator's public profile from Phone 1.", e:"The badge state matches exactly what Phone 2 shows — no stale cache between the two."},
 {id:"4.9", d:"2", a:"Watch the “How to verify” guide from Settings.", e:"It plays and can be dismissed."}
]},
{n:"05", t:"Profiles and portfolio", s:"Both phones — what each side shows the other, and what it must not", steps:[
 {id:"5.1", d:"2", a:"Edit the creator profile: bio, avatar, rate.", e:"Saves, and the change shows immediately without a restart."},
 {id:"5.2", d:"2", a:"Tap “Preview public profile”.", e:"It opens inside the app, not by kicking you out to an external browser."},
 {id:"5.3", d:"2", a:"Add a portfolio piece.", e:"It saves with its proof, and a thumbnail renders."},
 {id:"5.4", d:"1", a:"Edit the business profile: logo, industry, website.", e:"Saves and reflects immediately."},
 {id:"5.5", d:"1", a:"Preview your own public business profile.", e:"It renders, and the registered address and GST number are NOT on it.", n:"These are private business details. Seeing them on a public profile is a privacy finding, not a layout nit."},
 {id:"5.6", d:"2", a:"Open the same business profile from Phone 2.", e:"Identical to what Phone 1 previewed — no extra fields leak to the other side."},
 {id:"5.7", d:"b", a:"Open the profile viewers screen on both phones.", e:"Either real viewers are listed, or there is a clean empty state — never a spinner that never resolves."}
]},
{n:"06", t:"Discovery and search", s:"Phone 1 — can a brand actually find this creator", steps:[
 {id:"6.1", d:"1", a:"Open search.", e:"The placeholder makes it clear you can search by name, handle or topic."},
 {id:"6.2", d:"1", a:"Search the creator by full name.", e:"The Phone 2 creator appears."},
 {id:"6.3", d:"1", a:"Search by @handle.", e:"The same creator appears."},
 {id:"6.4", d:"1", a:"Search by one of the niche keywords chosen in step 1.14.", e:"The creator appears — keyword search covers topics, not just names."},
 {id:"6.5", d:"1", a:"Search a nonsense string.", e:"A real empty state, not an endless spinner."},
 {id:"6.6", d:"1", a:"Apply a filter chip.", e:"Results narrow and the active filter stays visible so you know why."},
 {id:"6.7", d:"1", a:"Open the creator's card.", e:"Followers, engagement, niches, rate and reviews all load. No placeholder zeros where a real number exists."},
 {id:"6.8", d:"1", a:"Tap Save on the creator, leave the screen, and come back.", e:"The saved state persisted."},
 {id:"6.9", d:"1", a:"Scroll a long result list.", e:"It pages smoothly, images do not flicker, and position is kept when you go back from a profile."}
]},
{n:"07", t:"The collaboration request", s:"Phone 1 to Phone 2 — the first real cross-device handoff", steps:[
 {id:"7.1", d:"1", a:"From the creator's profile, tap “Request to collaborate”.", e:"The request composer opens."},
 {id:"7.2", d:"1", a:"Fill the campaign title, what you need, and a budget.", e:"Send stays disabled until the required fields are there."},
 {id:"7.3", d:"1", a:"Send it.", e:"You get a confirmation and the request appears under your Sent tab."},
 {id:"7.4", d:"2", a:"With Phone 2's app in the background, watch for the notification.", e:"A push arrives within seconds."},
 {id:"7.5", d:"2", a:"Tap the push.", e:"It opens that specific request, not just Home."},
 {id:"7.6", d:"2", a:"Open the Requests tab.", e:"The request shows that they contacted you, the budget, and whether the sender is verified."},
 {id:"7.7", d:"2", a:"Tap Decline and confirm in the sheet.", e:"The status becomes declined on BOTH phones."},
 {id:"7.8", d:"2", a:"Tap “Changed your mind? Reopen”.", e:"The request returns to pending on both phones."},
 {id:"7.9", d:"2", a:"Tap “Accept and start talking” and confirm.", e:"You are taken to Messages and a conversation with the brand exists."},
 {id:"7.10", d:"1", a:"Check Phone 1.", e:"An acceptance notification arrived and the Sent tab shows accepted."},
 {id:"7.11", d:"1", a:"Try to send a second request to the same creator.", e:"The app either prevents it or handles it clearly — it does not quietly create a second parallel thread."}
]},
{n:"08", t:"Messaging", s:"Both phones — live delivery, and what must not trigger an email", steps:[
 {id:"8.1", d:"1", a:"Open the conversation and send a message.", e:"It sends and appears in your own thread immediately."},
 {id:"8.2", d:"2", a:"Watch Phone 2 with the thread open.", e:"The message arrives live. No pull-to-refresh needed."},
 {id:"8.3", d:"2", a:"Background Phone 2's app; send another from Phone 1.", e:"A push arrives and tapping it opens that thread."},
 {id:"8.4", d:"b", a:"Type and send from both phones at the same moment.", e:"Nothing is lost or duplicated, and the message order is the same on both screens."},
 {id:"8.5", d:"2", a:"Send a long multi-paragraph message.", e:"It renders in full, the composer grows, and the keyboard never covers the send button."},
 {id:"8.6", d:"b", a:"Turn Phone 2's network off, send from Phone 1, then turn it back on.", e:"The message appears on reconnect without restarting the app."},
 {id:"8.7", d:"b", a:"Watch the unread badge on the Messages tab.", e:"It increments on a new message and clears once the thread is read."},
 {id:"8.8", d:"b", a:"Check the email inbox for both accounts.", e:"No email arrived for a plain chat message.", n:"Chat deliberately does not email — only in-app and push. An email here is a regression."}
]},
{n:"09", t:"Terms proposal to project", s:"Both phones — the step that turns a conversation into a tracked project", steps:[
 {id:"9.1", d:"1", a:"From inside the conversation, propose terms.", e:"A composer opens for budget, deliverables and the shape of the project."},
 {id:"9.2", d:"1", a:"Look at the choice of flow.", e:"The difference between the full twelve-stage pipeline and the short three-stage flow (pay before, or pay after) is explained, not just labelled.", n:"Pick the FULL flow for this run — Phases 10 to 14 test all twelve stages. Run the short flow as a second pass later."},
 {id:"9.3", d:"1", a:"Send the proposal.", e:"The thread now says terms were sent and are awaiting a reply."},
 {id:"9.4", d:"2", a:"Check Phone 2.", e:"It says terms were proposed to you, shows the full terms, and offers accept and decline."},
 {id:"9.5", d:"1", a:"Withdraw the proposal.", e:"It disappears on both phones."},
 {id:"9.6", d:"b", a:"Send it again, then decline from Phone 2.", e:"Both sides show declined and the conversation stays usable."},
 {id:"9.7", d:"b", a:"Send it once more, then accept from Phone 2.", e:"A real project is created and appears under Projects on BOTH phones.", n:"This is the moment that counts against the business's plan: 2 concurrent active, 5 lifetime. Keep count from here."},
 {id:"9.8", d:"b", a:"Open the project on both phones and compare.", e:"Same title, same budget, same current stage on both screens."},
 {id:"9.9", d:"1", a:"Try to propose terms again while the project is live.", e:"Refused with a reason that makes sense."}
]},
{n:"10", t:"Stage machine — setup", s:"Both phones — mutual sign-off, ownership of checklist items, and skipping", steps:[
 {id:"10.1", d:"b", a:"Open the project detail on both phones.", e:"A rail of twelve stages grouped into setup, production, review and payment, with the current one clearly active."},
 {id:"10.2", d:"b", a:"Open stage 1, Collaboration Started, on both phones.", e:"The guidance differs by role — the brand and the creator are told different things to do."},
 {id:"10.3", d:"1", a:"Tick the checklist items that belong to the brand.", e:"They tick, and the creator's items are visibly not yours to tick."},
 {id:"10.4", d:"2", a:"Try to tick an item owned by the brand.", e:"Refused. A checklist item can only be ticked by the side that owns it.", n:"If either side can tick the other's items, that is a consent bypass, not a UI slip. Flag it."},
 {id:"10.5", d:"1", a:"Sign off from Phone 1.", e:"Your signature shows, the stage does NOT move, and the screen says it is waiting on the creator."},
 {id:"10.6", d:"1", a:"Revoke your sign-off.", e:"Your signature clears and the stage still has not moved."},
 {id:"10.7", d:"b", a:"Sign off from Phone 1, then from Phone 2.", e:"The second signature moves the project to Discussion, and both phones update live."},
 {id:"10.8", d:"b", a:"On the Discussion stage, post an update with text and a link.", e:"The update appears in the stage timeline on both phones."},
 {id:"10.9", d:"2", a:"Propose skipping the Discussion stage.", e:"Phone 1 sees that the creator suggested skipping, with confirm and keep options."},
 {id:"10.10", d:"1", a:"Choose “Keep this stage”.", e:"The proposal clears on both phones."},
 {id:"10.11", d:"b", a:"Propose the skip again, then confirm it from Phone 1.", e:"The stage is marked skipped and the project advances."},
 {id:"10.12", d:"b", a:"Try to propose skipping the Advance Payment stage.", e:"Refused — payment stages can never be skipped.", n:"Also try Final Approval and Sent for Review. None of them may be skippable."}
]},
{n:"11", t:"The advance payment gate", s:"Both phones plus laptop — the gate that must only open by itself", steps:[
 {id:"11.1", d:"b", a:"Open the Advance Payment stage on both phones.", e:"The gate item is visible and labelled as a gate."},
 {id:"11.2", d:"1", a:"Try to tick the gate item by hand.", e:"It is locked, and says it opens automatically once payment is confirmed.", n:"If it is tappable, stop and flag it. A hand-tickable money gate lets an unpaid project walk straight through."},
 {id:"11.3", d:"2", a:"Look at the same stage on Phone 2.", e:"The creator sees the gate but has no pay control at all."},
 {id:"11.4", d:"1", a:"Tap “Pay on web”.", e:"It hands you to the web checkout for this specific project — the right project, the right amount.", n:"There is no in-app checkout yet. Judge whether the handoff is understandable to someone who has not read this document."},
 {id:"11.5", d:"w", a:"Complete the payment with a test card.", e:"The capture succeeds."},
 {id:"11.6", d:"b", a:"Return to both phones.", e:"The gate item has ticked ITSELF and the stage is complete. Nobody tapped it."},
 {id:"11.7", d:"b", a:"Check Home on both phones.", e:"The payment shows in the money summary — spend on the brand side, earnings on the creator side."},
 {id:"11.8", d:"b", a:"Sign off from both phones.", e:"The project advances to Content Planning."},
 {id:"11.9", d:"1", a:"Start a second payment and abandon it by closing the page.", e:"The gate stays shut and nothing in the app claims it was paid."}
]},
{n:"12", t:"Production stages", s:"Both phones — four stages of mutual sign-off, and whose move it is", steps:[
 {id:"12.1", d:"b", a:"Open Content Planning on both phones.", e:"The creator is the actor: Phone 2's guidance is the active one, Phone 1 is told what to review."},
 {id:"12.2", d:"b", a:"Post the plan from Phone 2, tick items, then sign off from both.", e:"Advances to Content Confirmation."},
 {id:"12.3", d:"b", a:"Work through Content Confirmation — the brand is the actor here — and sign off from both.", e:"Advances to Shooting in Progress."},
 {id:"12.4", d:"b", a:"Sign off Shooting in Progress from both phones.", e:"Advances to Editing in Progress."},
 {id:"12.5", d:"b", a:"Sign off Editing in Progress from both phones.", e:"Advances to Sent for Review."},
 {id:"12.6", d:"b", a:"At each of those four stages, glance at Home on both phones.", e:"Home says whose move it is, and the two phones never both claim it is your move on a stage that needs one specific side."},
 {id:"12.7", d:"b", a:"Open the project timeline.", e:"Every stage change is there with who did it and when — on both phones, identically."},
 {id:"12.8", d:"b", a:"Check that a notification fired for each stage move.", e:"The other side was told each time, in-app and by push."}
]},
{n:"13", t:"Review and the revisions loop", s:"Both phones — the only stage with two exits, and the loop it must not skip", steps:[
 {id:"13.1", d:"1", a:"Open Sent for Review on Phone 1.", e:"This stage does NOT use sign-off. The brand gets “Approve draft” and “Request revisions”."},
 {id:"13.2", d:"2", a:"Open the same stage on Phone 2.", e:"The creator has no approve or revise control, and the screen says it is with the brand."},
 {id:"13.3", d:"1", a:"Request revisions.", e:"The project moves BACK to Revisions and Phone 2 is notified."},
 {id:"13.4", d:"2", a:"Open the Revisions stage.", e:"The creator gets “Resubmit for review”, not a sign-off."},
 {id:"13.5", d:"2", a:"Resubmit.", e:"The project returns to Sent for Review — not forward to Final Approval.", n:"This is the highest-value check in the phase. If resubmitting jumps past the re-review, the brand loses its second look entirely."},
 {id:"13.6", d:"b", a:"Run the revisions loop once more.", e:"It is stable, and the timeline records both rounds separately."},
 {id:"13.7", d:"1", a:"Approve the draft.", e:"Advances to Final Approval."},
 {id:"13.8", d:"b", a:"Sign off Final Approval from both phones.", e:"Advances to Final Payment."}
]},
{n:"14", t:"Final payment and completion", s:"Both phones plus laptop — the last gate, and the one stage that refuses “advance”", steps:[
 {id:"14.1", d:"b", a:"Open Final Payment on both phones.", e:"Same locked gate behaviour as step 11.2 — it cannot be ticked by hand."},
 {id:"14.2", d:"w", a:"Pay the balance on the web checkout.", e:"The gate opens itself on both phones."},
 {id:"14.3", d:"1", a:"Look for any control that simply advances this stage.", e:"There is none. The only exit is “Confirm completion”."},
 {id:"14.4", d:"1", a:"Tap “Confirm completion” on Phone 1.", e:"Record whether this alone finishes the project, or whether the creator must also confirm.", n:"Completion should not be unilateral. If one side can close a project on its own, write down exactly which side and at what point."},
 {id:"14.5", d:"2", a:"Confirm completion from Phone 2.", e:"The project becomes completed on both phones."},
 {id:"14.6", d:"b", a:"Check Home on both phones.", e:"The project has moved out of the active pipeline and into completed work and settled earnings."},
 {id:"14.7", d:"b", a:"Try to reopen, edit or advance the completed project.", e:"Refused cleanly, with an explanation rather than a dead button."}
]},
{n:"15", t:"Ratings", s:"Both phones — one review each, permanent, and visible publicly", steps:[
 {id:"15.1", d:"1", a:"On the completed project, rate the creator.", e:"Five stars plus quality, communication, timeliness and professionalism, and an optional comment."},
 {id:"15.2", d:"1", a:"Submit it.", e:"The form is replaced by your rating, with a clear note that it cannot be edited afterwards."},
 {id:"15.3", d:"1", a:"Try to rate the same project again.", e:"Refused — one review per person per project."},
 {id:"15.4", d:"2", a:"Rate the brand from Phone 2 the same way.", e:"Same controls, same confirmation."},
 {id:"15.5", d:"2", a:"Open your own public creator profile.", e:"The brand's rating shows and the average is arithmetically right."},
 {id:"15.6", d:"1", a:"Open the creator's public profile from Phone 1.", e:"The same rating and the same average — no stale cache between the two phones."}
]},
{n:"16", t:"Campaigns", s:"Phone 1 posts a brief, Phone 2 finds and applies", steps:[
 {id:"16.1", d:"1", a:"Campaigns tab, create a new campaign.", e:"Title, description, deliverables, budget range, minimum followers, location, platforms and categories are all there."},
 {id:"16.2", d:"1", a:"Set the maximum budget lower than the minimum.", e:"Caught before submit, with a readable message."},
 {id:"16.3", d:"1", a:"Save it as a draft.", e:"It shows as a draft."},
 {id:"16.4", d:"2", a:"Open the Campaigns tab on Phone 2.", e:"The draft does NOT appear.", n:"An unpublished brief leaking to creators is a real finding."},
 {id:"16.5", d:"1", a:"Edit the brief, then publish it.", e:"Status becomes live."},
 {id:"16.6", d:"2", a:"Refresh Campaigns on Phone 2.", e:"The campaign now appears, with correct card art, budget and requirements."},
 {id:"16.7", d:"2", a:"Search campaigns by a keyword from the title, then by category.", e:"Findable both ways."},
 {id:"16.8", d:"2", a:"Open it and apply with a pitch.", e:"The applied state is confirmed and Apply is not offered a second time."},
 {id:"16.9", d:"1", a:"Open the campaign from Phone 1.", e:"The applicant is listed with their pitch and profile."},
 {id:"16.10", d:"1", a:"Close the campaign.", e:"Status becomes closed and Phone 2 can no longer apply."},
 {id:"16.11", d:"2", a:"Save a campaign, leave, and open the saved list.", e:"It persisted."}
]},
{n:"17", t:"Change requests and cancellation", s:"Both phones — renegotiating and backing out, from both sides", steps:[
 {id:"17.1", d:"b", a:"Start a second project, or use a live one before completing it, for this phase.", e:"You have an active project to work on.", n:"Remember the cap: two concurrent active projects on the Free plan."},
 {id:"17.2", d:"1", a:"Open Change requests and propose new terms.", e:"Phone 2 shows a pending change badge on the project."},
 {id:"17.3", d:"2", a:"Decline the change.", e:"Terms are unchanged on both phones."},
 {id:"17.4", d:"b", a:"Propose again and accept it from Phone 2.", e:"The project's terms update on both phones and the timeline records the change."},
 {id:"17.5", d:"1", a:"Request cancellation with a reason.", e:"Phone 2 sees a cancellation REQUEST — the project is not already cancelled."},
 {id:"17.6", d:"1", a:"Withdraw the cancellation request.", e:"It clears on both phones."},
 {id:"17.7", d:"b", a:"Request cancellation again and decline it from Phone 2.", e:"The project stays active."},
 {id:"17.8", d:"b", a:"Request once more and accept the cancellation from Phone 2.", e:"The project is cancelled on both phones, and any payment already made is still recorded.", n:"Check the money. A cancelled project must not erase the record of what was paid."},
 {id:"17.9", d:"b", a:"Open the deleted or cancelled projects list.", e:"The cancelled project is findable there on both phones."}
]},
{n:"18", t:"Notifications and push", s:"Both phones — the whole delivery pipeline, deliberately", steps:[
 {id:"18.1", d:"b", a:"Settings, then “Test Push Notifications”, on both phones.", e:"The token registers and the server confirms it — on BOTH phones."},
 {id:"18.2", d:"b", a:"Open the notifications screen on both phones.", e:"Every event from Phases 07 to 17 is listed, newest first."},
 {id:"18.3", d:"b", a:"Tap an old notification after restarting the app.", e:"It still deep-links to the right place."},
 {id:"18.4", d:"b", a:"Turn off the away-reminders setting.", e:"Nudges stop, but direct events — a request, a stage move — still arrive."},
 {id:"18.5", d:"b", a:"Kill one app entirely, then trigger an event from the other phone.", e:"The push still arrives."},
 {id:"18.6", d:"b", a:"With the app in the foreground, trigger an event from the other phone.", e:"An in-app card appears rather than a system banner over your own screen."},
 {id:"18.7", d:"b", a:"Check both email inboxes.", e:"Collaboration and project emails arrived; chat messages did not."}
]},
{n:"19", t:"Blocking and reporting", s:"Both phones — the safety controls, tested from the receiving end too", steps:[
 {id:"19.1", d:"2", a:"Report the business account from its profile.", e:"A reason picker plus optional detail; submitting confirms it was received."},
 {id:"19.2", d:"2", a:"Block the business.", e:"It is confirmed, and the business appears under Blocked accounts."},
 {id:"19.3", d:"1", a:"Try to message the creator who just blocked you.", e:"It is refused — not silently accepted and dropped.", n:"Write down the exact wording. It must stop the action clearly, and it must not pretend the message was delivered."},
 {id:"19.4", d:"2", a:"Unblock from Settings, Blocked accounts.", e:"Contact works again in both directions."},
 {id:"19.5", d:"1", a:"Report the creator from inside a project.", e:"The report sheet works from the project screen too, not only from a profile."}
]},
{n:"20", t:"Plan limits and billing", s:"Both phones — the caps, tested on purpose and last", steps:[
 {id:"20.1", d:"1", a:"Open Billing on Phone 1.", e:"Current plan is shown, with meters for active projects and lifetime project conversions."},
 {id:"20.2", d:"1", a:"Compare the meters to the projects you actually created.", e:"The counts match reality."},
 {id:"20.3", d:"2", a:"Open Billing on Phone 2.", e:"Business-only meters read as not applicable, rather than a misleading zero.", n:"A creator account structurally cannot have active-project or request meters. A zero here reads as broken data."},
 {id:"20.4", d:"1", a:"Create projects until you have two active at once, then try a third.", e:"Refused with an upgrade prompt — a clear message, not a generic failure."},
 {id:"20.5", d:"1", a:"Keep converting until you reach five projects lifetime, then try one more.", e:"Refused with a message that makes it clear this is a lifetime cap.", n:"This counts cancelled and completed projects too. After this step the business account is spent — do it last."},
 {id:"20.6", d:"1", a:"Tap the upgrade prompt.", e:"It leads somewhere real, or says plainly that upgrading is not available yet. It does not dead-end."}
]},
{n:"21", t:"Support and feedback", s:"Both phones — the two channels a real user would reach for", steps:[
 {id:"21.1", d:"b", a:"Settings, Help & support, raise a ticket from both phones.", e:"It submits and appears in the ticket list."},
 {id:"21.2", d:"b", a:"Open the ticket thread and reply.", e:"The reply posts and stays after a refresh."},
 {id:"21.3", d:"b", a:"Settings, Send feedback. Submit one of each kind — idea, confusing, broken, something good.", e:"All four submit.", n:"Feedback is limited to ten submissions an hour per account. Do not burn the budget testing the rate limit unless you mean to."},
 {id:"21.4", d:"b", a:"Submit feedback with a two-character message.", e:"Rejected with a readable reason, not an opaque server error."},
 {id:"21.5", d:"w", a:"Open the admin feedback view.", e:"Everything both phones submitted is there, with the right kind and the right surface recorded."}
]},
{n:"22", t:"Account, session and offline", s:"Both phones — the states people actually hit in the wild", steps:[
 {id:"22.1", d:"b", a:"Sign out from both phones.", e:"Back to Welcome, with no flicker of signed-in screens and no repeating error."},
 {id:"22.2", d:"b", a:"Sign back in on both.", e:"Straight to Home, in the correct role each time."},
 {id:"22.3", d:"2", a:"Sign in with a wrong password.", e:"A clear error, and the email field is not wiped."},
 {id:"22.4", d:"2", a:"Use forgot password.", e:"The reset email arrives and the reset actually works."},
 {id:"22.5", d:"b", a:"Turn on airplane mode and move around the app.", e:"Clear offline messaging, no white screens, no crash."},
 {id:"22.6", d:"b", a:"Come back online.", e:"Data refreshes on its own, without restarting the app."},
 {id:"22.7", d:"b", a:"Background the app for fifteen minutes, then return.", e:"The session is still valid and nothing bounced you back to Welcome.", n:"A token refresh that logs the user out is one of the worst bugs to ship — give this one the full fifteen minutes."},
 {id:"22.8", d:"b", a:"Set the phone's text size to the largest accessibility setting and reopen the app.", e:"Nothing is clipped, and every button is still reachable."},
 {id:"22.9", d:"2", a:"Settings, Delete account — on a throwaway account, at the very end of the run.", e:"A real confirmation step, and the account is genuinely gone afterwards."}
]},
{n:"23", t:"Simultaneity and edge cases", s:"Both phones — what only two real devices can test", steps:[
 {id:"23.1", d:"b", a:"On a sign-off stage, tap Sign off on both phones at the same instant.", e:"The stage advances exactly once, and neither tap is silently lost.", n:"This is the single highest-value test in the run. Two people confirming at the same moment has broken this before. Try it three times."},
 {id:"23.2", d:"b", a:"With the same stage open on both, tick a checklist item on one.", e:"The other phone reflects it without a manual refresh."},
 {id:"23.3", d:"b", a:"Sign off from one phone while revoking from the other.", e:"After a refresh, both phones agree on the end state."},
 {id:"23.4", d:"1", a:"Paste a very long title and deliverables text into a project or campaign.", e:"Stored and displayed without breaking the layout on either phone."},
 {id:"23.5", d:"b", a:"Send emoji and a non-Latin script in a message and in a bio.", e:"Stored and rendered correctly on the other phone."},
 {id:"23.6", d:"b", a:"Tap a primary action button five times quickly.", e:"One action happens, not five."},
 {id:"23.7", d:"b", a:"Pull to refresh on every tab, including empty ones.", e:"Each refreshes; none crashes on an empty state."},
 {id:"23.8", d:"b", a:"Sign in as the creator on both phones at once.", e:"Both stay signed in and stay in sync — one does not silently sign the other out."},
 {id:"23.9", d:"b", a:"Open a project deep link while signed out.", e:"You sign in and land on that project, not on Home."},
 {id:"23.10", d:"b", a:"Replay a product guide from Settings.", e:"It plays and can be dismissed, on both phones."},
 {id:"23.11", d:"b", a:"Rotate both phones, and switch the system theme to dark.", e:"Layout holds and every screen is readable in both themes."}
]}
];

const CHECKLIST_STYLE = `
<style>
.checklist{
  --biz:var(--brand); --bizSoft:var(--brand-soft); --bizLine:var(--brand);
  --cre:#7c3aed; --creSoft:#f5f3ff; --creLine:#7c3aed;
  --both:#64748b; --bothSoft:#f1f5f9; --bothLine:#94a3b8;
  --web:#0e7490; --webSoft:#ecfeff; --webLine:#22a4c2;
  --pass:var(--ok); --passSoft:var(--ok-soft);
  --issue:var(--danger); --issueSoft:var(--danger-soft);
  --block:var(--warn); --blockSoft:var(--warn-soft);
  --na:var(--content-muted); --naSoft:var(--card-2);
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]) .checklist{
    --cre:#a78bfa; --creSoft:rgba(124,58,237,.16);
    --both:#9aa5b1; --bothSoft:rgba(148,163,184,.14);
    --web:#4fc3dd; --webSoft:rgba(34,164,194,.14);
  }
}
:root[data-theme="dark"] .checklist{
  --cre:#a78bfa; --creSoft:rgba(124,58,237,.16);
  --both:#9aa5b1; --bothSoft:rgba(148,163,184,.14);
  --web:#4fc3dd; --webSoft:rgba(34,164,194,.14);
}

.session{margin-top:34px}
.session-card{background:var(--card); border:1px solid var(--hairline-strong); border-radius:16px;
  padding:22px; box-shadow:var(--shadow)}
.session-card .lbl{display:block; font-size:11px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
  color:var(--content-muted); margin:0 0 7px}
.session-card input{width:100%; font:inherit; font-size:15px; color:var(--content); background:var(--surface);
  border:1px solid var(--hairline-strong); border-radius:10px; padding:11px 13px; margin-bottom:14px}
.session-card input:focus{outline:2px solid var(--brand); outline-offset:1px; border-color:var(--brand)}
.session-card .row{display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:0 16px}
.session-card button{appearance:none; border:0; background:var(--brand); color:#fff; font:inherit;
  font-size:15px; font-weight:700; padding:12px 24px; border-radius:999px; cursor:pointer}
.session-card button:hover{background:var(--brand-strong)}
.session-card button:disabled{opacity:.55; cursor:progress}
.session-note{font-size:13.5px; color:var(--content-muted); margin:14px 0 0}
.session-say{font-size:14px; font-weight:600; margin:12px 0 0; min-height:20px}
.session-say.bad{color:var(--danger)}
.privacy{display:flex; gap:10px; align-items:flex-start; background:var(--brand-soft); border-radius:12px;
  padding:12px 14px; margin-bottom:16px; font-size:13.5px; color:var(--content-soft)}
.privacy b{color:var(--content)}

.activebar{display:flex; align-items:center; gap:12px; flex-wrap:wrap; background:var(--card);
  border:1px solid var(--hairline-strong); border-radius:16px; padding:14px 18px; margin-top:34px;
  box-shadow:var(--shadow)}
.activebar .who{font-weight:800; font-size:15px}
.activebar .savestate{font-size:12px; color:var(--content-muted); font-weight:600}
.activebar .savestate.ok{color:var(--ok)}
.activebar .savestate.bad{color:var(--danger)}
.activebar input.inline{border:1px solid var(--hairline-strong); background:var(--surface); border-radius:8px;
  padding:6px 10px; font:inherit; font-size:13.5px; color:var(--content); min-width:140px}
.activebar .switchout{margin-left:auto; background:none; border:1px solid var(--hairline-strong); border-radius:999px;
  padding:6px 14px; font-size:12.5px; font-weight:700; color:var(--content-muted); cursor:pointer}
.activebar .switchout:hover{border-color:var(--brand); color:var(--brand-strong)}

.meter{display:flex; height:8px; border-radius:99px; overflow:hidden; background:var(--card-2); gap:1px; margin-top:28px}
.meter i{display:block}
.meter .mp{background:var(--pass)} .meter .mi{background:var(--issue)}
.meter .mb{background:var(--block)} .meter .mn{background:var(--na)}
.counts{display:flex; gap:16px; flex-wrap:wrap; font-size:12.5px; color:var(--content-soft); margin-top:10px; font-weight:600}
.counts b{font-weight:800}
.counts .c-pass b{color:var(--pass)} .counts .c-issue b{color:var(--issue)}
.counts .c-block b{color:var(--block)} .counts .c-na b{color:var(--na)}

.filters{display:flex; gap:6px; flex-wrap:wrap; margin-top:16px}
.filters button{background:var(--card); border:1px solid var(--hairline-strong); border-radius:999px; padding:5px 13px;
  font-size:12.5px; font-weight:700; color:var(--content-soft); cursor:pointer}
.filters button[aria-pressed="true"]{background:var(--content); color:var(--surface); border-color:var(--content)}

.phases{margin-top:22px}
.phase{background:var(--card); border:1px solid var(--hairline-strong); border-radius:14px; margin-top:12px;
  overflow:hidden; box-shadow:var(--shadow)}
.phase-head{display:flex; align-items:center; gap:12px; width:100%; background:none; border:0; padding:14px 18px;
  text-align:left; cursor:pointer; font:inherit}
.phase-head:hover{background:var(--card-2)}
.pnum{font-size:12px; font-weight:800; color:var(--content-muted); border:1px solid var(--hairline-strong);
  border-radius:6px; padding:2px 7px; flex:none}
.ptitle{flex:1; min-width:0}
.ptitle h4{font-size:16px; font-weight:800; margin:0}
.ptitle span{display:block; font-size:12.5px; color:var(--content-muted); margin-top:1px; font-weight:500}
.pstat{font-size:11.5px; color:var(--content-muted); flex:none; font-weight:700}
.pstat.hasissue{color:var(--issue)}
.pstat.alldone{color:var(--pass)}
.chev{flex:none; width:9px; height:9px; border-right:2px solid var(--content-muted); border-bottom:2px solid var(--content-muted);
  transform:rotate(45deg); transition:transform .15s ease; margin-right:2px}
.phase.open .chev{transform:rotate(-135deg)}
.phase-body{border-top:1px solid var(--hairline-strong); display:none}
.phase.open .phase-body{display:block}

.step{border-bottom:1px solid var(--hairline); padding:14px 18px; display:flex; gap:12px; align-items:flex-start}
.step:last-child{border-bottom:0}
.step.s-pass{background:linear-gradient(90deg,var(--passSoft),transparent 45%)}
.step.s-issue{background:linear-gradient(90deg,var(--issueSoft),transparent 45%)}
.step.s-block{background:linear-gradient(90deg,var(--blockSoft),transparent 45%)}
.step.s-na{opacity:.6}
.rail{flex:none; width:3px; align-self:stretch; border-radius:2px; background:var(--hairline-strong)}
.step.s-pass .rail{background:var(--pass)} .step.s-issue .rail{background:var(--issue)}
.step.s-block .rail{background:var(--block)} .step.s-na .rail{background:var(--na)}
.sbody{flex:1; min-width:0}
.sline{display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:5px}
.sid{font-size:11.5px; color:var(--content-muted); font-weight:800}
.dev{display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:2px 9px; font-size:11px;
  font-weight:800; letter-spacing:.02em; border:1px solid; white-space:nowrap}
.dev.d1{color:var(--biz); background:var(--bizSoft); border-color:var(--bizLine)}
.dev.d2{color:var(--cre); background:var(--creSoft); border-color:var(--creLine)}
.dev.both{color:var(--both); background:var(--bothSoft); border-color:var(--bothLine)}
.dev.web{color:var(--web); background:var(--webSoft); border-color:var(--webLine)}
.act{font-size:14.5px; font-weight:600; color:var(--content)}
.exp{font-size:13.5px; color:var(--content-soft); margin-top:4px}
.exp b{font-size:10.5px; letter-spacing:.09em; text-transform:uppercase; color:var(--content-muted); font-weight:800; margin-right:6px}
.watch{margin-top:7px; font-size:13px; color:var(--content-soft); background:var(--card-2); border-left:2px solid var(--hairline-strong);
  border-radius:0 6px 6px 0; padding:8px 11px}
.watch b{color:var(--content); font-weight:700}
.marks{display:flex; gap:5px; margin-top:10px; flex-wrap:wrap; align-items:center}
.marks button{border:1px solid var(--hairline-strong); background:var(--surface); border-radius:8px; padding:5px 11px;
  font-size:12.5px; font-weight:700; color:var(--content-soft); cursor:pointer}
.marks button[aria-pressed="true"].m-pass{background:var(--pass); border-color:var(--pass); color:#fff}
.marks button[aria-pressed="true"].m-issue{background:var(--issue); border-color:var(--issue); color:#fff}
.marks button[aria-pressed="true"].m-block{background:var(--block); border-color:var(--block); color:#fff}
.marks button[aria-pressed="true"].m-na{background:var(--na); border-color:var(--na); color:#fff}
.marks .addnote{margin-left:auto; background:none; border-style:dashed; font-weight:600}
.notefield{margin-top:9px}
.notefield textarea{width:100%; min-height:64px; resize:vertical; background:var(--surface); border:1px solid var(--hairline-strong);
  border-radius:9px; padding:9px 11px; font:inherit; font-size:13.5px; color:var(--content); line-height:1.5}
.notefield textarea:focus{outline:2px solid var(--brand); outline-offset:1px; border-color:var(--brand)}

.exportrow{display:flex; gap:8px; flex-wrap:wrap; margin-top:22px}
.exportrow button{background:var(--card); border:1px solid var(--hairline-strong); border-radius:999px; padding:9px 16px;
  font-size:13.5px; font-weight:700; color:var(--content); cursor:pointer}
.exportrow button.primary{background:var(--content); color:var(--surface); border-color:var(--content)}
.exportrow button:hover{border-color:var(--brand)}
.empty{font-size:13.5px; color:var(--content-muted); background:var(--card); border:1px dashed var(--hairline-strong);
  border-radius:14px; padding:18px; text-align:center}

/* --- Sharing (migration 147) --------------------------------------------- */

/* Several things toggled by the hidden attribute below are flex containers,
   and a display:flex rule beats the UA stylesheet's own hidden rule. Without
   this the share link row and the read-only banner would be laid out the
   moment they exist, whatever the attribute says. */
.checklist [hidden]{display:none !important}

/* The owner's control. Lives in the active bar, folded away until pressed:
   sharing is a thing you do once at the end of a run, not a setting you look
   at while working through 206 steps. */
.sharebar{display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:10px;
  background:var(--card); border:1px solid var(--hairline-strong); border-radius:12px; padding:11px 14px}
.sharebar .st{font-size:12.5px; color:var(--content-soft); flex:1; min-width:180px}
.sharebar .st b{color:var(--content)}
.sharebar button{border:1px solid var(--hairline-strong); background:var(--surface); border-radius:999px;
  padding:6px 14px; font-size:12.5px; font-weight:700; color:var(--content); cursor:pointer; white-space:nowrap}
.sharebar button.on{background:var(--content); color:var(--surface); border-color:var(--content)}
.sharebar button:hover{border-color:var(--brand)}
.sharelink{display:flex; gap:8px; width:100%; margin-top:2px}
.sharelink input{flex:1; min-width:0; font:inherit; font-size:12.5px; padding:7px 10px; border-radius:8px;
  border:1px solid var(--hairline-strong); background:var(--surface); color:var(--content-soft)}

/* Somebody else's run, opened read-only. Coloured unlike anything else on the
   page so there is no moment where a reader believes they are marking steps. */
.robanner{display:flex; gap:12px; align-items:flex-start; background:var(--webSoft); border:1px solid var(--webLine);
  border-radius:14px; padding:14px 16px; margin-bottom:20px; font-size:13.5px; color:var(--content-soft); line-height:1.55}
.robanner b{color:var(--content)}
.robanner .mine{margin-left:auto; white-space:nowrap; border:1px solid var(--hairline-strong); background:var(--surface);
  border-radius:999px; padding:6px 14px; font-size:12.5px; font-weight:700; color:var(--content); cursor:pointer;
  text-decoration:none; display:inline-block}

/* Read-only marks: the same four states, stated rather than offered. */
.verdict{display:inline-flex; align-items:center; gap:6px; border-radius:999px; padding:3px 11px; font-size:11.5px;
  font-weight:800; letter-spacing:.02em; color:#fff; text-transform:uppercase}
.verdict.v-pass{background:var(--pass)} .verdict.v-issue{background:var(--issue)}
.verdict.v-block{background:var(--block)} .verdict.v-na{background:var(--na)}
.verdict.v-none{background:none; color:var(--content-muted); border:1px dashed var(--hairline-strong)}
.ronote{margin-top:9px; font-size:13.5px; color:var(--content); background:var(--card-2); border-left:2px solid var(--issue);
  border-radius:0 6px 6px 0; padding:9px 12px; white-space:pre-wrap; line-height:1.55}
.ronote b{font-size:10.5px; letter-spacing:.09em; text-transform:uppercase; color:var(--content-muted);
  font-weight:800; display:block; margin-bottom:3px}

/* The index of runs other people have shared. */
.runs{margin-top:14px}
.runs .lbl{display:block; margin-bottom:9px}
.runlist{display:flex; flex-direction:column; gap:8px}
.runrow{display:flex; align-items:center; gap:12px; flex-wrap:wrap; text-decoration:none; color:inherit;
  background:var(--card); border:1px solid var(--hairline-strong); border-radius:12px; padding:11px 14px}
.runrow:hover{border-color:var(--brand)}
.runrow .rn{font-size:13.5px; font-weight:700; color:var(--content)}
.runrow .rb{font-size:12px; color:var(--content-muted)}
.runrow .rc{margin-left:auto; display:flex; gap:9px; font-size:12px; font-weight:700; white-space:nowrap}
.runrow .rc .p{color:var(--pass)} .runrow .rc .i{color:var(--issue)} .runrow .rc .b{color:var(--block)}

@media (max-width:640px){
  .step{padding:12px 14px} .phase-head{padding:12px 14px}
  .marks .addnote{margin-left:0}
  .activebar .switchout{margin-left:0}
  .runrow .rc{margin-left:0; width:100%}
  .robanner .mine{margin-left:0}
}
</style>`;

export function testRunBody(base: string): string {
  const total = PHASES.reduce((n, p) => n + p.steps.length, 0);
  return `
<title>Two-Phone Test Run</title>
${REPORT_HEAD}
${CHECKLIST_STYLE}
<div class="wrap checklist">

<nav class="docnav"><a href="${base}">← All documents</a></nav>

<header class="mast">
  <p class="eyebrow">Influnet · Mobile QA runbook</p>
  <h1>Two-Phone<br><em>Test Run</em></h1>
  <p class="standfirst">One full pass through the product with a brand on one handset and a creator on the other — signup to signed-off completion. ${total} steps across 24 phases, each with what to do and exactly what should happen.</p>
</header>

<div class="privacy"><span>🔒</span><span><b>Your run is private to this device until you share it.</b> Starting a session below creates a key that only this browser holds — nobody else who opens this link can see or change your run. When you are ready to hand it to the rest of the team, share it: that publishes a <b>read-only</b> copy anyone with this link can open, while editing stays with your device alone.</span></div>

<div id="ro-banner" class="robanner" hidden></div>

<section id="session" class="session">
  <div id="session-start" class="session-card">
    <span class="lbl">Start your run</span>
    <div class="row">
      <div>
        <label class="lbl" for="ts-tester">Your name</label>
        <input id="ts-tester" type="text" maxlength="120" autocomplete="name" placeholder="Who is testing?">
      </div>
      <div>
        <label class="lbl" for="ts-build">Build</label>
        <input id="ts-build" type="text" maxlength="120" placeholder="Update ID / date from Settings">
      </div>
    </div>
    <button type="button" id="ts-begin">Begin this run</button>
    <p class="session-say" id="ts-say" role="status" aria-live="polite"></p>
    <p class="session-note">This device will remember your run. Come back to this same link on the same browser any time to pick up where you left off.</p>
  </div>

  <div class="runs" id="runs" hidden>
    <span class="lbl">Runs the team has shared</span>
    <div class="runlist" id="runlist"></div>
    <p class="session-note">Open one to read what was tested and what was found, without starting a run of your own. You cannot change someone else&rsquo;s run — only the device that made it can.</p>
  </div>
</section>

<div id="checklist-app" hidden>

  <div class="activebar">
    <span class="who" id="ab-who"></span>
    <input class="inline" id="ab-build" placeholder="Build">
    <span class="savestate" id="savestate">saving…</span>
    <button type="button" class="switchout" id="ab-switch">Not you? Start a different run</button>
  </div>

  <div class="sharebar" id="sharebar" hidden>
    <span class="st" id="share-state"></span>
    <button type="button" id="share-toggle">Share read-only</button>
    <div class="sharelink" id="share-link-row" hidden>
      <input type="text" id="share-link" readonly aria-label="Read-only link to this run">
      <button type="button" id="share-copy">Copy</button>
    </div>
  </div>

  <div class="meter" id="meter" role="img" aria-label="Run progress">
    <i class="mp" style="width:0%"></i><i class="mi" style="width:0%"></i><i class="mb" style="width:0%"></i><i class="mn" style="width:0%"></i>
  </div>
  <div class="counts" id="counts"></div>

  <div class="filters" id="filters">
    <button data-f="all" aria-pressed="true">All steps</button>
    <button data-f="todo" aria-pressed="false">Not run</button>
    <button data-f="issue" aria-pressed="false">Issues</button>
    <button data-f="block" aria-pressed="false">Blocked</button>
    <button data-f="noted" aria-pressed="false">With notes</button>
  </div>

  <div class="call" style="margin-top:22px">
    <span class="lbl">Known conditions — not bugs, don't file them</span>
    <p><b>Payments are web-only on mobile</b> — the payment stages show a "Pay on web" button because there is no in-app Razorpay checkout yet. <b>Signup is rate-limited</b> to 10 registrations per minute, per IP — put the two phones on different networks. <b>Free-plan caps are enforced in the database</b>: 2 concurrent active projects and 5 lifetime project conversions per business. <b>Email confirmation is currently off</b>, so signup never verifies the address — never use <code>@influnet-audit.test</code> addresses, they hard-bounce. <b>Phone OTP and Instagram ownership are runtime flags</b> — where a step says "record which you saw", that record is the deliverable.</p>
  </div>

  <div class="phases" id="phases"></div>

  <div class="exportrow">
    <button class="primary" id="copy-issues">Copy my issues</button>
    <button id="copy-all">Copy full run</button>
  </div>
</div>

<footer>
  <p>Phases and expected results are derived from the shipped app — the twelve-stage pipeline, the payment gates, the plan caps and the flag-gated steps all match what is in the code today. Sessions are stored in report_test_sessions (migration 146) and are reachable only by the device holding the matching key, or — once their owner shares them — read-only through a separate handle that carries no write access (migration 147).</p>
</footer>

${REPORT_THEMER}
</div>

<script>
(function(){
  var PHASES = ${JSON.stringify(PHASES)};
  var TOTAL = ${total};
  var DEV = {
    "1":{cls:"d1", label:"PHONE 1 \\u00b7 BUSINESS"},
    "2":{cls:"d2", label:"PHONE 2 \\u00b7 CREATOR"},
    "b":{cls:"both", label:"BOTH PHONES"},
    "w":{cls:"web", label:"LAPTOP / WEB"}
  };
  var STATUSES = [["pass","Pass"],["issue","Issue"],["block","Blocked"],["na","N/A"]];
  var API = "${base}/test-sessions";
  var LS_KEY = "influnet-test-run-session";

  var ALL_STEPS = [];
  for (var pi = 0; pi < PHASES.length; pi++){
    var ph = PHASES[pi];
    for (var si = 0; si < ph.steps.length; si++) ALL_STEPS.push(ph.steps[si]);
  }

  var session = null;      // { id, secret } — null in read-only mode
  var results = {};        // { "1.1": {s, n}, ... }
  var filter = "all";
  var openPhases = { "00": true };
  var saveTimer = null;
  /**
   * True when this page is showing somebody else's shared run. Every write
   * path checks it, but it is not what makes the run safe - the API simply has
   * no way to write without the secret, which a shared link never carries.
   */
  var readOnly = false;
  var shareId = null;      // this device's own share handle, when sharing is on
  var STATUS_LABEL = { pass:"Pass", issue:"Issue", block:"Blocked", na:"N/A" };

  function esc(v){
    return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }

  function loadLocal(){
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (v && v.id && v.secret) return v;
    } catch (e) {}
    return null;
  }
  function saveLocal(v){
    try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch (e) {}
  }
  function clearLocal(){
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
  }

  function setSaveState(text, cls){
    var el = document.getElementById("savestate");
    el.textContent = text;
    el.className = "savestate" + (cls ? " " + cls : "");
  }

  function tally(){
    var t = { pass:0, issue:0, block:0, na:0, todo:0, recorded:0 };
    for (var i = 0; i < ALL_STEPS.length; i++){
      var r = results[ALL_STEPS[i].id];
      if (r && r.s){ t[r.s] = (t[r.s]||0) + 1; t.recorded++; } else t.todo++;
    }
    return t;
  }

  function updateHeader(){
    var t = tally();
    var pct = function(v){ return (v / TOTAL * 100).toFixed(2) + "%"; };
    var m = document.getElementById("meter").children;
    m[0].style.width = pct(t.pass); m[1].style.width = pct(t.issue);
    m[2].style.width = pct(t.block); m[3].style.width = pct(t.na);
    document.getElementById("counts").innerHTML =
      '<span class="c-pass">Pass <b>' + t.pass + '</b></span>' +
      '<span class="c-issue">Issues <b>' + t.issue + '</b></span>' +
      '<span class="c-block">Blocked <b>' + t.block + '</b></span>' +
      '<span class="c-na">N/A <b>' + t.na + '</b></span>' +
      '<span>Not run <b>' + t.todo + '</b> of ' + TOTAL + '</span>';
  }

  function stepMatches(s){
    var r = results[s.id] || {};
    if (filter === "all") return true;
    if (filter === "todo") return !r.s;
    if (filter === "issue") return r.s === "issue";
    if (filter === "block") return r.s === "block";
    if (filter === "noted") return !!(r.n && r.n.trim());
    return true;
  }

  function renderStep(s){
    var r = results[s.id] || {};
    var el = document.createElement("div");
    el.className = "step" + (r.s ? " s-" + r.s : "");
    var dev = DEV[s.d];
    var hasNote = !!(r.n && r.n.trim());

    // Read-only: state the verdict and the note as text. Deliberately not
    // disabled buttons and a disabled textarea — a greyed-out control still
    // reads as "yours, currently unavailable", and a reader should never spend
    // a moment wondering why their tap did nothing.
    if (readOnly){
      el.innerHTML =
        '<span class="rail"></span>' +
        '<div class="sbody">' +
          '<div class="sline"><span class="sid">' + esc(s.id) + '</span><span class="dev ' + dev.cls + '">' + dev.label + '</span>' +
            '<span class="verdict ' + (r.s ? "v-" + r.s : "v-none") + '">' + esc(r.s ? STATUS_LABEL[r.s] || r.s : "Not run") + '</span></div>' +
          '<p class="act">' + esc(s.a) + '</p>' +
          '<p class="exp"><b>Expect</b>' + esc(s.e) + '</p>' +
          (s.n ? '<p class="watch"><b>Watch out:</b> ' + esc(s.n) + '</p>' : '') +
          (hasNote ? '<div class="ronote"><b>Tester\\u2019s note</b>' + esc(r.n) + '</div>' : '') +
        '</div>';
      return el;
    }

    el.innerHTML =
      '<span class="rail"></span>' +
      '<div class="sbody">' +
        '<div class="sline"><span class="sid">' + esc(s.id) + '</span><span class="dev ' + dev.cls + '">' + dev.label + '</span></div>' +
        '<p class="act">' + esc(s.a) + '</p>' +
        '<p class="exp"><b>Expect</b>' + esc(s.e) + '</p>' +
        (s.n ? '<p class="watch"><b>Watch out:</b> ' + esc(s.n) + '</p>' : '') +
        '<div class="marks"></div>' +
        '<div class="notefield"' + (hasNote ? '' : ' hidden') + '><textarea placeholder="What did you tap, what happened, what did you expect instead?">' + esc(r.n || "") + '</textarea></div>' +
      '</div>';

    var marks = el.querySelector(".marks");
    STATUSES.forEach(function(pair){
      var val = pair[0], label = pair[1];
      var b = document.createElement("button");
      b.className = "m-" + val;
      b.textContent = label;
      b.setAttribute("aria-pressed", r.s === val ? "true" : "false");
      b.addEventListener("click", function(){
        var cur = results[s.id] || {};
        var next = cur.s === val ? "" : val;
        results[s.id] = { s: next, n: cur.n || "" };
        scheduleSave();
        renderAll();
      });
      marks.appendChild(b);
    });
    var nb = document.createElement("button");
    nb.className = "addnote";
    nb.textContent = hasNote ? "Edit note" : "Add note";
    nb.addEventListener("click", function(){
      var f = el.querySelector(".notefield");
      f.hidden = !f.hidden;
      if (!f.hidden) f.querySelector("textarea").focus();
    });
    marks.appendChild(nb);

    var ta = el.querySelector("textarea");
    ta.addEventListener("input", function(){
      var cur = results[s.id] || {};
      results[s.id] = { s: cur.s || "", n: ta.value };
      scheduleSave();
    });
    return el;
  }

  function renderPhases(){
    var host = document.getElementById("phases");
    host.innerHTML = "";
    PHASES.forEach(function(p){
      var visible = p.steps.filter(stepMatches);
      if (!visible.length) return;
      var done = 0, issues = 0;
      p.steps.forEach(function(s){ var r = results[s.id]; if (r && r.s){ done++; if (r.s === "issue") issues++; } });

      var sec = document.createElement("section");
      sec.className = "phase" + (openPhases[p.n] || filter !== "all" ? " open" : "");

      var statCls = issues ? "hasissue" : (done === p.steps.length ? "alldone" : "");
      var statTxt = issues ? issues + " issue" + (issues > 1 ? "s" : "") : done + "/" + p.steps.length;

      var head = document.createElement("button");
      head.type = "button";
      head.className = "phase-head";
      head.innerHTML =
        '<span class="pnum">' + esc(p.n) + '</span>' +
        '<span class="ptitle"><h4>' + esc(p.t) + '</h4><span>' + esc(p.s) + '</span></span>' +
        '<span class="pstat ' + statCls + '">' + statTxt + '</span><span class="chev"></span>';
      head.addEventListener("click", function(){
        openPhases[p.n] = !openPhases[p.n];
        renderPhases();
      });
      sec.appendChild(head);

      var body = document.createElement("div");
      body.className = "phase-body";
      visible.forEach(function(s){ body.appendChild(renderStep(s)); });
      sec.appendChild(body);
      host.appendChild(sec);
    });
    if (!host.children.length){
      host.innerHTML = '<p class="empty">Nothing matches this filter — every step in this view is clear.</p>';
    }
  }

  function renderAll(){ updateHeader(); renderPhases(); }

  function scheduleSave(){
    if (readOnly) return;
    setSaveState("saving…", "");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(pushSave, 700);
  }

  function pushSave(){
    if (!session) return;
    var tester = document.getElementById("ab-who").dataset.tester || "";
    var build = document.getElementById("ab-build").value;
    fetch(API + "?session=" + encodeURIComponent(session.id) + "&secret=" + encodeURIComponent(session.secret), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tester: tester, build: build, results: results })
    }).then(function(r){
      if (!r.ok) throw new Error();
      setSaveState("saved \\u00b7 private to this device", "ok");
    }).catch(function(){
      setSaveState("could not save — check your connection", "bad");
    });
  }

  function startApp(sess, tester, build, initialResults){
    session = sess;
    results = initialResults || {};
    document.getElementById("session").hidden = true;
    document.getElementById("checklist-app").hidden = false;
    var who = document.getElementById("ab-who");
    who.textContent = tester || "Unnamed tester";
    who.dataset.tester = tester || "";
    document.getElementById("ab-build").value = build || "";
    document.getElementById("sharebar").hidden = false;
    renderShare();
    renderAll();
    setSaveState(shareId ? "saved \\u00b7 shared read-only" : "saved \\u00b7 private to this device", "ok");
  }

  /**
   * Somebody else's run. The whole editing apparatus — the active bar, the
   * share control, the mark buttons — is left out rather than switched off.
   */
  function startReadOnly(tester, build, initialResults){
    readOnly = true;
    results = initialResults || {};
    document.getElementById("session").hidden = true;
    document.getElementById("checklist-app").hidden = false;
    document.querySelector(".activebar").hidden = true;
    document.getElementById("sharebar").hidden = true;
    document.querySelector(".privacy").hidden = true;

    // The active bar is hidden, but "Copy full run" still reads these — a
    // reader forwarding someone else's findings should get their name and
    // build on the export, not "unnamed".
    var who = document.getElementById("ab-who");
    who.textContent = tester || "Unnamed tester";
    who.dataset.tester = tester || "";
    document.getElementById("ab-build").value = build || "";

    var t = tally();
    var banner = document.getElementById("ro-banner");
    banner.hidden = false;
    banner.innerHTML =
      '<span>\\ud83d\\udc41\\ufe0f</span>' +
      '<span>You are reading <b>' + esc(tester || "an unnamed tester") + '\\u2019s</b> run' +
      (build ? ' on build <b>' + esc(build) + '</b>' : '') + ', shared read-only. ' +
      t.recorded + ' of ' + TOTAL + ' steps recorded \\u2014 ' + t.issue + ' issue' + (t.issue === 1 ? '' : 's') +
      ' and ' + t.block + ' blocked. Nothing here can be changed from this device; ' +
      'start your own run to record your own results.</span>' +
      '<a class="mine" href="' + esc(location.pathname) + '">Start my own run</a>';

    renderAll();
  }

  /** Paint the owner's share control from the current shareId. */
  function renderShare(){
    var state = document.getElementById("share-state");
    var toggle = document.getElementById("share-toggle");
    var row = document.getElementById("share-link-row");
    if (shareId){
      state.innerHTML = '<b>Shared with the team.</b> Anyone with this link can read your run \\u2014 your marks and notes \\u2014 but only this device can change it.';
      toggle.textContent = "Stop sharing";
      toggle.className = "on";
      row.hidden = false;
      document.getElementById("share-link").value =
        location.origin + location.pathname + "?run=" + shareId;
    } else {
      state.innerHTML = '<b>This run is private to this device.</b> Share it to give the other testers a read-only copy of what you have covered and what you found.';
      toggle.textContent = "Share read-only";
      toggle.className = "";
      row.hidden = true;
    }
  }

  function toggleShare(){
    if (!session || readOnly) return;
    var toggle = document.getElementById("share-toggle");
    var want = !shareId;
    if (!want && !confirm("Stop sharing this run? The link you sent out stops working immediately, and sharing again later issues a different one.")) return;
    toggle.disabled = true;
    fetch(API + "?session=" + encodeURIComponent(session.id) + "&secret=" + encodeURIComponent(session.secret), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ share: want })
    }).then(function(r){ return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function(d){
        shareId = d.shareId || null;
        renderShare();
        setSaveState(shareId ? "saved \\u00b7 shared read-only" : "saved \\u00b7 private to this device", "ok");
      })
      .catch(function(){ setSaveState("could not change sharing \\u2014 try again", "bad"); })
      .then(function(){ toggle.disabled = false; });
  }

  /** The index of shared runs, shown under the start card. */
  function loadSharedRuns(){
    fetch(API + "?shared=1")
      .then(function(r){ return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function(d){
        var runs = (d && d.runs) || [];
        if (!runs.length) return;
        var host = document.getElementById("runlist");
        host.innerHTML = "";
        runs.forEach(function(run){
          var a = document.createElement("a");
          a.className = "runrow";
          a.href = location.pathname + "?run=" + encodeURIComponent(run.shareId);
          var c = run.counts || { pass:0, issue:0, block:0, recorded:0 };
          a.innerHTML =
            '<span class="rn">' + esc(run.tester || "Unnamed tester") + '</span>' +
            '<span class="rb">' + esc(run.build || "build not noted") + ' \\u00b7 ' + c.recorded + '/' + TOTAL + ' steps</span>' +
            '<span class="rc"><span class="p">' + c.pass + ' pass</span>' +
              '<span class="i">' + c.issue + ' issue' + (c.issue === 1 ? '' : 's') + '</span>' +
              '<span class="b">' + c.block + ' blocked</span></span>';
          host.appendChild(a);
        });
        document.getElementById("runs").hidden = false;
      })
      .catch(function(){});
  }

  function beginFromForm(){
    var tester = document.getElementById("ts-tester").value.trim();
    var build = document.getElementById("ts-build").value.trim();
    var say = document.getElementById("ts-say");
    var btn = document.getElementById("ts-begin");
    btn.disabled = true;
    say.className = "session-say";
    say.textContent = "Starting…";
    fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tester: tester, build: build })
    }).then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
      .then(function(res){
        if (!res.ok) throw new Error(res.d && res.d.error ? res.d.error : "Could not start a run.");
        var sess = { id: res.d.id, secret: res.d.secret };
        saveLocal(sess);
        startApp(sess, tester, build, {});
      }).catch(function(err){
        say.className = "session-say bad";
        say.textContent = err.message || "Could not start a run.";
      }).then(function(){ btn.disabled = false; });
  }

  document.getElementById("ts-begin").addEventListener("click", beginFromForm);

  document.getElementById("ab-build").addEventListener("input", function(){ scheduleSave(); });

  document.getElementById("ab-switch").addEventListener("click", function(){
    if (!confirm("Start a different run on this device? Your current run stays saved and can only be reopened if you still have its link and key noted down elsewhere — this device is about to forget it.")) return;
    clearLocal();
    session = null; results = {};
    document.getElementById("checklist-app").hidden = true;
    document.getElementById("session").hidden = false;
    document.getElementById("ts-tester").value = "";
    document.getElementById("ts-build").value = "";
    document.getElementById("ts-say").textContent = "";
  });

  document.getElementById("filters").addEventListener("click", function(e){
    var b = e.target.closest("button[data-f]");
    if (!b) return;
    filter = b.dataset.f;
    var all = document.querySelectorAll("#filters button");
    for (var i = 0; i < all.length; i++) all[i].setAttribute("aria-pressed", all[i] === b ? "true" : "false");
    renderPhases();
  });

  function buildReport(onlyProblems){
    var t = tally();
    var lines = [];
    lines.push("Influnet two-phone test run");
    lines.push("Tester: " + (document.getElementById("ab-who").dataset.tester || "unnamed"));
    lines.push("Build: " + (document.getElementById("ab-build").value || "not noted"));
    lines.push("Result: " + t.pass + " pass, " + t.issue + " issues, " + t.block + " blocked, " + t.na + " n/a, " + t.todo + " not run (of " + TOTAL + ")");
    lines.push("");
    PHASES.forEach(function(p){
      var rows = p.steps.filter(function(s){
        var r = results[s.id] || {};
        if (onlyProblems) return r.s === "issue" || r.s === "block";
        return !!r.s || !!(r.n && r.n.trim());
      });
      if (!rows.length) return;
      lines.push(p.n + " \\u2014 " + p.t);
      rows.forEach(function(s){
        var r = results[s.id] || {};
        var mark = r.s ? r.s.toUpperCase() : "\\u2014";
        lines.push("[" + mark + "] " + s.id + " (" + DEV[s.d].label + ") " + s.a);
        if (!onlyProblems) lines.push("    expected: " + s.e);
        if (r.n && r.n.trim()) lines.push("    note: " + r.n.trim().replace(/\\n/g, " "));
      });
      lines.push("");
    });
    if (onlyProblems && lines.filter(function(l){ return l.indexOf("[") === 0; }).length === 0){
      lines.push("No issues or blockers recorded.");
    }
    return lines.join("\\n");
  }

  function copyReport(onlyProblems, btn){
    var text = buildReport(onlyProblems);
    var original = btn.textContent;
    function done(ok){ btn.textContent = ok ? "Copied" : "Copy failed"; setTimeout(function(){ btn.textContent = original; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ done(true); }, function(){ done(false); });
    } else {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { done(document.execCommand("copy")); } catch (e) { done(false); }
      ta.remove();
    }
  }
  document.getElementById("copy-issues").addEventListener("click", function(e){ copyReport(true, e.target); });
  document.getElementById("copy-all").addEventListener("click", function(e){ copyReport(false, e.target); });

  document.getElementById("share-toggle").addEventListener("click", toggleShare);

  document.getElementById("share-copy").addEventListener("click", function(e){
    var input = document.getElementById("share-link");
    var btn = e.target;
    var original = btn.textContent;
    function done(ok){ btn.textContent = ok ? "Copied" : "Copy failed"; setTimeout(function(){ btn.textContent = original; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(input.value).then(function(){ done(true); }, function(){ done(false); });
    } else {
      input.select();
      try { done(document.execCommand("copy")); } catch (err) { done(false); }
    }
  });

  /**
   * Boot, most specific first.
   *
   * The run query parameter wins over this device's own session on purpose:
   * following a link to a colleague's run should show that run, not silently
   * swap you back into your own because you happen to have one open. "Start my
   * own run" in the banner drops the query string and lands on the normal path.
   */
  var sharedParam = new URLSearchParams(location.search).get("run");

  if (sharedParam){
    fetch(API + "?share=" + encodeURIComponent(sharedParam))
      .then(function(r){ return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function(d){
        startReadOnly(d.session.tester, d.session.build, d.session.results || {});
      })
      .catch(function(){
        // A revoked or mistyped link. Say so, then behave like a normal visit
        // rather than leaving a dead page.
        var say = document.getElementById("ts-say");
        say.className = "session-say bad";
        say.textContent = "That shared run is no longer available — it may have been unshared.";
        loadSharedRuns();
      });
  } else {
    // Resume an existing session on this device, if there is one.
    var existing = loadLocal();
    if (existing){
      fetch(API + "?session=" + encodeURIComponent(existing.id) + "&secret=" + encodeURIComponent(existing.secret))
        .then(function(r){ return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function(d){
          shareId = d.session.shareId || null;
          startApp(existing, d.session.tester, d.session.build, d.session.results || {});
        })
        .catch(function(){
          clearLocal();
          loadSharedRuns();
        });
    } else {
      loadSharedRuns();
    }
  }
})();
</script>
`;
}
