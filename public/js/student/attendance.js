let studentAttendanceMap = null;
let studentLocationCapture = 0;

function fmtA(value) {
  return value
    ? new Date(value).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    : '-';
}

function fmtT(value) {
  return value
    ? new Date(value).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
    : '-';
}

function effectiveSessionStatus(session) {
  const now = Date.now();
  const open = new Date(session.open_date).getTime();
  const close = new Date(session.close_date).getTime();
  const late = close + 15 * 60000;

  if (now < open) return 'scheduled';
  if (now < close) return 'open';
  if (now < late) return 'late';
  return 'closed';
}

function attendanceDistanceMeters(lat1, lng1, lat2, lng2) {
  const values = [lat1, lng1, lat2, lng2].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return NaN;

  const [aLat, aLng, bLat, bLng] = values;
  const radius = 6371000;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;

  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function renderStudentMap(nodeId, session, latitude = null, longitude = null) {
  if (!window.L) return;

  const node = document.getElementById(nodeId);
  if (!node) return;
  if (studentAttendanceMap) studentAttendanceMap.remove();

  const targetLat = Number(session.latitude);
  const targetLng = Number(session.longitude);
  const map = L.map(node).setView([targetLat, targetLng], 18);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '(c) OpenStreetMap',
  }).addTo(map);

  L.marker([targetLat, targetLng])
    .addTo(map)
    .bindPopup('Approved attendance location');

  L.circle([targetLat, targetLng], {
    radius: Number(session.radius_meters || 100),
  }).addTo(map);

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    L.circleMarker([latitude, longitude], {
      radius: 10,
      color: '#b42318',
      weight: 3,
      fillColor: '#f04438',
      fillOpacity: 0.9,
    })
      .addTo(map)
      .bindPopup('Student location (reported by your device)');

    const bounds = L.latLngBounds([[targetLat, targetLng], [latitude, longitude]]);
    map.fitBounds(bounds.pad(0.35));
  }

  studentAttendanceMap = map;
}

function showStudentLocation(session, latitude, longitude, accuracyMeters) {
  const text = $('#studentLocationText');
  const meters = attendanceDistanceMeters(
    latitude,
    longitude,
    session.latitude,
    session.longitude
  );

  renderStudentMap('studentSessionMap', session, latitude, longitude);
  if (!text) return;

  if (Number.isFinite(meters)) {
    const uncertain = !Number.isFinite(accuracyMeters) || accuracyMeters <= 0
      || Math.abs(meters - Number(session.radius_meters || 100)) <= accuracyMeters;
    text.textContent = uncertain
      ? `Location uncertain: the red dot is an estimate, not confirmed outside or inside. Estimated distance: ${Math.round(meters)}m; device uncertainty: +/-${Math.round(accuracyMeters || 0)}m. On a laptop, try a phone with precise location enabled, then recapture.`
      : `Latest device estimate shown in red - ${Math.round(meters)}m from the attendance point - accuracy +/-${Math.round(accuracyMeters)}m`;
  } else {
    text.textContent = 'Your location is shown in red.';
  }
}

// Called from a student click; the browser owns the location permission prompt.
function captureStudentPosition(success, failure) {
  navigator.geolocation.getCurrentPosition(success, failure, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000,
  });
}

function updateStudentLocationPreview(session) {
  const text = $('#studentLocationText');
  const button = $('#recaptureLocationButton');
  const capture = ++studentLocationCapture;
  const finish = () => {
    if (button) {
      button.disabled = false;
      button.textContent = 'Recapture location';
    }
  };

  if (!navigator.geolocation) {
    if (text) text.textContent = 'Geolocation is not supported on this device.';
    renderStudentMap('studentSessionMap', session);
    return;
  }

  if (text) text.textContent = 'Allow location access if your browser asks. Getting your device location...';
  if (button) {
    button.disabled = true;
    button.textContent = 'Capturing location...';
  }
  captureStudentPosition(
    (position) => {
      if (capture !== studentLocationCapture) return;
      try {
        showStudentLocation(
          session,
          position.coords.latitude,
          position.coords.longitude,
          position.coords.accuracy
        );
      } finally { finish(); }
    },
    (error) => {
      if (capture !== studentLocationCapture) return;
      if (text) {
        text.textContent = error.code === 1
          ? 'Location is blocked. Open this site?s browser permissions, allow Location, then tap Recapture location.'
          : error.code === 3
            ? 'Your device did not return a location within 10 seconds. Tap Recapture location to try again.'
            : 'Device location is unavailable. Check that location services are on, then recapture.';
      }
      try { renderStudentMap('studentSessionMap', session); } finally { finish(); }
    }
  );
}

async function loadStudentAttendance() {
  studentLocationCapture += 1;
  const [profile, sessions, history] = await Promise.all([
    API.get('/api/student/profile'),
    API.get('/api/student/attendance/sessions'),
    API.get('/api/student/attendance'),
  ]);

  const state = $('#studentAttendanceState');
  const active = $('#studentAttendanceActive');
  const historyNode = $('#studentAttendanceHistory');
  const latest = profile.records?.[0];
  const student = profile.student || {};
  const attendanceLabel = student.nstp_component === 'CWTS'
    ? 'CS (Community Service)'
    : student.nstp_component === 'ROTC'
      ? 'MI (Military Instruction)'
      : '';
  $('#studentAttendanceHistoryDescription').textContent = attendanceLabel
    ? `Your recorded ${attendanceLabel} attendance.`
    : 'Your recorded attendance.';

  if (student.serial_number) {
    state.innerHTML = '<div class="attendance-state-card success"><h3>NSTP Completed</h3><p>You already have a serial number. Attendance is no longer required.</p></div>';
    active.innerHTML = '';
  } else if (!latest || latest.status !== 'approved') {
    state.innerHTML = '<div class="attendance-state-card warning"><h3>Enrollment Not Yet Approved</h3><p>Your enrollment must be approved before you can mark attendance.</p></div>';
    active.innerHTML = '';
  } else if (!sessions.length) {
    state.innerHTML = '<div class="attendance-state-card"><h3>No Active Attendance</h3><p>There is no scheduled or active attendance session for your program right now.</p></div>';
    active.innerHTML = '';
  } else {
    state.innerHTML = '';

    const session = sessions[0];
    const status = session.effective_status || effectiveSessionStatus(session);
    const unit = session.program === 'CWTS' ? 'CS' : 'MI';
    const track = Number(session.is_advance_course || 0) ? ' - Advance Course' : '';

    active.innerHTML = `
      <article class="student-attendance-card ${status}">
        <div class="student-attendance-header">
          <div>
            <span>${session.program}${track}</span>
            <h2>${unit} ${esc(session.mi_number || '-')} ${(session.mi_type || '').toUpperCase()}</h2>
            <p>${fmtA(session.open_date)}</p>
          </div>
          <div class="student-attendance-header-actions">
            <span class="attendance-status-badge ${status === 'open' ? 'success' : status === 'late' ? 'warning' : 'info'}">${esc(status)}</span>
            <button class="btn" id="recaptureLocationButton" type="button">Recapture location</button>
          </div>
        </div>

        <div class="attendance-time-track">
          <div>
            <small>Open</small>
            <strong>${fmtT(session.open_date)}</strong>
          </div>
          <i></i>
          <div>
            <small>On-time Close</small>
            <strong>${fmtT(session.close_date)}</strong>
          </div>
          <i class="late"></i>
          <div>
            <small>Late Until</small>
            <strong>${fmtT(session.late_deadline)}</strong>
          </div>
        </div>

        <div class="attendance-location-panel">
          <div id="studentSessionMap" class="attendance-map compact"></div>
          <div id="studentLocationText" class="location-status">Getting your location...</div>
        </div>

        <button
          id="markAttendanceButton"
          class="btn primary mark-attendance-btn"
          type="button"
          ${status === 'scheduled' ? 'disabled' : ''}
        >
          ${status === 'late'
            ? 'Mark as Late'
            : status === 'scheduled'
              ? 'Session Not Open Yet'
              : 'Mark Attendance'}
        </button>
      </article>
    `;

    renderStudentMap('studentSessionMap', session);
    $('#recaptureLocationButton').onclick = () => updateStudentLocationPreview(session);
    $('#markAttendanceButton').onclick = () => markStudentAttendance(session);
    // Preview the device location on entry; this does not record attendance.
    updateStudentLocationPreview(session);
  }

  const rows = history.map((row) => `
    <tr>
      <td>${row.program === 'CWTS' ? 'CS' : 'MI'} ${esc(row.mi_number || '-')}</td>
      <td>${String(row.mi_type || '').toUpperCase()}</td>
      <td>${fmtA(row.open_date)}</td>
      <td>${fmtT(row.created_at)}</td>
      <td>${badge(row.status)}</td>
    </tr>
  `);

  historyNode.innerHTML = table(
    ['Session', 'Type', 'Date', 'Marked At', 'Status'],
    rows
  );
}

function markStudentAttendance(session) {
  const button = $('#markAttendanceButton');
  const text = $('#studentLocationText');

  if (!navigator.geolocation) {
    return toast('Geolocation is not supported by this browser.', true);
  }

  button.disabled = true;
  button.textContent = 'Getting location...';

  captureStudentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      showStudentLocation(session, lat, lng, position.coords.accuracy);

      try {
        const result = await API.post('/api/student/attendance/mark', {
          sessionId: session.id,
          latitude: lat,
          longitude: lng,
        });

        toast(`${result.message} You are ${result.distance}m from the attendance point.`);
        await loadStudentAttendance();
      } catch (error) {
        toast(error.message, true);
        button.disabled = false;
        button.textContent = 'Try Again';

        if (text && !text.textContent) {
          text.textContent = `Your location is shown in red - accuracy +/-${Math.round(position.coords.accuracy)}m`;
        }
      }
    },
    (error) => {
      if (text) text.textContent = 'Location unavailable.';
      toast(
        error.code === 1
          ? 'Please allow location access for this site.'
          : 'Unable to retrieve your location.',
        true
      );
      button.disabled = false;
      button.textContent = 'Try Again';
    }
  );
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const auth = await guard('student');
    if (!auth) return;

    shell(
      'student',
      'Attendance',
      'Check in to your active geolocation attendance session.',
      auth
    );

    await loadStudentAttendance();
    $('#refreshAttendanceHistory').onclick = () => (
      loadStudentAttendance().catch((error) => toast(error.message, true))
    );
  } catch (error) {
    showPageError(error);
  }
});
