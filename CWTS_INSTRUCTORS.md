# CWTS instructor invitations

Instructors use the existing CWTS login with their own email and password. Their account can access only attendance for assigned companies and exact CS IN/OUT sessions. It cannot access CWTS administration, grades, enrollment, or Director tools.

## Deployment

1. Run `npm run db:migrate:cwts-instructors` before starting the updated application.
2. Configure `GMAIL_USER` and `GMAIL_APP_PASSWORD` for email delivery.
3. Set `PUBLIC_APP_URL` to the actual public HTTPS origin where this application is hosted, without a path. A made-up address cannot deliver instructors to the application. HTTP localhost is accepted only for local testing; it does not work from another person's device.
4. Restart the application after changing environment settings.

The Director screen displays a setup notice and disables invitation sending while email or the public website address is missing. No domain is registered or hosting created by this feature.

## Director workflow

Open **CWTS Instructors**. Enter the instructor's name and email, then select **Create account & send invitation**. The email subject is **NSTP CWTS Attendance Invitation**. The instructor opens its one-time link, sets their own password, and signs in through the existing CWTS login.

Assign the instructor to a company and an existing attendance session. A pending instructor can be assigned in advance, but cannot sign in until they accept the invitation. Assigning a different instructor to the same company and session replaces the previous instructor's access immediately. Past corrections retain their original author.

Invitation links expire after 24 hours. Sending another invitation invalidates the previous link. Delivery failures leave a visible pending account with **Delivery failed**, so the Director can retry. Successful sends have a 60-second resend cooldown. For password recovery, use **Send password setup link**; accepting it also invalidates existing instructor sessions.

**Revoke assignment** removes access to that company/session. **Disable account** blocks all instructor access and invalidates existing sessions and invitation links. Re-enabling an account does not restore its old login sessions or consumed invitation links.

## Attendance rules

- A student who claimed Present but is physically absent is corrected to Absent with a reason; the false claim records an offense once.
- An attending student who could not submit can be marked by the instructor with a reason, without a false-claim offense.
- Correct Present records should be left unchanged.
- Unmarked students and automatic absences do not create false-claim offenses.
- Saving an outdated form is rejected. Refresh and review the newer attendance before trying again.

The Director and student attendance history show who changed the attendance and the reason. Refresh reloads assignments as well as records.

## Verification

Run `npm run verify:cwts-instructors`. This uses isolated database fixtures and mocked email delivery, covering invitation expiry, single use, login, restricted routes, assignments, concurrent corrections, rollback, offenses, and named history. It sends no real email. Actual delivery must be checked with an authorized recipient after the deployment address is configured.
