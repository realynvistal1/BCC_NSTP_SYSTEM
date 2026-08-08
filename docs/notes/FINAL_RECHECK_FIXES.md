# Final Recheck Fixes

This version performs the final repair pass requested for the BCC NSTP recreation.

## View Records downloads
- Fixed the ROTC/CWTS View Records Excel download trigger.
- The generated file follows the active search, level, and school-year filters.
- The browser download element is now attached to the document before clicking and is cleaned up after download.

## NSTP Director — View Attendance
- Student records remain grouped under the selected attendance session.
- Added an old-style Update Attendance modal.
- The Director can change a student's status to Present, Late, or Absent.
- The change is stored with verifier email and verification time.

## Attendance offense flow
The old-system behavior is restored:
1. A student marks attendance as Present/Late.
2. During verification, the NSTP Director may update that record.
3. If the Director changes Present/Late to Absent, an attendance offense is recorded.
4. First offense = Warning.
5. The student sees a warning modal and must acknowledge it.
6. Second offense = Not following instructions / settlement required.
7. The student is shown a blocking action-required modal and cannot continue normal system use.
8. ROTC/CWTS Admin opens Attendance Offenses and marks the second offense as Settled.
9. Once settled, the blocking notice no longer appears.

Changing an unmarked student directly to Absent does not create an offense, because the old flow treats the offense as a verification violation of an already marked Present/Late record.

## Admin Attendance Offenses
- Removed the manual editable offense-number field.
- Shows only students with recorded offenses.
- Summary: Total, Warning, Need Settlement.
- Filters: All, Warning, Not following instructions, level, school year, search.
- View Detail modal shows offense level, settlement state, acknowledgement, and recorded date.
- Second offenses can be marked Settled by the correct ROTC/CWTS Admin.

## Student Attendance Offense notice
- First offense: warning modal, "Got it, I understand" acknowledgement.
- Second unsettled offense: blocking modal with logout only.
- The warning check runs when a Student portal page loads.

## Validation
- All JavaScript files pass `node --check`.
- Existing database schema already contains the required offense fields:
  `offend`, `settled`, and `warning_acknowledged_at`.
