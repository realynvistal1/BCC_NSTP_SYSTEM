document.addEventListener("DOMContentLoaded", () => {
  bootstrapPortalPage({
    expectedPortal: "student",
    shellRole: "student",
    moduleSrc: "/assets/js/student/_pages.js",
    render: async (content, auth) => {
      await studentPage("dashboard", content, auth);
    }
  });
});
