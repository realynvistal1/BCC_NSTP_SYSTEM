# Test checklist — FacultyEval 3.0

1. `npm run check`, `npm run doctor`, then `npm start`.
2. Create a faculty account through all **four steps** and upload a test photo. Verify department dropdown and preview.
3. In the same `/login.html`, sign in as admin and approve the pending faculty member. Check photo in the admin profile preview.
4. Sign in as faculty. Visit **My Profile**, update position and photo, save, and refresh the page to confirm persistence.
5. Admin creates a draft period, adds/edits shared questions, opens it. Faculty accepts the period and adds a subject/section. Admin approves.
6. Faculty copies the student link. Verify it opens **without login** in an incognito browser and on a different device using a reachable server URL.
7. Student rates every question; incomplete forms are blocked. Submit once and see success. Verify faculty and admin response totals/averages changed.
8. Test on desktop and phone widths. Test invalid links, closed dates, suspended faculty, and one-time-code mode if enabled.
9. Confirm CSV export and report printing. Confirm instructors cannot view other instructors' results.

**Important:** Static file/syntax checks cannot prove MySQL calls work. A live XAMPP MySQL integration test is still required.
