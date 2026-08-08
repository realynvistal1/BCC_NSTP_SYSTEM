document.addEventListener("DOMContentLoaded", () => {
  makeAttendanceSummary("CWTS")
    .init()
    .catch(showPageError);
});
