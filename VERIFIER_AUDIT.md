# Attendance verifier audit — October 5, 2026

Reviewed the ROTC Advanced Course verifier and CWTS instructor routes, assignment scope, attendance writes, offense rules, student history, Director notifications, invitation setup, password reset, and recent UI changes.

## Fixed during this audit

- ROTC now rejects corrections to existing records before the attendance session opens, matching its rule for Unmarked students and the CWTS rule.
- Invitation submission targets the submit button explicitly, so password visibility eye buttons cannot be mistaken for the submit control.

## Checks passed

- `node scripts/verify-rotc-verifiers.js`: scoped access, false-Present punishment without duplicates, no punishment for automatic or Unmarked absences, corrections, settlement, stale forms, session timing, closure rollback/retry, and audit records.
- `node scripts/verify-cwts-instructors.js`: invitation lifecycle, login and role restrictions, company/session scope, reassignment and revocation, stale corrections, rollback, offenses, named history, and shared-login password reset through HTTP. Reset checks include cooldown, incorrect codes, concurrent single use, invalidation of existing sessions, and retained instructor role.
- `node scripts/verify-cwts-ui.js`: assignment cards and selection controls, totals, empty state, student attribution for both programs, invitation refresh, and submission with eye buttons present.
- `node scripts/verify-attendance-updates-ui.js` and its `--cwts` variant: Director update popup, escaped reasons, dismissal, live refresh, and protection against interrupting another open form.
- Student attendance alerts, verifier list filters/pagination, assignment refresh, and stale-form UI checks passed.
- Password-change OTP regression: 72 checks. Email-change regression: 34 checks.
- JavaScript syntax checks passed for 25 connected files.

Database tests used synthetic fixtures and cleaned them afterward. Email delivery was mocked; no real test messages were sent.

## Remaining live checks

The current invitation origin is `http://localhost:3000`. An instructor on another device needs a reachable deployment address and a newly sent invitation using that address.

No browser was available to this session. Automated rendering and handler tests do not replace a visual check or a real two-device walkthrough. Restart the application to load server changes, then verify the Director assignment, instructor/student verifier correction, and student history screens in the running deployment.
