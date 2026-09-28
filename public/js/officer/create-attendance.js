let attendanceMap = null;
let attendanceMarker = null;
let attendanceCircle = null;
let attendanceProgress = null;
let blockingAttendanceSession = null;
let attendanceBlockRefreshTimer = null;
let attendanceCountdownTimer = null;
let selectedNumber = 0;
let selectedType = "in";
const DEFAULT_ATTENDANCE_RADIUS = 100;

function formatAttendanceTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function initAttendanceMap() {
  const node = document.getElementById("attendanceMap");
  if (!node || !window.L) return;
  attendanceMap = L.map(node).setView([9.65, 123.95], 14);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(attendanceMap);
  attendanceMap.on("click", (event) => setAttendanceLocation(event.latlng.lat, event.latlng.lng, "Location selected on map."));
}

function getAttendanceRadius() {
  return DEFAULT_ATTENDANCE_RADIUS;
}

function setAttendanceLocation(latitude, longitude, message) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  document.getElementById("attendanceLatitude").value = lat.toFixed(7);
  document.getElementById("attendanceLongitude").value = lng.toFixed(7);
  document.getElementById("locationStatus").textContent = message || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  if (attendanceMap && window.L) {
    if (attendanceMarker) attendanceMarker.remove();
    if (attendanceCircle) attendanceCircle.remove();
    attendanceMarker = L.marker([lat, lng], { draggable: true }).addTo(attendanceMap);
    attendanceCircle = L.circle([lat, lng], { radius: getAttendanceRadius() }).addTo(attendanceMap);
    attendanceMarker.on("dragend", () => {
      const markerLatLng = attendanceMarker.getLatLng();
      document.getElementById("attendanceLatitude").value = markerLatLng.lat.toFixed(7);
      document.getElementById("attendanceLongitude").value = markerLatLng.lng.toFixed(7);
      attendanceCircle.setLatLng(markerLatLng);
      document.getElementById("locationStatus").textContent = `Location moved • ${markerLatLng.lat.toFixed(6)}, ${markerLatLng.lng.toFixed(6)}`;
      validateAttendanceForm();
    });
    attendanceMap.setView([lat, lng], 18);
  }
  validateAttendanceForm();
}

function unlockAttendanceStep(id, unlocked) {
  document.getElementById(id)?.classList.toggle("locked", !unlocked);
}

function getNextAllowed(progress) {
  for (const item of progress || []) {
    if (!item.in) return { number: item.number, type: "in" };
    if (!item.out && item.in.effective_status === "closed") return { number: item.number, type: "out" };
    if (!item.out) return null;
  }
  return null;
}

function blockingAttendanceLabel(session) {
  if (!session) return "Active attendance";
  const program = Number(session.is_advance_course || 0) === 1
    ? "Advance Course"
    : session.program;
  const unit = session.program === "CWTS" ? "CS" : "MI";
  return `${program} ${unit} ${session.mi_number || "-"} ${String(session.mi_type || "").toUpperCase()}`.trim();
}

function blockingAttendanceTime(session) {
  const deadline = new Date(session?.late_deadline || session?.close_date || "");
  if (Number.isNaN(deadline.getTime())) {
    return { closesAt: "the scheduled closing time", remaining: "calculating..." };
  }

  const remainingMs = Math.max(0, deadline.getTime() - Date.now());
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (days || hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`, `${seconds}s`);

  return {
    closesAt: deadline.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    remaining: totalSeconds > 0 ? parts.join(" ") : "closing now",
  };
}

function scheduleAttendanceBlockRefresh() {
  if (attendanceBlockRefreshTimer) {
    clearTimeout(attendanceBlockRefreshTimer);
    attendanceBlockRefreshTimer = null;
  }
  if (attendanceCountdownTimer) {
    clearInterval(attendanceCountdownTimer);
    attendanceCountdownTimer = null;
  }
  if (!blockingAttendanceSession) return;

  attendanceCountdownTimer = setInterval(validateAttendanceForm, 1000);
  const deadline = new Date(blockingAttendanceSession.late_deadline || blockingAttendanceSession.close_date || "");
  const untilDeadline = Number.isNaN(deadline.getTime())
    ? 15000
    : Math.max(500, deadline.getTime() - Date.now() + 250);
  attendanceBlockRefreshTimer = setTimeout(() => {
    loadAttendanceProgress().catch((error) => toast(error.message, true));
  }, Math.min(15000, untilDeadline));
}

function renderMIProgress() {
  const container = document.getElementById("miProgress");
  if (!attendanceProgress) {
    container.innerHTML = "";
    return;
  }
  const unit = attendanceProgress.actual_program === "CWTS" ? "CS" : "MI";
  document.getElementById("miStepTitle").textContent = `Select ${unit}`;
  const next = getNextAllowed(attendanceProgress.progress);

  container.innerHTML = attendanceProgress.progress.map((item) => {
    const complete = Boolean(item.in && item.out);
    const partial = Boolean(item.in && !item.out);
    const available = next && next.number === item.number;
    const selected = selectedNumber === item.number;
    const className = complete ? "complete" : selected ? "selected" : available ? "available" : partial ? "partial" : "disabled";
    const note = complete ? "✓" : partial ? (item.in.effective_status === "closed" ? "OUT" : "IN") : "";
    return `<button class="mi-button ${className}" type="button" data-mi="${item.number}" ${available ? "" : "disabled"}><strong>${unit} ${item.number}</strong><span>${note}</span></button>`;
  }).join("");

  container.querySelectorAll(".mi-button:not([disabled])").forEach((button) => {
    button.addEventListener("click", () => {
      selectedNumber = Number(button.dataset.mi);
      const item = attendanceProgress.progress.find((entry) => entry.number === selectedNumber);
      selectedType = item?.in ? "out" : "in";
      renderMIProgress();
      renderTypeButtons();
      unlockAttendanceStep("typeStep", true);
      unlockAttendanceStep("scheduleStep", true);
      unlockAttendanceStep("locationStep", true);
      validateAttendanceForm();
    });
  });

  const completeCount = attendanceProgress.progress.reduce((sum, item) => sum + (item.in ? 1 : 0) + (item.out ? 1 : 0), 0);
  const nextText = blockingAttendanceSession
    ? `Waiting for ${blockingAttendanceLabel(blockingAttendanceSession)} to close`
    : next
      ? `${unit} ${next.number} ${next.type.toUpperCase()}`
      : completeCount === 30
        ? "All 15 IN & OUT sessions completed"
        : "Waiting for the current IN session to close";
  document.getElementById("progressSummary").innerHTML = `<h3>Current Progress</h3><div class="progress-number">${completeCount}<span>/30</span></div><div class="attendance-progress-bar"><i style="width:${Math.round((completeCount / 30) * 100)}%"></i></div><p><strong>Next:</strong> ${esc(nextText)}</p>`;
}

function renderTypeButtons() {
  const inButton = document.getElementById("timeInBtn");
  const outButton = document.getElementById("timeOutBtn");
  const item = attendanceProgress?.progress.find((entry) => entry.number === selectedNumber);
  const inDisabled = Boolean(blockingAttendanceSession) || !selectedNumber || Boolean(item?.in);
  const outDisabled = Boolean(blockingAttendanceSession) || !selectedNumber || !item?.in || item.in.effective_status !== "closed" || Boolean(item?.out);

  inButton.disabled = inDisabled;
  outButton.disabled = outDisabled;
  inButton.classList.toggle("active", selectedType === "in");
  outButton.classList.toggle("active", selectedType === "out");
}

async function loadAttendanceProgress() {
  const program = document.getElementById("attendanceProgram").value;
  selectedNumber = 0;
  selectedType = "in";
  if (!program) {
    attendanceProgress = null;
    blockingAttendanceSession = null;
    scheduleAttendanceBlockRefresh();
    unlockAttendanceStep("miStep", false);
    unlockAttendanceStep("typeStep", false);
    unlockAttendanceStep("scheduleStep", false);
    unlockAttendanceStep("locationStep", false);
    document.getElementById("attendanceOpenDate").disabled = true;
    document.getElementById("attendanceCloseDate").disabled = true;
    document.getElementById("captureDirectorLocation").disabled = true;
    renderMIProgress();
    return;
  }

  attendanceProgress = await API.get(`/api/officer/attendance/progress?program=${encodeURIComponent(program)}`);
  blockingAttendanceSession = attendanceProgress.blocking_session || null;
  const cycle = attendanceProgress.cycle || {};
  const levelLabel = attendanceProgress.actual_program === "CWTS" ? "CWTS" : "MS";
  document.getElementById("cycleInfo").classList.remove("hidden");
  document.getElementById("cycleInfo").innerHTML = `<strong>${esc(program === 'ADVANCE_COURSE' ? 'Advance Course' : program)}</strong><span>${cycle.ms_level ? `${levelLabel} ${esc(cycle.ms_level)} • ` : ""}SY ${esc(cycle.school_year || "—")} • 100m radius</span>`;
  unlockAttendanceStep("miStep", true);
  renderMIProgress();

  const next = getNextAllowed(attendanceProgress.progress);
  const canPrepareAttendance = Boolean(next && !blockingAttendanceSession);
  if (canPrepareAttendance) {
    selectedNumber = next.number;
    selectedType = next.type;
  }
  unlockAttendanceStep("typeStep", canPrepareAttendance);
  unlockAttendanceStep("scheduleStep", canPrepareAttendance);
  unlockAttendanceStep("locationStep", canPrepareAttendance);
  document.getElementById("attendanceOpenDate").disabled = !canPrepareAttendance;
  document.getElementById("attendanceCloseDate").disabled = !canPrepareAttendance;
  document.getElementById("captureDirectorLocation").disabled = !canPrepareAttendance;
  renderMIProgress();
  renderTypeButtons();
  validateAttendanceForm();
  scheduleAttendanceBlockRefresh();
}

function validateAttendanceForm() {
  const program = document.getElementById("attendanceProgram").value;
  const openDate = document.getElementById("attendanceOpenDate").value;
  const closeDate = document.getElementById("attendanceCloseDate").value;
  const lat = Number(document.getElementById("attendanceLatitude").value);
  const lng = Number(document.getElementById("attendanceLongitude").value);
  const validDates = openDate && closeDate && new Date(closeDate) > new Date(openDate);
  const ready = Boolean(program && selectedNumber && selectedType && validDates && Number.isFinite(lat) && Number.isFinite(lng) && !blockingAttendanceSession);
  document.getElementById("createAttendanceButton").disabled = !ready;
  const validation = document.getElementById("attendanceValidation");
  validation.classList.toggle("blocked", Boolean(blockingAttendanceSession));

  if (blockingAttendanceSession) {
    const timing = blockingAttendanceTime(blockingAttendanceSession);
    validation.innerHTML = `
      <strong>Wait for ${esc(blockingAttendanceLabel(blockingAttendanceSession))} attendance to close.</strong>
      <span>You cannot create another attendance for this program yet. Fully closes at ${esc(timing.closesAt)} after the 15-minute late period.</span>
      <b>Remaining time: ${esc(timing.remaining)}</b>
    `;
  } else {
    validation.textContent = ready
      ? `${attendanceProgress?.actual_program === 'CWTS' ? 'CS' : 'MI'} ${selectedNumber} ${selectedType.toUpperCase()} is ready to save.`
      : "Complete the program, session, schedule, and location to activate attendance.";
  }
}

function showAttendanceSuccess(message) {
  const modal = document.getElementById("attendanceSuccessModal");
  const messageNode = document.getElementById("attendanceSuccessMessage");
  const closeButton = document.getElementById("closeAttendanceSuccess");
  const backdrop = document.getElementById("attendanceSuccessBackdrop");
  if (!modal || !messageNode || !closeButton || !backdrop) return;

  messageNode.textContent = message || "The attendance session has been created successfully.";
  modal.classList.remove("hidden");

  const closeModal = () => {
    modal.classList.add("hidden");
    document.removeEventListener("keydown", handleEscape);
  };
  const handleEscape = (event) => {
    if (event.key === "Escape") closeModal();
  };

  closeButton.onclick = closeModal;
  backdrop.onclick = closeModal;
  document.addEventListener("keydown", handleEscape);
  closeButton.focus();
}

async function createAttendanceSession() {
  const button = document.getElementById("createAttendanceButton");
  button.disabled = true;
  button.textContent = "Saving...";
  try {
    const payload = {
      program: document.getElementById("attendanceProgram").value,
      mi_number: selectedNumber,
      mi_type: selectedType,
      open_date: document.getElementById("attendanceOpenDate").value,
      close_date: document.getElementById("attendanceCloseDate").value,
      latitude: Number(document.getElementById("attendanceLatitude").value),
      longitude: Number(document.getElementById("attendanceLongitude").value),
      ms_level: attendanceProgress?.cycle?.ms_level || null,
      school_year: attendanceProgress?.cycle?.school_year || null,
    };
    const result = await API.post("/api/officer/attendance/sessions", payload);
    document.getElementById("attendanceOpenDate").value = "";
    document.getElementById("attendanceCloseDate").value = "";
    showAttendanceSuccess(result.message);
    await loadAttendanceProgress();
  } catch (error) {
    toast(error.message, true);
    await loadAttendanceProgress().catch(() => {});
  } finally {
    button.textContent = "Save / Activate Attendance";
    validateAttendanceForm();
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  showPageLoading("Loading attendance setup...");
  try {
    const auth = await guard("officer");
    if (!auth) return;
    shell("officer", "Create Attendance", "Set up attendance sessions for ROTC, CWTS, and Advance Course.", auth);
    document.querySelector(".attendance-create-layout").style.display = "grid";
    initAttendanceMap();

    document.getElementById("attendanceProgram").addEventListener("change", () => loadAttendanceProgress().catch((error) => toast(error.message, true)));
    document.getElementById("timeInBtn").addEventListener("click", () => { selectedType = "in"; renderTypeButtons(); validateAttendanceForm(); });
    document.getElementById("timeOutBtn").addEventListener("click", () => { selectedType = "out"; renderTypeButtons(); validateAttendanceForm(); });
    ["attendanceOpenDate", "attendanceCloseDate"].forEach((id) => document.getElementById(id).addEventListener("input", validateAttendanceForm));
    document.getElementById("captureDirectorLocation").addEventListener("click", () => {
      const status = document.getElementById("locationStatus");
      if (!navigator.geolocation) return toast("Geolocation is not supported by this browser.", true);
      status.textContent = "Getting your current location...";
      navigator.geolocation.getCurrentPosition(
        (position) => setAttendanceLocation(position.coords.latitude, position.coords.longitude, `Current location captured • accuracy ±${Math.round(position.coords.accuracy)}m`),
        (error) => { status.textContent = "Unable to get location."; toast(error.code === 1 ? "Location permission was denied. Allow location for this site and try again." : "Unable to retrieve your location.", true); },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });
    document.getElementById("createAttendanceButton").addEventListener("click", createAttendanceSession);
  } catch (error) {
    console.error(error);
    toast(error.message, true);
  }
});
