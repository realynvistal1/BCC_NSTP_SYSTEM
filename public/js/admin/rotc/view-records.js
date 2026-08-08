document.addEventListener("DOMContentLoaded", () =>
  bootstrapPortalPage({
    expectedPortal: "rotc-admin",
    shellRole: "rotc",
    moduleSrc: "/assets/js/common/admin-records.js",
    render: async (content) => renderAdminRecords("ROTC", content),
  })
);
