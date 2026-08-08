# BCC NSTP Project Structure

The project now follows a role-based HTML + CSS + JavaScript + Node.js + MySQL structure.

## Main folders

- `views/auth/` - login and public enrollment pages
- `views/student/` - student portal pages
- `views/admin/rotc/` - ROTC admin portal pages
- `views/admin/cwts/` - CWTS admin portal pages
- `views/officer/` - NSTP Director portal pages
- `public/css/` - shared stylesheets grouped by UI purpose
- `public/js/auth/` - public auth and enrollment scripts
- `public/js/student/` - student portal scripts
- `public/js/admin/rotc/` - ROTC admin portal scripts
- `public/js/admin/cwts/` - CWTS admin portal scripts
- `public/js/officer/` - officer portal scripts
- `public/js/common/` - shared browser helpers and reusable admin modules
- `routes/` - Express API route definitions by portal
- `controllers/` - backend request handlers and portal logic
- `services/` - reusable business rules such as attendance, certificate, and offense helpers
- `database/` - schema and seed/setup scripts
- `config/database.js` - MySQL connection pool
- `docs/flows/` - feature and process flow guides
- `docs/reference/` - structure and system-reference documents
- `docs/notes/` - recheck notes and version-specific notes
- `server.js` - main Express server entry file

## Portal URLs

- Student: `/student/login`
- ROTC Admin: `/admin/rotc/login`
- CWTS Admin: `/admin/cwts/login`
- NSTP Director: `/officer/login`

## Notes

The old giant `public/js/app.js` is removed. Each page now loads a page-specific JavaScript entry file, while shared UI and API helpers stay under `public/js/common/`.
