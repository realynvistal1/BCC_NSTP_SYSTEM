(function () {
  const script = document.currentScript;
  const data = script?.dataset || {};

  async function renderFromConfig(content, auth) {
    switch (data.pageType) {
      case "admin-shell":
        return adminPage(data.program, data.page, content, auth);
      case "student-shell":
        return studentPage(data.page, content, auth);
      case "officer-shell":
        return officerPage(data.page, content, auth);
      case "settings":
        return renderSettingsPage(content, data.settingsRole || "account");
      case "admin-grades":
        return renderAdminGrades(data.programLabel, content);
      case "admin-offenses":
        return renderAdminOffenses(data.programLabel, content, auth);
      case "admin-records":
        return renderAdminRecords(data.programLabel, content);
      case "admin-serial":
        return renderAdminSerial(content, data.program);
      case "student-serial":
        return renderStudentSerial(content);
      case "attendance-summary":
        return makeAttendanceSummary(data.programLabel).init();
      default:
        throw new Error(`Unknown page launcher type: ${data.pageType || "missing"}`);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootstrapPortalPage({
      expectedPortal: data.expectedPortal,
      shellRole: data.shellRole,
      moduleSrc: data.moduleSrc,
      render: renderFromConfig,
    });
  });
})();
