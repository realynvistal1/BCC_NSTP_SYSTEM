async function adminPage(_role, page, content) {
  const programKey = "cwts";

  if (page === "dashboard") {
    const data = await API.get(`/api/admin/${programKey}/dashboard`);
    const total = Number(data.total || 0);
    const pending = Number(data.pending || 0);
    const approved = Number(data.approved || 0);
    const rejected = Number(data.rejected || 0);
    const assigned = Number(data.assigned || 0);
    const approvalRate = total ? Math.round((approved / total) * 100) : 0;
    const pendingRate = total ? Math.round((pending / total) * 100) : 0;
    const program = programKey.toUpperCase();
    const intro = document.querySelector(".intro-copy");

    if (intro) {
      intro.innerHTML = `<div class="intro-kicker">BCC NSTP Management System</div><h1>${program} Dashboard</h1><p>${program === "ROTC" ? "Track cadet movement, assignment load, approvals, and ROTC actions from one control center." : "Monitor company allocation, enrollment flow, and CWTS readiness from one overview."}</p>`;
    }

    content.innerHTML = `<div class="summary-grid">${summaryTile("Approved Students", approved, `Students approved in the current ${program} enrollment cycle`, "blue")}${summaryTile("Approved", approved, `${approvalRate}% of students cleared`, "green")}${summaryTile("Pending", pending, `${pendingRate}% still need review`, "orange")}${summaryTile("Rejected Students", rejected, "Students who were not approved", "red")}</div><div class="admin-analytics"><section class="section-card"><div class="section-heading"><h2>Enrollment Pipeline</h2><p>A quick snapshot of how student applications are moving through review.</p></div>${progressRow("Approved", approved, total, "green")}${progressRow("Pending", pending, total, "orange")}${progressRow("Rejected", rejected, total, "red")}</section><section class="section-card"><div class="section-heading"><h2>What Needs Attention</h2><p>Use these numbers to decide what to review first.</p></div><div class="insight-list">${insight("Pending Reviews", pending, "Students waiting for enrollment approval")}${insight("Rejected Cases", rejected, "Applications that may need follow-up or re-submission")}${insight("Approval Rate", `${approvalRate}%`, "Current success rate across student records")}</div></section></div><section class="section-card distribution-card"><div class="section-heading"><h2>${program} Distribution</h2><p>${program === "ROTC" ? "Current view highlights approved cadets and assignment readiness." : "Company analytics show how students are spread across available CWTS units."}</p></div><div class="distribution-insights">${insight(program === "ROTC" ? "Assigned Cadets" : "Assigned Students", assigned, `Out of ${approved} approved students`)}${insight(program === "ROTC" ? "Needs Assignment" : "Needs Company", Math.max(approved - assigned, 0), "Approved students still waiting for placement")}${insight("Assignment Rate", approved ? `${Math.round((assigned / approved) * 100)}%` : "0%", "Current approved-student assignment coverage")}</div></section><section class="section-card"><div class="section-heading"><h2>Management Shortcuts</h2><p>Keep the most important admin pages one click away.</p></div><div class="portal-dashboard-grid">${dashCard("Enrollment Schedule", "Manage Schedule", `Manage the ${program} enrollment period.`, `/admin/${programKey}/enrollment-schedule`, "schedule", "blue")}${dashCard("Enrollment List", `${total} Students`, "View and manage all enrollment applications.", `/admin/${programKey}/enrollment-list`, "enrollment", "blue")}${dashCard(program === "ROTC" ? "Platoon List" : "Company List", `${assigned} Assigned`, program === "ROTC" ? "Manage ROTC platoon assignments." : "View CWTS company assignments.", `/admin/${programKey}/${program === "ROTC" ? "platoon-roster" : "company-roster"}`, "platoon", "green")}${dashCard("Attendance Summary", "View Attendance", "Tap to view daily attendance records.", `/admin/${programKey}/attendance-summary`, "attendance", "cyan")}${dashCard("View Records", "Student Records", "Tap to view complete student records.", `/admin/${programKey}/view-records`, "records", "indigo")}${dashCard("Grades", "Encode Grades", `Tap to encode ${program} grades.`, `/admin/${programKey}/grades`, "grades", "orange")}${dashCard("Attendance Offenses", "Review Violations", "Tap to view students with attendance violations.", `/admin/${programKey}/offenses`, "offense", "orange")}${dashCard("Serial Number", "Manage Numbers", "Tap to view and manage serial numbers.", `/admin/${programKey}/serial-number`, "serial", "purple")}${dashCard("Settings", "Account Settings", "Manage your account and settings.", `/admin/${programKey}/settings`, "settings", "blue")}</div></section>`;
    return;
  }

  if (page === "enrollment-schedule") return renderEnrollmentSchedule(programKey, content);
  if (page === "enrollment-list") return renderEnrollmentList(programKey, content);
  if (page === "platoon-roster") return renderROTCRoster(content, false);
  if (page === "company-roster") return renderCWTSCompanyRoster(content);
  if (page === "special-platoon") return renderROTCRoster(content, true);

  if (page === "grades") {
    const rows = await API.get(`/api/admin/${programKey}/grades`);
    content.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Encode Grades</h2><p class="panel-subtitle">Enter midterm and final grades using the 1.00-5.00 college grading scale. A final grade from 1.00 to 3.00 is Passed.</p></div></div>${table(["Student", "MS Level", "Midterm", "Final", "Average", "Status", "Action"], rows.map((row) => `<tr><td><strong>${esc(row.student_no)}</strong><br>${esc(`${row.last_name}, ${row.first_name}`)}</td><td><select id="gms${row.student_id}"><option value="1" ${String(row.ms_level) === "1" ? "selected" : ""}>MS 1</option><option value="2" ${String(row.ms_level) === "2" ? "selected" : ""}>MS 2</option></select></td><td><input id="m${row.student_id}" type="number" min="1" max="5" step="0.01" value="${row.midterm ?? ""}"></td><td><input id="f${row.student_id}" type="number" min="1" max="5" step="0.01" value="${row.final_term ?? ""}"></td><td>${row.grade ?? "-"}</td><td>${row.status ? badge(row.status) : "-"}</td><td><button class="btn small primary" onclick="saveGrade('${programKey}',${row.student_id})">Save</button></td></tr>`))}</div>`;
    return;
  }

  if (page === "offenses") {
    const rows = await API.get(`/api/admin/${programKey}/offenses`);
    content.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Attendance Offenses</h2><p class="panel-subtitle">Track absences/offenses and settlement status.</p></div></div>${table(["Student", "Offenses", "Settled", "Action"], rows.map((row) => `<tr><td><strong>${esc(row.student_no)}</strong><br>${esc(`${row.last_name}, ${row.first_name}`)}</td><td><input id="o${row.student_id}" type="number" min="0" value="${row.offend}"></td><td><input id="s${row.student_id}" type="checkbox" ${row.settled ? "checked" : ""} style="width:auto"></td><td><button class="btn small primary" onclick="saveOffense('${programKey}',${row.student_id})">Save</button></td></tr>`))}</div>`;
    return;
  }

  if (page === "serial-number") {
    const rows = await API.get(`/api/admin/${programKey}/serial-numbers`);
    content.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Serial Number Management</h2><p class="panel-subtitle">Issue official NSTP serial numbers to qualified students.</p></div></div>${table(["Student", "Serial Number", "Action"], rows.map((row) => `<tr><td><strong>${esc(row.student_no)}</strong><br>${esc(`${row.last_name}, ${row.first_name}`)}</td><td><input id="sn${row.student_id}" value="${esc(row.serial_number || "")}" placeholder="NSTP-2026-0001"></td><td><button class="btn small primary" onclick="saveSerial('${programKey}',${row.student_id})">Save</button></td></tr>`))}</div>`;
    return;
  }

  if (page === "view-records") {
    const rows = await API.get(`/api/admin/${programKey}/records`);
    content.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Student Records</h2><p class="panel-subtitle">Consolidated ${programKey.toUpperCase()} student information.</p></div></div>${recordsTable(rows)}</div>`;
    return;
  }

  if (page === "attendance-summary") {
    const group = location.pathname.split("/").pop();
    const query = ["overall", "attendance-summary"].includes(group) ? "" : `?group=${encodeURIComponent(group)}`;
    const rows = await API.get(`/api/admin/${programKey}/attendance-summary${query}`);
    content.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>${programKey.toUpperCase()} Attendance Summary</h2><p class="panel-subtitle">Aggregated present, late, and absent records per student.</p></div></div>${table(["Student", "Assignment", "Present", "Late", "Absent", "Total"], rows.map((row) => `<tr><td><strong>${esc(row.student_id)}</strong><br>${esc(`${row.last_name}, ${row.first_name}`)}</td><td>${esc(row.assignment || "-")}</td><td>${row.present || 0}</td><td>${row.late || 0}</td><td>${row.absent || 0}</td><td><strong>${row.total || 0}</strong></td></tr>`))}</div>`;
    return;
  }

  if (page === "withdrawal-requests") {
    const rows = await API.get("/api/admin/rotc/withdrawals");
    content.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Advance Course Withdrawal Requests</h2><p class="panel-subtitle">Review requests from ROTC advance-course students.</p></div></div>${table(["Student", "Reason", "Status", "Action"], rows.map((row) => `<tr><td><strong>${esc(row.student_no)}</strong><br>${esc(`${row.last_name}, ${row.first_name}`)}</td><td>${esc(row.reason)}</td><td>${badge(row.status)}</td><td><div class="actions"><button class="btn small success" onclick="withdraw(${row.id},'approved')">Approve</button><button class="btn small danger" onclick="withdraw(${row.id},'rejected')">Reject</button></div></td></tr>`))}</div>`;
    return;
  }

  if (page === "settings") {
    content.innerHTML = settingsHtml();
    bindSettings();
  }
}

async function setEnrollment(programKey, id, status) {
  let reason = "";
  if (status === "rejected") {
    reason = prompt("Enter the reason for rejection:") || "";
    if (!reason) return;
  }
  try {
    const result = await API.patch(`/api/admin/${programKey}/enrollments/${id}`, { status, rejection_reason: reason });
    toast(result.message);
    setTimeout(() => location.reload(), 500);
  } catch (error) {
    toast(error.message, true);
  }
}

async function saveGrade(programKey, id) {
  try {
    const midterm = Number($(`#m${id}`).value);
    const finalTerm = Number($(`#f${id}`).value);
    const msLevel = $(`#gms${id}`).value;
    if (midterm < 1 || midterm > 5 || finalTerm < 1 || finalTerm > 5) return toast("Grades must be between 1.00 and 5.00.", true);
    const result = await API.post(`/api/admin/${programKey}/grades`, { student_id: id, ms_level: msLevel, midterm, final_term: finalTerm });
    toast(`${result.message} Final Grade: ${Number(result.grade).toFixed(2)} • ${result.status}`);
    setTimeout(() => location.reload(), 500);
  } catch (error) {
    toast(error.message, true);
  }
}

async function saveOffense(programKey, id) {
  try {
    const result = await API.post(`/api/admin/${programKey}/offenses`, { student_id: id, offend: $(`#o${id}`).value, settled: $(`#s${id}`).checked });
    toast(result.message);
  } catch (error) {
    toast(error.message, true);
  }
}

async function saveSerial(programKey, id) {
  try {
    const value = $(`#sn${id}`).value.trim();
    if (!value) return toast("Enter a serial number first.", true);
    const result = await API.post(`/api/admin/${programKey}/serial-numbers`, { student_id: id, serial_number: value });
    toast(result.message);
  } catch (error) {
    toast(error.message, true);
  }
}

async function withdraw(id, status) {
  try {
    const remarks = prompt("Admin remarks (optional):") || "";
    const result = await API.patch(`/api/admin/rotc/withdrawals/${id}`, { status, admin_remarks: remarks });
    toast(result.message);
    setTimeout(() => location.reload(), 500);
  } catch (error) {
    toast(error.message, true);
  }
}

function recordsTable(rows) {
  return table(["Student ID", "Name", "Course", "Year", "Program", "Assignment", "Email"], rows.map((row) => `<tr><td><strong>${esc(row.student_id)}</strong></td><td>${esc(`${row.last_name}, ${row.first_name}`)}</td><td>${esc(row.course)}</td><td>${esc(row.year_level)}</td><td>${esc(row.nstp_component)}</td><td>${esc(row.company || row.special_unit || row.rotc_company || "-")}</td><td>${esc(row.email)}</td></tr>`));
}
