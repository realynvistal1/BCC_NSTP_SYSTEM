# Fixes in this version

## Refresh / blank page
- Restored the missing `services/systemService.js` required by authentication and student controllers.
- Added a reusable protected-page bootstrap with loading and error states.
- API requests explicitly keep same-origin authentication cookies and bypass stale cache.
- HTML/API responses use no-store headers.
- Mobile sidebar closes after selecting a navigation link.

## Enrollment List
- The list endpoint no longer transfers the large uploaded LONGTEXT files for every student.
- Full student data and uploaded requirements are loaded only when View / Edit is opened.
- Student detail modal is organized into Personal, Academic, Physical & Health, Address, Family, Emergency Contact, and Requirements sections.
- Uploaded images can be previewed inside the app in a full-screen viewer.
- Files/images can also be opened in a separate browser tab.
- Individual Approve and Approve All Pending no longer use browser confirmation dialogs.
- Rejection still uses the in-app reason box.

## Enrollment Schedule
- Schedule level and school year are auto-determined and locked in the UI.
- ROTC sequence is enforced: MS 1 -> MS 2 (same SY) -> next SY MS 1.
- CWTS sequence is enforced: CWTS 1 -> CWTS 2 (same SY) -> next SY CWTS 1.
- The backend independently validates the sequence, so MS/CWTS 2 cannot be forced through the API before Level 1 exists.
- Existing active/upcoming schedule blocking remains enforced.
