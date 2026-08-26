# SQL Injection Defensive Checklist

This checklist is for authorized defensive testing of the BCC NSTP system. Use it to verify that user input is handled as data, not executable SQL.

## Goal

- Confirm that malicious-looking input does not change query behavior.
- Confirm that the app returns controlled validation or auth errors instead of database errors.
- Confirm that protected routes stay protected even when inputs are malformed.

## Safe Testing Rules

- Test only against a local or explicitly authorized environment.
- Do not use destructive database actions.
- Prefer clearly invalid text strings over aggressive attack strings.
- Stop if testing would affect real student/admin data.

## Expected Good Behavior

- The app returns `400`, `401`, `403`, `404`, or a normal validation message when input is bad.
- The app does not return raw SQL, stack traces, or MySQL error details.
- Logins fail cleanly without changing auth state.
- List filters return empty or normal results, not expanded datasets.
- Record lookups do not return another user’s data.

## High-Priority Routes

### Auth

- `POST /api/auth/login`
  Fields to probe safely: `identifier`, `username`, `email`, `password`
  Expected: invalid credentials or lockout behavior, never login bypass.

- `POST /api/auth/forgot-password/request-code-student`
  Fields: `student_id`, `email`
  Expected: normal not-found or success messaging, no SQL errors.

- `POST /api/auth/forgot-password/reset-student`
  Fields: `student_id`, `email`, `verification_code`
  Expected: invalid code / not found / validation errors only.

- `POST /api/auth/forgot-password/request-code`
  Fields: `portal`, `email`
  Expected: portal validation and normal account lookup behavior only.

- `POST /api/auth/forgot-password/reset-admin`
  Fields: `portal`, `email`, `verification_code`
  Expected: invalid code / not found / validation errors only.

- `POST /api/auth/change-password`
  Fields: `currentPassword`, `newPassword`
  Expected: auth or validation failure only, no query leakage.

### Public Student Enrollment

- `GET /api/student/enrollment-schedule`
  Query params: `program`, `ms_level`
  Expected: validation errors or schedule response only.

- `GET /api/student/check-student-id`
  Query param: `student_id`
  Expected: `exists: true/false`, never SQL errors.

- `POST /api/student/register`
  High-risk fields: `student_id`, `email`, `username`, name fields, address fields
  Expected: duplicate/validation errors only, no broken insert logic.

### Student Protected Routes

- `POST /api/student/re-enroll`
  High-risk fields: text profile fields and optional file-backed fields stored as data URLs
  Expected: validation/auth responses only.

- `POST /api/student/withdrawal`
  Field: `reason`
  Expected: normal pending/duplicate validation only.

- `POST /api/student/attendance/mark`
  Fields: `attendance_session_id`, coordinates
  Expected: validation or session state errors only.

### Admin Routes

Test both:

- `/api/admin/rotc/*`
- `/api/admin/cwts/*`

Focus on:

- `GET /enrollments`
- `GET /roster`
- `GET /records`
- `GET /records/:studentId`
- `GET /records/download/profiles`
- `GET /attendance-summary`
- `PATCH /enrollments/:id`
- `POST /bulk-approve`
- `POST /bulk-reject`
- `POST /grades`
- `POST /offenses`
- `POST /serial-numbers`
- `POST /serial-numbers/import`

High-risk inputs:

- query params: `search`, `ms_level`, `school_year`, `group`, `all_cycles`
- route params: `id`, `studentId`, `sessionId`
- body fields: `status`, `rejection_reason`, grade values, serial numbers

Expected:

- malformed filters do not widen result sets unexpectedly
- numeric route params do not expose unrelated records
- bulk action arrays ignore bad IDs safely
- import and serial assignment reject bad rows cleanly

### Officer Routes

- `GET /api/officer/roster/:group`
- `GET /api/officer/records/:studentId`
- `POST /api/officer/attendance/sessions`
- `POST /api/officer/attendance/sessions/:id/records`
- `PATCH /api/officer/attendance/records/:id`

Expected:

- invalid `group` values do not alter query scope unexpectedly
- record/session IDs do not expose cross-record data
- attendance status changes accept only expected enum values

## Recommended Safe Input Cases

Use simple malformed values like:

- unmatched quote: `'`
- quote wrapped text: `'abc'`
- boolean-looking text: `' OR test`
- comment-looking text: `abc -- test`
- union-looking text: `union test`
- numeric edge values: `0`, `-1`, very large numbers
- mixed garbage in numeric fields: `1abc`

Do not rely on whether a payload is “classic SQLi.” The point is whether the app stays safe and predictable.

## What To Watch In Responses

- database syntax errors
- stack traces
- MySQL table or column names
- different auth behavior for malformed identifiers
- larger-than-expected result sets
- wrong user/student/admin records appearing

## Route-to-Risk Notes

- Login and reset flows are high-value because a query bug there could become account compromise.
- Record list and roster pages are high-value because a filter bug could expose broader student data.
- Detail routes are high-value because broken `id` handling can cause horizontal data exposure.
- Bulk admin actions are high-value because bad ID handling can change many rows at once.

## Regression Checks After Changes

- ROTC admin cannot access CWTS admin APIs.
- CWTS admin cannot access ROTC admin APIs.
- Wrong-portal users are redirected away from protected HTML pages.
- No public `/uploads/*` browsing is available.
- Bad text input into search and ID fields does not produce SQL errors.

## Current Codebase Notes

- The backend mostly uses `mysql2` parameterized `db.execute(...)`.
- Dynamic SQL fragments were reduced in recent hardening work, but this checklist should still be rerun after backend changes.
- Frontend file uploads currently flow mainly as data URLs stored in the database, so text validation and backend parameterization matter more than filesystem path handling here.
