document.addEventListener("DOMContentLoaded", () =>
  bootstrapPortalPage({
    expectedPortal: "cwts-admin",
    shellRole: "cwts",
    moduleSrc: "/assets/js/common/settings-page.js",
    render: async (content) => renderSettingsPage(content, "account"),
  })
);
