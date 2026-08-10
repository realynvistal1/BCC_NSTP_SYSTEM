const jwt = require("jsonwebtoken");
const db = require("../config/database");
const authService = require("../services/authService");

function adminPortal(program, storedRole) {
  if (storedRole === "director" || storedRole === "officer") return "officer";
  if (program === "CWTS") return "cwts-admin";
  return "rotc-admin";
}

function runtimeRoleForAdmin(storedRole) {
  return storedRole === "director" ? "officer" : storedRole;
}

function clearAuthCookies(res) {
  res.clearCookie("nstp_token", { path: "/" });
  res.clearCookie("nstp_token", { path: "/api/auth" });
}

async function findAdmin(identifier) {
  const [rows] = await db.execute(
    `SELECT id, email, username, password, role, program
     FROM admins
     WHERE email = ? OR username = ?
     LIMIT 1`,
    [identifier, identifier]
  );
  return rows[0] || null;
}

async function findStudent(identifier) {
  const [rows] = await db.execute(
    `SELECT id, email, username, password, role, nstp_component
     FROM students
     WHERE email = ? OR username = ?
     LIMIT 1`,
    [identifier, identifier]
  );
  return rows[0] || null;
}

exports.login = async (req, res) => {
  try {
    const { identifier, username, email, password } = req.body;
    const loginValue = String(identifier || username || email || "").trim();
    const plainPassword = String(password || "");

    if (!loginValue || !plainPassword) {
      return res.status(400).json({ message: "Email/username and password are required." });
    }

    let source = "admin";
    let user = await findAdmin(loginValue);

    if (!user) {
      source = "student";
      user = await findStudent(loginValue);
    }

    if (!user) {
      return res.status(401).json({ message: "Invalid login credentials." });
    }

    const match = await authService.comparePassword(plainPassword, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid login credentials." });
    }

    let payload;
    let portal;

    if (source === "admin") {
      const runtimeRole = runtimeRoleForAdmin(user.role);
      portal = adminPortal(user.program, user.role);
      payload = {
        id: user.id,
        role: runtimeRole,
        portal,
        email: user.email,
        program: user.program,
        account_role: user.role,
      };
    } else {
      portal = "student";
      payload = {
        id: user.id,
        role: "student",
        portal,
        email: user.email,
        program: user.nstp_component,
      };
    }

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "12h" });

    clearAuthCookies(res);

    res.cookie("nstp_token", token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
      maxAge: 12 * 60 * 60 * 1000,
    });

    res.json({
      message: "Login successful.",
      portal,
      redirect:
        portal === "student"
          ? "/student/dashboard"
          : portal === "officer"
          ? "/officer/dashboard"
          : portal === "cwts-admin"
          ? "/admin/cwts/dashboard"
          : "/admin/rotc/dashboard",
      user: payload,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.logout = async (_req, res) => {
  clearAuthCookies(res);
  res.json({ message: "Logged out successfully." });
};

exports.me = async (req, res) => {
  res.json({ ...req.user, user: req.user });
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required." });
    }

    const validationMessage = authService.newPasswordValidationMessage(newPassword);
    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    const isStudent = req.user.role === "student";
    const table = isStudent ? "students" : "admins";

    const [rows] = await db.execute(
      `SELECT id, password FROM ${table} WHERE id = ? LIMIT 1`,
      [req.user.id]
    );

    const account = rows[0];
    if (!account) {
      return res.status(404).json({ message: "Account not found." });
    }

    const match = await authService.comparePassword(currentPassword, account.password);
    if (!match) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    const hashedPassword = await authService.hashPassword(newPassword);
    await db.execute(`UPDATE ${table} SET password = ? WHERE id = ?`, [hashedPassword, req.user.id]);

    res.json({ message: "Password changed successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
