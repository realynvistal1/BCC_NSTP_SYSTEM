document.addEventListener("DOMContentLoaded", () => {
  bootstrapPortalPage({
    expectedPortal: "cwts-admin",
    shellRole: "cwts",
    moduleSrc: "/assets/js/common/admin-offenses.js",
    render: async (content, auth) => renderAdminOffenses("CWTS", content, auth),
  });
});
