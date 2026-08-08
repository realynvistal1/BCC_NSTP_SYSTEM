document.addEventListener("DOMContentLoaded", () => {
  bootstrapPortalPage({
    expectedPortal: "cwts-admin",
    shellRole: "cwts",
    moduleSrc: "/assets/js/admin/cwts/_pages.js",
    render: async (content, auth) => {
      await adminPage("cwts", "company-roster", content, auth);
    }
  });
});

