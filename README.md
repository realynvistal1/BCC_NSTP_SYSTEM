# FacultyEval — MySQL · Separate Admin and Instructor Portals

A faculty evaluation system with **two different staff portals** and **one public student evaluation form (no student login)**.

## Portals

- **Administrator:** `http://localhost:5000/admin/login.html` — create periods, edit one shared questionnaire, approve instructor accounts and subject assignments, see instructor profiles and profile photos, view historical results, charts and CSV/print reports, and issue private password reset links.
- **Instructor:** `http://localhost:5000/faculty/login.html` — register in three steps, upload a photo, wait for approval, choose subjects/sections for each school year, accept evaluation, copy individual subject links, view personal ratings and feedback.
- **Student form:** `/evaluate/<unique token>` — no login required; opens after account approval, subject approval, period acceptance, and the scheduled opening time.

## New Windows setup (XAMPP)

1. **Back up** your previous installation and database first. Extract this ZIP into its own folder. Do not replace the old project before testing.
2. Start **Apache** and **MySQL** in XAMPP and open `http://localhost/phpmyadmin`.
3. For a **new installation**, import `database/schema.sql` via phpMyAdmin's Import tab. This creates `faculty_evaluation`.
4. For an **existing v3/v4 database**, **do not re-import the schema**. Export your database as a backup, then import only `database/upgrade_v5.sql`. If the old MySQL schema lacks the instructor profile columns, apply `database/upgrade_existing.sql` **once** before the v5 upgrade. Never apply `upgrade_existing.sql` again if those columns already exist.
5. Open this extracted project in VS Code, then run these commands in the **main project folder**:

   ```powershell
   npm install
   npm run setup
   npm run doctor
   npm run create-admin
   npm start
   ```

6. `npm run setup` creates `backend/.env` (if missing), generating JWT/CODE secrets. Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `.env` to match MySQL. With default XAMPP: user `root`, password empty.
7. For administrator credentials, **you choose the administrator name, email and secure password** when running `npm run create-admin`. No default password is included in this project. Sign in through `/admin/login.html` using what you entered.

A web server error or database error? Run `npm run doctor` and read the error message. **Node.js 20+** is required. Use `npm run check` to validate required code files without MySQL.

## Real evaluation flow

1. Instructor registers and optionally uploads a photo. Admin approves the account and can view instructor information and photo.
2. Admin creates an evaluation **school year** by selecting its **starting year** (e.g. 2026 means school year 2026–2027), picks opening/closing times, edits the same questionnaire, then opens the period.
3. Instructor accepts the open evaluation, adds each subject / year level / section, and waits for admin to approve each teaching assignment.
4. An **approved** subject shows its own public link in the instructor dashboard. Open the form in a new tab or copy and send the URL to students.
5. Students answer the questions anonymously. MySQL stores their responses. The instructor's circle rating and history bar chart update after refresh; admin can see all reports and exports.
6. Prior school years remain stored and can be browsed in Admin Reports.

**Important link requirement:** `http://localhost:5000/...` is visible only on the computer running Node.js. To open the link on student phones, deploy your site to an HTTPS public domain, OR while on the same Wi-Fi use the computer's LAN IP and open the Windows firewall for port 5000. For example, `http://192.168.1.23:5000/evaluate/<token>` **only if** that is your computer's actual IP and reachable. A link is active only after the admin approves the assignment and the evaluation window is open.

## Password recovery (no email account needed)

- Either portal's login screen links to **Forgot password?** Enter the account's email to create a private administrator recovery request.
- Administrator signs in, selects **Password Help**, and clicks **Generate reset link**. Send the link **privately** to the person whose email appears in the request.
- The person opens the link, chooses a new 10+ character password and can sign in again.
- Reset links expire after **30 minutes**, work **once**, and are stored **only as SHA-256 hashes**. The app does **not** send reset emails by itself and should not be described as doing so.
- If you have only one admin and that administrator loses their password, an authorized person with database/server access can create another admin using `npm run create-admin` (with a different email) to complete recovery. Never share a common admin password.

## Privacy, safety and limitations

- Without one-time access codes, an open survey link can be reused by anyone holding it; optional codes prevent multiple redemptions per code but do not verify student identity.
- Profile pictures are stored as validated, small image BLOBs in MySQL, not under a public writable directory.
- Never commit `backend/.env` or expose JWT_SECRET / CODE_PEPPER in GitHub.
- Accounts, photo uploads, routes, JavaScript syntax and page layouts have been checked statically, **but a live MySQL evaluation end-to-end test must be performed with your local XAMPP database**.

## Useful commands

| Command | Action |
| --- | --- |
| `npm install` | Install Node.js dependencies |
| `npm run setup` | Create `.env` / security secrets when missing |
| `npm run doctor` | Diagnose MySQL and configuration |
| `npm run create-admin` | Register a new administrator securely |
| `npm run check` | Offline file and syntax verification |
| `npm start` | Start the website |

Contact support with the **first red terminal error**, not a screenshot of private passwords or secret keys.
