document.addEventListener("DOMContentLoaded", () =>
  bootstrapPortalPage({
    expectedPortal: "rotc-admin",
    shellRole: "rotc",
    moduleSrc: "/assets/js/common/settings-page.js",
    render: async (content) => renderSettingsPage(content, "account"),
  })
);
