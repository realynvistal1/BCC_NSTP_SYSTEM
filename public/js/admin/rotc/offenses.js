document.addEventListener("DOMContentLoaded", () => {
  bootstrapPortalPage({
    expectedPortal: "rotc-admin",
    shellRole: "rotc",
    moduleSrc: "/assets/js/common/admin-offenses.js",
    render: async (content, auth) => renderAdminOffenses("ROTC", content, auth),
  });
});
