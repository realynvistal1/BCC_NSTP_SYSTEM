# Regression Test Guide

This guide is a lightweight checklist for rerunning the most important app checks after backend, auth, enrollment, attendance, upload, or certificate changes.

## Before Testing

1. Make sure MySQL is running on the configured host and port from `.env`.
2. Refresh local seed data when needed:

```bash
npm run db:setup
```

3. Start the app:

```bash
npm start
```

4. Open `http://localhost:3000`.

## Default Local Admin Accounts

- ROTC Admin: `bcc.rotc.admin@gmail.com` / `bcc@admin123`
- CWTS Admin: `bcc.cwts.admin@gmail.com` / `bcc@admin123`
- NSTP Director: `bcc.officer.admin@gmail.com` / `bcc@admin123`

## Student Flow

Check these routes or pages:

- Student login page: `/student/login`
- Enrollment page: `/enrollment`
- Student dashboard: `/student/dashboard`
- Enrollment status: `/student/enrollment-status`
- Attendance: `/student/attendance`
- Grades: `/student/grades`
- Serial number: `/student/serial-number`
- Re-enrollment: `/student/re-enrollment`

Expected checks:

- Student can submit enrollment with valid files.
- Invalid student ID format is rejected cleanly.
- Oversized or invalid upload types are rejected cleanly.
- Dashboard loads after login.
- Attendance list loads without SQL or server errors.
- Re-enrollment returns a normal business-rule message when not eligible.

## ROTC Admin Flow

Check these pages:

- `/admin/rotc/login`
- `/admin/rotc/dashboard`
- `/admin/rotc/enrollment-list`
- `/admin/rotc/platoon-roster`
- `/admin/rotc/grades`
- `/admin/rotc/offenses`
- `/admin/rotc/serial-number`
- `/admin/rotc/view-records`
- `/admin/rotc/attendance-summary`

Expected checks:

- Login succeeds with seeded credentials.
- Dashboard counts load.
- Enrollment list and roster load.
- Record list loads and filters still work.
- Certificate settings save successfully.
- Serial number list loads.
- Excel import rejects invalid files with `400`-style validation messages.

## CWTS Admin Flow

Check these pages:

- `/admin/cwts/login`
- `/admin/cwts/dashboard`
- `/admin/cwts/enrollment-list`
- `/admin/cwts/company-roster`
- `/admin/cwts/grades`
- `/admin/cwts/offenses`
- `/admin/cwts/serial-number`
- `/admin/cwts/view-records`
- `/admin/cwts/attendance-summary`

Expected checks:

- Login succeeds with seeded credentials.
- Dashboard counts load.
- Company roster loads.
- Record list loads and filters still work.
- Certificate settings save successfully.
- Serial number import rejects invalid files cleanly.

## Officer Flow

Check these pages:

- `/officer/login`
- `/officer/dashboard`
- `/officer/create-attendance`
- `/officer/view-attendance`
- `/officer/view-records`
- `/officer/cwts`

Expected checks:

- Login succeeds with seeded credentials.
- Dashboard loads ROTC/CWTS summaries.
- Attendance progress loads for ROTC and CWTS.
- Attendance sessions list loads.
- Malformed IDs do not expose unrelated records.

## Upload Validation Checks

Test these cases on enrollment, re-enrollment, certificate settings, and serial import:

- valid JPG, PNG, WEBP image upload
- valid PDF upload
- invalid SVG upload
- oversized upload above the allowed limit
- invalid Excel extension or MIME type

Expected behavior:

- valid files are accepted
- invalid files return a clean validation error
- the app does not crash with a generic `500`

## Auth and Security Checks

Use the full SQL injection checklist in [SQLI_DEFENSIVE_CHECKLIST.md](/c:/Users/QHTF/Documents/VERY_FINAL/BCC_NSTP_FINAL/SQLI_DEFENSIVE_CHECKLIST.md).

Quick repeat checks:

- malformed login identifier returns `401`, not `500`
- bad student ID input returns `400`
- bad admin email input returns `400`
- bad `ms_level`, `studentId`, and `sessionId` inputs return `400`
- protected routes still return `401` or `403` when unauthenticated or cross-portal
- repeated rapid requests to `/api/auth/login` eventually return `429`
- repeated rapid requests to other API routes eventually return `429`

## Good Final Result

The regression pass is healthy when:

- normal pages and API reads return `200`
- invalid inputs return controlled `400`, `401`, `403`, or `404`
- no raw SQL, stack traces, or table names leak in responses
- uploads reject bad content safely
- login works with the documented local credentials
