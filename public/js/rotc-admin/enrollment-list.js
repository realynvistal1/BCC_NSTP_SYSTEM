document.addEventListener("DOMContentLoaded", () => {
  bootstrapPortalPage({
    expectedPortal: "rotc-admin",
    shellRole: "rotc",
    moduleSrc: "/assets/js/rotc-admin/_pages.js",
    render: async (content, auth) => {
      await adminPage("rotc", "enrollment-list", content, auth);
    }
  });
});
