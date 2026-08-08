document.addEventListener("DOMContentLoaded", () => {
  bootstrapPortalPage({
    expectedPortal: "rotc-admin",
    shellRole: "rotc",
    moduleSrc: "/assets/js/admin/rotc/_pages.js",
    render: async (content, auth) => {
      await adminPage("rotc", "platoon-roster", content, auth);
    }
  });
});

