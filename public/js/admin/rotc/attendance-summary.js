document.addEventListener("DOMContentLoaded", () => {
  makeAttendanceSummary("ROTC")
    .init()
    .catch(showPageError);
});
