document.addEventListener("DOMContentLoaded", () => {
  bootstrapPortalPage({
    expectedPortal: "student",
    shellRole: "student",
    moduleSrc: "/assets/js/student/_pages.js",
    render: async (content, auth) => {
      await studentPage("re-enrollment", content, auth);
    }
  });
});
