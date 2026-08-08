require("dotenv").config();
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const app = express();
const PORT = Number(process.env.PORT || 3000);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
// Prevent stale HTML/API responses from causing an empty page after refresh.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || !req.path.includes('.')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});
app.use("/assets", express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/student", require("./routes/studentRoutes"));
app.use("/api/admin/rotc", require("./routes/rotcAdminRoutes"));
app.use("/api/admin/cwts", require("./routes/cwtsAdminRoutes"));
app.use("/api/officer", require("./routes/officerRoutes"));
const publicPages = {
  "/login": "views/auth/student-login.html",
  "/enrollment": "views/auth/enrollment.html",
  "/student/login": "views/auth/student-login.html",
  "/admin/rotc/login": "views/auth/rotc-login.html",
  "/admin/cwts/login": "views/auth/cwts-login.html",
  "/officer/login": "views/auth/officer-login.html",
}
;
app.get("/", (req, res) => res.redirect("/student/login"));
for (const [route, file] of Object.entries(publicPages)) {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, file)));
}
function mountPages(prefix, files) {
  for (const fileName of files) {
    const route = `${prefix}/${fileName}`;
    const file = `views${route}.html`;
    app.get(route, (req, res) => res.sendFile(path.join(__dirname, file)));
  }
}
mountPages("/student", [
"dashboard",
"enrollment-status",
"re-enrollment",
"assigned-platoon",
"attendance",
"grades",
"serial-number",
"settings",
]);
mountPages("/admin/rotc", [
"dashboard",
"enrollment-schedule",
"enrollment-list",
"platoon-roster",
"attendance-summary",
"grades",
"offenses",
"serial-number",
"view-records",
"withdrawal-requests",
"settings",
]);
for (const page of ["overall", "battalion-1", "battalion-2", "advance-course", "special-platoon"]) {
  app.get(`/admin/rotc/attendance/${page}`, (req, res) => res.redirect(`/admin/rotc/attendance-summary?group=${page}`));
  app.get(`/admin/rotc/attendance-summary/${page}`, (req, res) => res.redirect(`/admin/rotc/attendance-summary?group=${page}`));
}
mountPages("/admin/cwts", [
"dashboard",
"enrollment-schedule",
"enrollment-list",
"company-roster",
"attendance-summary",
"grades",
"offenses",
"serial-number",
"view-records",
"settings",
]);
mountPages("/officer", [
"dashboard",
"create-attendance",
"view-attendance",
"view-records",
"cwts",
"settings",
]);
for (const page of ["rotc", "cwts", "advance-course", "special-platoon"]) {
  app.get(`/officer/attendance/${page}`, (req, res) => res.redirect(`/officer/view-attendance?program=${page}`));
  app.get(`/officer/view-attendance/${page}`, (req, res) => res.redirect(`/officer/view-attendance?program=${page}`));
}
for (const page of ["battalion-1", "battalion-2", "advance-course", "special-platoon"]) {
  app.get(`/officer/rotc/${page}`, (req, res) => {
  res.sendFile(path.join(__dirname, `views/officer/rotc/${page}.html`));
  });
}
app.get("/api/health", (req, res) => {
res.json({ ok: true, app: "BCC NSTP System" });
});
app.use((req, res) => {
res.status(404).sendFile(path.join(__dirname, "views/404.html"));
});
app.use((err, req, res, next) => {
console.error(err);
res.status(500).json({ message: "Unexpected server error." });
});
app.listen(PORT, () => {
console.log(`BCC NSTP System running at http://localhost:${PORT}`);
});
