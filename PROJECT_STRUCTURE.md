# BCC NSTP Project Structure

The project now follows the requested HTML + CSS + JavaScript + Node.js + MySQL structure.

## Where to edit

- `views/` — actual readable HTML page structure. The pages are no longer one compressed line.
- `public/css/` — UI styles grouped by purpose.
- `public/js/` — browser logic grouped by portal/page.
- `routes/` — Express API route definitions.
- `controllers/` — backend request/database logic.
- `services/` — dedicated location for reusable business logic.
- `config/database.js` — MySQL connection.
- `database/schema.sql` — MySQL tables.
- `server.js` — main Node.js/Express server entry file.

## Separate portals

- Student: `/student/login`
- ROTC Admin: `/admin/rotc/login`
- CWTS Admin: `/admin/cwts/login`
- NSTP Director: `/officer/login`

The old giant `public/js/app.js` is removed. Each page now loads a page-specific JavaScript entry file. Shared UI/API helpers are under `public/js/common/`.
