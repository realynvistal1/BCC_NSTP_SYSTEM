const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/database");

function adminPortal(program, role) {
  if (role === "director") return "officer";
  if (program === "CWTS") return "cwts";
  return "rotc";
}

exports.login = async (req, res) => {
  try {
    const { identifier, username, email, password } = req.body;
    const loginValue = (identifier || username || email || "").trim();
    const plainPassword = String(password || "");

    if (!loginValue || !plainPassword) {
      return res.status(400).json({ message: "Email/username and password are required." });
    }

    let user = null;
    let source = null;

    const [adminRows] = await db.execute(
      `SELECT id, email, username, password, role, program
       FROM admins
       WHERE email = ? OR username = ?
       LIMIT 1`,
      [loginValue, loginValue]
    );

    if (adminRows.length) {
      user = adminRows[0];
      source = "admin";
    } else {
      const [studentRows] = await db.execute(
        `SELECT id, email, username, password, role, nstp_component
         FROM students
         WHERE email = ? OR username = ?
         LIMIT 1`,
        [loginValue, loginValue]
      );

      if (studentRows.length) {
        user = studentRows[0];
        source = "student";
      }
    }

    if (!user) {
      return res.status(401).json({ message: "Invalid login credentials." });
    }

    const match = await bcrypt.compare(plainPassword, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid login credentials." });
    }

    let payload;
    let redirect;

    if (source === "admin") {
      payload = {
        id: user.id,
        role: user.role,
        program: user.program,
        portal: adminPortal(user.program, user.role),
      };

      redirect =
        user.role === "director"
          ? "/officer/dashboard"
          : user.program === "CWTS"
          ? "/admin/cwts/dashboard"
          : "/admin/rotc/dashboard";
    } else {
      payload = {
        id: user.id,
        role: "student",
        program: user.nstp_component,
        portal: "student",
      };

      redirect = "/student/dashboard";
    }

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1d" });

    res.cookie("nstp_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({
      message: "Login successful.",
      user: payload,
      redirect,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
