# BCC ROTC & CWTS NSTP System

This application is a school management system for the Buenavista Community College NSTP program. It is built to support the daily workflow of students, ROTC administrators, CWTS administrators, and the NSTP Director.

The system is used for:

- student enrollment and re-enrollment
- separate portal login by user role
- enrollment review and approval
- ROTC platoon assignment
- CWTS company assignment
- attendance session creation and attendance tracking
- grade encoding and monitoring
- attendance offense monitoring
- serial number and certificate management
- student record viewing and administrative review

This build runs as a web application using:

- HTML
- CSS
- Vanilla JavaScript
- Node.js + Express
- MySQL (`mysql2`)

## Security Notes

- SQL injection defenses use prepared execution, validated inputs, escaped search patterns, and disabled multi-statement runtime queries.
- Stronger DoS protection is enabled with in-memory rate limits on `/api/*`, stricter limits on `/api/auth/*`, temporary IP blocking after repeated abuse, and per-IP concurrency caps.
- Google reCAPTCHA v3 can be enabled on login and password-reset flows with `GOOGLE_RECAPTCHA_ENABLED=true` plus site/secret keys in `.env`.
- If the app runs behind Nginx, Apache, Cloudflare, or another proxy, set `TRUST_PROXY_HOPS` in `.env` so IP-based rate limiting uses the correct client address.

## Cloudflare Setup

For a stronger external layer in front of Node.js:

- Put the site behind Cloudflare proxy DNS
- Set `TRUST_PROXY_HOPS=1` in `.env`
- Restrict direct origin access if your hosting allows it
- Enable Cloudflare WAF managed rules, Bot Fight Mode, and rate limiting/challenge rules for `/api/auth/*`
- Keep Google reCAPTCHA enabled on the login and reset flows for an extra human-verification layer

## Included portals

1. Student Portal
2. ROTC Admin Portal
3. CWTS Admin Portal
4. NSTP Director Portal

## Main features

- student enrollment and re-enrollment
- separate role-based login portals
- enrollment schedule management
- enrollment approval/rejection
- automatic ROTC platoon assignment
- automatic CWTS company assignment
- geolocation attendance sessions and student marking
- attendance monitoring
- grades
- attendance offenses
- serial numbers
- student records
- advance course withdrawal review
- account settings/password changes

## Setup

1. Install Node.js 20+ and MySQL/XAMPP/Laragon.
2. Open this folder in VS Code.
3. Copy `.env.example` to `.env` if needed and configure MySQL.
4. Run:

```bash
npm install
npm run db:setup
npm start
```

5. Open `http://localhost:3000`.

## Default accounts created by `npm run db:setup`

- ROTC Admin: `bcc.rotc.admin@gmail.com` / `bcc@admin123`
- CWTS Admin: `bcc.cwts.admin@gmail.com` / `bcc@admin123`
- NSTP Director: `bcc.officer.admin@gmail.com` / `bcc@admin123`

Students create their account through `/enrollment`.

## Important

Change all default passwords and `JWT_SECRET` before real deployment.

If your local database was seeded before this update, rerun `npm run db:setup` or `npm run db:seed` so the `admins` table matches the documented credentials.

The database structure is used as the base design for this system, while the application flow is implemented through standard Express routes, controllers, and browser `fetch()` calls.

## Testing Guides

- Normal flow and regression checks: `REGRESSION_TEST_GUIDE.md`
- SQL injection defensive checks: `SQLI_DEFENSIVE_CHECKLIST.md`
- Automated SQL hardening verification: `npm run verify:sqli`

## Flow Matching

See `docs/reference/EXACT_SYSTEM_FLOW.md`. This build follows the old uploaded system's actor order, enrollment schedule checks, MS/CWTS 1 first-enrollment rule, pending admin verification, CWTS company capacity, ROTC sex-based battalion assignment, 4 platoons per company, 37 ROTC slots per platoon, geolocation attendance, 1.00–5.00 grading, and Level 2 re-enrollment flow.


## Separate Portal URLs

The portals are intentionally separated. There is no combined portal chooser page.

- Student: `http://localhost:3000/student/login`
- ROTC Admin: `http://localhost:3000/admin/rotc/login`
- CWTS Admin: `http://localhost:3000/admin/cwts/login`
- NSTP Director: `http://localhost:3000/officer/login`

`/` redirects to the Student Portal. Each login endpoint validates the account against its required portal and each protected page validates the signed-in portal before loading its data.

### Login pictures
The original React source references `student-login.png`, `rotc-login.png`, `cwts-login.png`, `officer-login.png`, and the BCC logo, but those binary files were not inside the uploaded `src` archive. This recreation includes matching vector visual assets in `public/image/`. If the original `public/image` folder is copied into the project later, the login pages can use the exact original photos.

## Original image assets included

This build uses the supplied Buenavista Community College/NSTP images directly:

- `bcclogo-removebg-preview.png` - BCC logo
- `student-login.png` - Student portal background
- `rotc-login.png` - ROTC administrator portal background
- `cwts-login.png` - CWTS administrator portal background
- `officer-login.png` - NSTP Director portal background
- CHED, CWTS, NSTP/ROTC, Republic/ROTC and TESDA partner emblems are also included in `public/image/` and used in portal branding.

### Separate portal URLs

- Student: `http://localhost:3000/student/login`
- ROTC Admin: `http://localhost:3000/admin/rotc/login`
- CWTS Admin: `http://localhost:3000/admin/cwts/login`
- NSTP Director: `http://localhost:3000/officer/login`

Each portal validates the account role before allowing access to its dashboard.


## Enrollment Schedule and Enrollment List UI update

The ROTC Admin and CWTS Admin enrollment modules were rebuilt from the old system flow:

- separate ROTC and CWTS schedule pages
- Current Enrollment and Enrollment History sections
- Open / Upcoming / Closed schedule status
- blocks a second schedule while the current schedule is open or upcoming
- validates opening and deadline dates
- prevents duplicate level + school-year schedules
- separate ROTC and CWTS enrollment lists
- lists every submitted enrollment record for the selected program
- status tabs: All, Pending, Approved, Rejected
- filters for level, school year, year level, course, medical condition, and search
- medical-condition rows are highlighted
- View / Edit detail modal shows enrollment information and uploaded requirements
- approve, reject with remarks, return to pending
- Approve All Pending for the currently filtered list

ROTC approval keeps regular cadets unassigned until the separate automatic platoon assignment action after enrollment closes. CWTS approval automatically assigns a company, following the old system flow.

## Platoon and Company Assignment UI

This build recreates the old assignment screens:

- ROTC Platoon List with MS selector, summary cards, enrollment-close lock, Assign Platoons action, Battalion 1 (Male), Battalion 2 (Female), Advance Course, and Special Platoon sections.
- ROTC rules: Alpha–Delta for Battalion 1, Echo–Hotel for Battalion 2, 4 platoons/company, 37 cadets/platoon; medical condition -> HQ, Medics preference -> Medics (37 max), MP preference -> MP (37 max), Advance Course kept separate.
- CWTS Company List with Alpha–Foxtrot, 60 students/company, automatic company assignment on approval, capacity summaries, alphabetical sorting, and expandable company member tables.
