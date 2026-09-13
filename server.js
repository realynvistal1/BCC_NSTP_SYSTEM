require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cookieParser = require("cookie-parser");
const {
  trustProxyHop,
  generalApiRateLimit,
  authRateLimit,
  generalApiConcurrencyLimit,
  authConcurrencyLimit,
} = require("./middleware/rateLimitMiddleware");
const app = express();
const HOST = String(process.env.HOST || "127.0.0.1").trim();
const PORT = Number(process.env.PORT || 3000);

function jwtVerifyOptions() {
  return {
    audience: 'bcc-nstp-app',
    issuer: 'bcc-nstp-system',
  };
}

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

const jwtSecret = requireEnv("JWT_SECRET");
if (jwtSecret === "replace-with-a-long-random-secret") {
  throw new Error("JWT_SECRET must be replaced before running the app.");
}

app.set("trust proxy", trustProxyHop());
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
app.use("/assets", express.static(path.join(__dirname, "public"), {
  setHeaders(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  },
}));
app.use("/api", generalApiConcurrencyLimit);
app.use("/api", generalApiRateLimit);
app.use("/api/auth", authConcurrencyLimit);
app.use("/api/auth", authRateLimit);
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/student", require("./routes/studentRoutes"));
app.use("/api/admin/rotc", require("./routes/rotcAdminRoutes"));
app.use("/api/admin/cwts", require("./routes/cwtsAdminRoutes"));
app.use("/api/officer", require("./routes/officerRoutes"));

function loginPathForPortal(portal) {
  if (portal === "rotc-admin") return "/admin/rotc/login";
  if (portal === "cwts-admin") return "/admin/cwts/login";
  if (portal === "officer") return "/officer/login";
  return "/student/login";
}

function readToken(req) {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;

  return req.cookies?.nstp_token || bearer;
}

function readSession(req) {
  const token = readToken(req);
  if (!token) return null;

  try {
    return jwt.verify(token, jwtSecret, jwtVerifyOptions());
  } catch {
    return null;
  }
}

function requirePagePortal(...portals) {
  return (req, res, next) => {
    const session = readSession(req);
    if (session && portals.includes(session.portal)) {
      req.user = session;
      return next();
    }

    return res.redirect(loginPathForPortal(portals[0]));
  };
}

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
function mountPages(prefix, files, guard) {
  for (const fileName of files) {
    const route = `${prefix}/${fileName}`;
    const file = `views${route}.html`;
    app.get(route, guard, (req, res) => res.sendFile(path.join(__dirname, file)));
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
], requirePagePortal("student"));
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
], requirePagePortal("rotc-admin"));
for (const page of ["overall", "battalion-1", "battalion-2", "advance-course", "special-platoon"]) {
  app.get(`/admin/rotc/attendance/${page}`, requirePagePortal("rotc-admin"), (req, res) => res.redirect(`/admin/rotc/attendance-summary?group=${page}`));
  app.get(`/admin/rotc/attendance-summary/${page}`, requirePagePortal("rotc-admin"), (req, res) => res.redirect(`/admin/rotc/attendance-summary?group=${page}`));
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
], requirePagePortal("cwts-admin"));
mountPages("/officer", [
"dashboard",
"create-attendance",
"view-attendance",
"view-records",
"cwts",
"settings",
], requirePagePortal("officer"));
for (const page of ["rotc", "cwts", "advance-course", "special-platoon"]) {
  app.get(`/officer/attendance/${page}`, requirePagePortal("officer"), (req, res) => res.redirect(`/officer/view-attendance?program=${page}`));
  app.get(`/officer/view-attendance/${page}`, requirePagePortal("officer"), (req, res) => res.redirect(`/officer/view-attendance?program=${page}`));
}
for (const page of ["battalion-1", "battalion-2", "advance-course", "special-platoon"]) {
  app.get(`/officer/rotc/${page}`, requirePagePortal("officer"), (req, res) => {
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
if (err instanceof multer.MulterError) {
res.status(400).json({ message: err.message });
return;
}
if (err?.message && (
  err.message.includes('data URL')
  || err.message.includes('must be a ')
  || err.message.includes('Maximum size')
  || err.message.includes('too large')
  || err.message.includes('required.')
)) {
res.status(400).json({ message: err.message });
return;
}
res.status(500).json({ message: "Unexpected server error." });
});
app.listen(PORT, HOST, (error) => {
  if (error) {
    if (error.code === 'EADDRINUSE') {
      console.error(`Cannot start BCC NSTP: ${HOST}:${PORT} is already in use. Stop the existing server before starting another copy.`);
    } else {
      console.error('Cannot start BCC NSTP:', error.message);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`BCC NSTP System running at http://${HOST}:${PORT}`);
  console.log('Keep this terminal open. Press Ctrl+C to stop the server.');
});
