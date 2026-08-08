# BCC NSTP Geolocation Attendance Flow

This recreation follows the old system attendance flow.

## 1. NSTP Director — Create Attendance

1. Select ROTC, CWTS, or Advance Course.
2. The system resolves the current enrollment cycle (MS/CWTS level and school year).
3. There are 15 MI sessions for ROTC/Advance Course and 15 Community Service sessions for CWTS.
4. Each number has an IN and OUT attendance session.
5. MI/CS 1 IN must be created first.
6. OUT cannot be created until the corresponding IN has fully closed, including the 15-minute Late period.
7. The next MI/CS number stays locked until both IN and OUT of the previous number exist.
8. Director sets opening time, on-time closing time, and the approved location.
9. Radius is fixed at 100 meters, matching the old source constant.
10. The system saves the session as Scheduled, Open, or Closed based on time.

## 2. Student — Geolocation Attendance

1. Student must be logged in and have an Approved enrollment for the correct program/level.
2. Students with a serial number are treated as completed and no longer mark attendance.
3. ROTC Advance Course uses its own sessions; regular/special ROTC students use regular ROTC sessions.
4. The browser obtains the student's current location.
5. The backend calculates distance to the Director's approved coordinates using Haversine distance.
6. Student must be within 100 meters.
7. Before the on-time closing time: Present.
8. From the closing time until 15 minutes later: Late.
9. After the 15-minute grace period: attendance is closed.
10. The record stores time, location, and distance for audit/review.
11. The same student cannot mark the same session twice.

## 3. Automatic Absent

When the 15-minute grace period ends, eligible approved students who did not mark the session are inserted as Absent when the system refreshes attendance status.

## 4. NSTP Director — View Attendance

The Director can filter by program, cycle, MI/CS number, and IN/OUT. Each session shows Open/Scheduled/Late/Closed state and can expand to all eligible students. Present, Late, Absent, and Not Yet Marked are counted. The Director can correct a student's status when needed.

## 5. ROTC Admin — Attendance Summary

The ROTC summary supports cycle, MI, IN/OUT, status search, and old roster groupings:
- Overall
- Battalion 1 — Male
- Battalion 2 — Female
- Advance Course
- Special Units (Medics, HQ, MP)

Student assignment, time, geolocation distance, and status are displayed. Admin may verify/correct status.

## 6. CWTS Admin — Attendance Summary

CWTS summary uses the same cycle and MI/CS selection, then organizes approved students by CWTS company. It includes Present, Late, Absent, and Not Yet Marked status totals, search/filtering, time, distance, and status verification.

## Attendance Summary Downloads

ROTC Admin and CWTS Admin Attendance Summary pages include **Download PDF** and **Download Excel** buttons.
The exported file follows the active School Year/Level, MI/CS, IN/OUT, group, status, and search filters.
Reports include student ID, student name, course/year, assignment, attendance time, geolocation distance, attendance status, and totals.

## Student Geolocation

When the student presses **Mark Attendance**, the browser requests the student's current device location. The Node.js backend calculates the distance between the student's submitted coordinates and the NSTP Director's configured attendance location. The record is accepted only when it satisfies the configured attendance radius and time rules.

Browser/device location permission is a security feature controlled by the browser or operating system. The application cannot silently bypass the first location-permission prompt. Once location access is granted according to browser settings, subsequent behavior depends on the browser/device permission configuration.
