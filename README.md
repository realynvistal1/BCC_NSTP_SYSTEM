# BCC ROTC & CWTS NSTP System

The BCC ROTC & CWTS NSTP System is a web-based management platform for Buenavista Community College. It organizes the full NSTP workflow for ROTC and CWTS, from student enrollment up to attendance, grading, records, and completion monitoring.

This system is built to keep NSTP operations in one connected platform where each role has its own portal and responsibilities:

- Students use the system to register, submit enrollment requirements, view assignments, mark attendance, check grades, and access their records.
- ROTC Admin uses the system to manage ROTC schedules, review applicants, assign battalions, companies, and platoons, monitor attendance, encode grades, and manage offenses and serial numbers.
- CWTS Admin uses the system to manage CWTS schedules, review applicants, assign companies, monitor attendance, encode grades, and manage offenses and serial numbers.
- NSTP Director uses the system to oversee attendance sessions, review student attendance records, and monitor ROTC and CWTS participation across the program.

## What this system is about

- Centralized NSTP management for Buenavista Community College
- Separate but connected ROTC and CWTS workflows
- Role-based access for Students, ROTC Admin, CWTS Admin, and NSTP Director
- Attendance monitoring with time, location, and radius controls
- Academic and administrative tracking through grades, offenses, records, and assignment lists
- Structured support for battalions, platoons, companies, special units, and advance course handling

## Technology stack

- HTML
- CSS
- Vanilla JavaScript
- Node.js + Express
- MySQL (`mysql2`)

## Included portals

1. Student Portal
2. ROTC Admin Portal
3. CWTS Admin Portal
4. NSTP Director Portal

## Included modules

- student enrollment and re-enrollment
- separate role-based login portals
- enrollment schedule management
- enrollment approval and rejection
- automatic ROTC platoon assignment
- automatic CWTS company assignment
- geolocation attendance sessions and student marking
- attendance monitoring
- grades
- attendance offenses
- serial numbers
- student records
- advance course withdrawal review
- account settings and password changes

## Core functions

- manage NSTP enrollment by role and program
- separate ROTC and CWTS workflows while keeping a shared system structure
- support attendance sessions with date, time, location, and radius controls
- record and review attendance results such as present, late, and absent
- manage ROTC battalion, company, platoon, and special unit assignments
- manage CWTS company assignments
- store student grades, offense records, and serial numbers
- provide student-facing access to enrollment, attendance, grades, and certificate-related information

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

- ROTC Admin: `bcc.rotc.admin@gmail.com` / `rotc@admin`
- CWTS Admin: `bcc.cwts.admin@gmail.com` / `cwts@admin`
- NSTP Director: `bcc.officer.admin@gmail.com` / `officer@admin`

Students create their account through `/enrollment`.

## Important

Change all default passwords and `JWT_SECRET` before real deployment.

## Separate Portal URLs

The portals are intentionally separated. There is no combined portal chooser page.

- Student: `http://localhost:3000/student/login`
- ROTC Admin: `http://localhost:3000/admin/rotc/login`
- CWTS Admin: `http://localhost:3000/admin/cwts/login`
- NSTP Director: `http://localhost:3000/officer/login`

`/` redirects to the Student Portal. Each login endpoint validates the account against its required portal and each protected page validates the signed-in portal before loading its data.

## Included image assets

This project uses the supplied Buenavista Community College and NSTP image assets directly:

- `bcclogo-removebg-preview.png` - BCC logo
- `student-login.png` - Student portal background
- `rotc-login.png` - ROTC administrator portal background
- `cwts-login.png` - CWTS administrator portal background
- `officer-login.png` - NSTP Director portal background
- CHED, CWTS, NSTP/ROTC, Republic/ROTC, and TESDA partner emblems used in portal branding

## Enrollment schedule and enrollment list

The ROTC Admin and CWTS Admin enrollment modules include:

- separate ROTC and CWTS schedule pages
- Current Enrollment and Enrollment History sections
- Open / Upcoming / Closed schedule status
- schedule locking while the current schedule is open or upcoming
- opening and deadline date validation
- duplicate level and school-year protection
- separate ROTC and CWTS enrollment lists
- full submitted enrollment records per selected program
- status tabs: All, Pending, Approved, Rejected
- filters for level, school year, year level, course, medical condition, and search
- medical-condition row highlighting
- detail modal for enrollment information and uploaded requirements
- approve, reject with remarks, and return-to-pending actions
- Approve All Pending for the currently filtered list

## Platoon and company assignment

The assignment modules include:

- ROTC Platoon List with MS selector, summary cards, enrollment-close lock, Assign Platoons action, Battalion 1, Battalion 2, Advance Course, and Special Platoon sections
- ROTC rules for Alpha-Delta in Battalion 1, Echo-Hotel in Battalion 2, 4 platoons per company, and 37 cadets per platoon
- medical condition to HQ assignment
- Medics preference assignment with 37 maximum
- MP preference assignment with 37 maximum
- Advance Course kept separate
- CWTS Company List with Alpha-Foxtrot, 60 students per company, automatic company assignment on approval, capacity summaries, alphabetical sorting, and expandable company member tables
