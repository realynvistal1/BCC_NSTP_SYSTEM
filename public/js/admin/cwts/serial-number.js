document.addEventListener("DOMContentLoaded", () =>
  bootstrapPortalPage({
    expectedPortal: "cwts-admin",
    shellRole: "cwts",
    moduleSrc: "/assets/js/common/serial-certificate.js",
    render: async (content) => renderAdminSerial(content, "cwts"),
  })
);
