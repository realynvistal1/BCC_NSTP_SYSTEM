# BCC NSTP System — Flow Matched to the Uploaded Old System

This recreation uses HTML, CSS, JavaScript, Node.js, Express, and MySQL, while following the old project's actor flow and database rules.

## 1. Student Flow

### First enrollment
1. Student opens Enrollment.
2. Step 1: Academic Information.
3. Student selects ROTC or CWTS.
4. System checks the enrollment schedule for Level 1.
5. If enrollment is unavailable, the student cannot continue.
6. Step 2: Personal Information.
7. System checks Student ID duplication.
8. Step 3: Physical & Health Information.
9. Student uploads Medical Certificate; ROTC also requires X-ray.
10. Step 4: Account Setup.
11. Student enters email, username, password, confirm password, 2x2 photo, and COR.
12. System validates required information and files.
13. Student submits Enrollment Form.
14. System creates the student account and saves an MS/CWTS 1 record as Pending.
15. Student logs in and sees Enrollment Status.

### After admin review
- Pending: waiting for administrator verification.
- Approved: student can continue to assignment/attendance/grades.
- Rejected: the rejection reason is displayed in Enrollment Status.

### ROTC assignment
- Regular ROTC cadets are not assigned during approval.
- Admin runs Automatic Platoon Assignment after enrollment closes.
- Male cadets -> Battalion 1: Alpha, Bravo, Charlie, Delta.
- Female cadets -> Battalion 2: Echo, Foxtrot, Golf, Hotel.
- Four platoons per company.
- 37 cadets maximum per platoon.
- ROTC students with a medical condition are assigned to HQ during approval, matching the old source logic.

### CWTS assignment
- Approval automatically assigns a company.
- Companies: Alpha, Bravo, Charlie, Delta, Echo, Foxtrot.
- 60 students maximum per company.
- The old source fills the first company with an available slot, then continues to the next company.

### Attendance
1. NSTP Director creates an attendance session with program, level, date/time, coordinates and radius.
2. Approved student opens Attendance.
3. Student grants browser geolocation permission.
4. System verifies program, level, schedule, and allowed radius.
5. If valid, attendance is stored as Present.
6. Director can monitor the complete eligible-student list and set Present/Late/Absent.

### Grades
- ROTC/CWTS Admin encodes Midterm and Final grades.
- Allowed scale: 1.00–5.00.
- Average = (Midterm + Final) / 2.
- 1.00–3.00 = Passed; above 3.00 = Failed.
- Student views released grades.

### Level 2 / re-enrollment
1. Student opens Apply Enrollment.
2. Level 1 enrollment must already be Approved.
3. Level 2 schedule must be open.
4. Duplicate pending/approved Level 2 enrollment is blocked.
5. New Level 2 record is saved as Pending.
6. Existing platoon/company assignment is retained when Level 2 is approved, matching the old admin detail logic.

## 2. ROTC Admin Flow

1. Log in through ROTC Admin Portal.
2. Create MS 1 / MS 2 enrollment schedules.
3. Open Enrollment List and review submitted records.
4. Approve or Reject with rejection reason.
5. Medical-condition ROTC students -> HQ during approval.
6. After enrollment closes, open Platoon Roster and run Assign Platoons.
7. Review Battalion 1, Battalion 2 and Special Platoon rosters.
8. Review attendance summaries.
9. Encode grades.
10. Manage attendance offenses.
11. Issue serial numbers / completion records.
12. View student records.
13. Review Advance Course withdrawal requests.
14. Settings / password / logout.

## 3. CWTS Admin Flow

1. Log in through CWTS Admin Portal.
2. Create CWTS 1 / CWTS 2 enrollment schedules.
3. Open Enrollment List and review submitted records.
4. Approve or Reject.
5. On approval, system automatically assigns Alpha–Foxtrot company using the old capacity rule.
6. View Company List.
7. Review attendance summaries.
8. Encode grades.
9. Manage attendance offenses.
10. Issue serial numbers / completion records.
11. View student records.
12. Settings / password / logout.

## 4. NSTP Director / Officer Flow

1. Log in through NSTP Director Portal.
2. View ROTC Battalion 1, Battalion 2, Advance Course, Special Platoon, and CWTS rosters.
3. Open Create Attendance.
4. Select ROTC/CWTS, level, school year, MI number/type, opening/closing time, location and radius.
5. System stores session as Scheduled/Open/Closed according to time.
6. Open View Attendance.
7. Select a session.
8. System displays all eligible students, including students who have not marked attendance.
9. Director monitors and can set Present, Late, or Absent.
10. View student records.
11. Settings / logout.
