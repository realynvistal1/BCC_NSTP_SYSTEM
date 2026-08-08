document.addEventListener("DOMContentLoaded", () => {
  bootstrapPortalPage({
    expectedPortal: "officer",
    shellRole: "officer",
    moduleSrc: "/assets/js/officer/_pages.js",
    render: async (content, auth) => {
      await officerPage("battalion-2", content, auth);
    }
  });
});
