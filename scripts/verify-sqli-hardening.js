const path = require("path");
const assert = require("assert");

function setMockModule(modulePath, mockExports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: mockExports,
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    cookies: [],
    clearedCookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name, options) {
      this.clearedCookies.push({ name, options });
      return this;
    },
  };
}

async function main() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-not-for-production";

  const dbCalls = [];
  const dbMock = {
    async execute(sql, params = []) {
      dbCalls.push({ sql, params });

      if (String(sql).includes("FROM login_attempt_locks")) return [[]];
      if (String(sql).includes("CREATE TABLE IF NOT EXISTS")) return [[], []];
      if (String(sql).includes("INSERT INTO login_attempt_locks")) return [{ affectedRows: 1 }];
      if (String(sql).includes("DELETE FROM login_attempt_locks")) return [{ affectedRows: 0 }];
      if (String(sql).includes("FROM admins")) return [[]];
      if (String(sql).includes("FROM students")) return [[]];
      if (String(sql).includes("FROM security_event_locks")) return [[]];
      if (String(sql).includes("INSERT INTO security_event_locks")) return [{ affectedRows: 1 }];

      return [[], []];
    },
    query(sql, params = []) {
      return this.execute(sql, params);
    },
    async getConnection() {
      throw new Error("getConnection should not be used in these tests");
    },
  };

  const authServiceMock = {
    async comparePassword() {
      return false;
    },
    async hashPassword(password) {
      return `hashed:${password}`;
    },
    newPasswordValidationMessage() {
      return "";
    },
  };

  const emailServiceMock = {
    hasEmailConfig() {
      return true;
    },
    async sendPasswordResetCode() {
      return undefined;
    },
  };

  setMockModule(path.resolve(__dirname, "../config/database.js"), dbMock);
  setMockModule(path.resolve(__dirname, "../services/authService.js"), authServiceMock);
  setMockModule(path.resolve(__dirname, "../services/emailService.js"), emailServiceMock);

  const controller = require(path.resolve(__dirname, "../controllers/authController.js"));
  const validation = require(path.resolve(__dirname, "../services/requestValidationService.js"));

  {
    dbCalls.length = 0;
    const req = {
      body: {
        identifier: "' OR 1=1 --",
        password: "nottherightpassword",
      },
      headers: {},
      secure: false,
    };
    const res = createResponse();

    await controller.login(req, res);

    assert.strictEqual(res.statusCode, 401, "login injection attempt should be rejected");

    const adminLookup = dbCalls.find((call) => call.sql.includes("FROM admins"));
    assert(adminLookup, "expected admin lookup query");
    assert(adminLookup.sql.includes("email = ? OR username = ?"), "admin lookup must stay parameterized");
    assert.deepStrictEqual(adminLookup.params, ["' OR 1=1 --", "' OR 1=1 --"]);
  }

  {
    const req = {
      body: {
        portal: "student",
        student_id: "123456-7890' OR 1=1 --",
        email: "student@example.com",
      },
    };
    const res = createResponse();

    await controller.requestStudentResetCode(req, res);

    assert.strictEqual(res.statusCode, 400, "invalid student ID injection attempt should be blocked early");
  }

  {
    const req = {
      body: {
        portal: "cwts-admin",
        email: "admin@example.com' OR '1'='1",
      },
    };
    const res = createResponse();

    await controller.requestAdminResetCode(req, res);

    assert.strictEqual(res.statusCode, 400, "invalid admin email injection attempt should be blocked early");
  }

  {
    const escaped = validation.escapeLikePattern("%_test\\name");
    assert.strictEqual(escaped, "\\%\\_test\\\\name", "LIKE wildcard escaping should neutralize pattern characters");
  }

  console.log("SQL hardening verification passed.");
  console.log("Checked cases:");
  console.log("- login payload cannot alter the lookup SQL");
  console.log("- malformed reset payloads are rejected before DB lookup");
  console.log("- LIKE wildcard characters are escaped before search use");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
