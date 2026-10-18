let studentAttendanceMap = null;
let studentLocationCapture = 0;

function attendanceDisplayDate(value) {
  if(typeof value==='number')return new Date(value);
  const text=String(value||'').trim();
  return new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)&&!/(Z|[+-]\d{2}:?\d{2})$/.test(text)?text.replace(' ','T')+'+08:00':text);
}
function fmtA(value) {
  return value
    ? attendanceDisplayDate(value).toLocaleDateString('en-US', {
      timeZone:'Asia/Manila',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    : '-';
}

function fmtT(value) {
  return value
    ? attendanceDisplayDate(value).toLocaleTimeString('en-US', {
      timeZone:'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
    })
    : '-';
}

function effectiveSessionStatus(session) {
  const now = Date.now();
  const open = attendanceDisplayDate(session.open_date).getTime();
  const close = attendanceDisplayDate(session.close_date).getTime();
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
      : `Your location: ${Math.round(meters)}m away ? accuracy ?${Math.round(accuracyMeters)}m`;
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
  const latest = profile.records?.[0];
  const student = profile.student || {};
  const studentProgram = String(student.nstp_component || '').toUpperCase();
  const attendanceLabel = studentProgram === 'CWTS'
    ? 'CS (Community Service)'
    : studentProgram === 'ROTC'
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
            <small>Starts</small>
            <strong>${fmtT(session.open_date)}</strong>
          </div>
          <i></i>
          <div>
            <small>On time until</small>
            <strong>${fmtT(session.close_date)}</strong>
          </div>
          <i class="late"></i>
          <div>
            <small>Late until</small>
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

  renderStudentAttendanceHistory(history, studentProgram);
}

function renderStudentAttendanceHistory(history, studentProgram) {
  const historyNode = $('#studentAttendanceHistory');
  if (!historyNode) return;
  const opened = new Set([...(historyNode.querySelectorAll?.('details[open]') || [])].map(item => item.dataset.recordKey));
  const rows = history.map((row) => {
    const rowProgram = String(row.program || studentProgram).toUpperCase();
    const isCwts = rowProgram === 'CWTS';

    const key = String(row.id || [rowProgram,row.ms_level,row.school_year,row.mi_number,row.mi_type,row.open_date,row.created_at].join('|'));
    const values = [
            ['School year',row.school_year ? `SY ${esc(row.school_year)}` : '-'],
      ['Marked at (PH time)',esc(fmtT(row.marked_at_epoch!=null?Number(row.marked_at_epoch):row.created_at))],
      ...(attendanceUpdateDetails(row)?[['Attendance update',attendanceUpdateDetails(row)]]:[]),
    ];
    return `<details class="student-record-disclosure" data-record-key="${esc(key)}" ${opened.has(key)?'open':''}>
      <summary><div class="student-record-title"><strong>${isCwts?'CS':'MI'} ${esc(row.mi_number || '-')} &middot; ${esc(String(row.mi_type || '').toUpperCase())}</strong><small>${esc(fmtA(row.open_date))} &middot; ${isCwts?'CWTS':'MS'} ${esc(row.ms_level || '-')}</small></div>${badge(row.status)}<span class="student-record-toggle"><span class="when-closed">View details</span><span class="when-open">Hide details</span><span aria-hidden="true">&#9662;</span></span></summary>
      <dl class="student-record-details">${values.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`).join('')}</dl>
    </details>`;
  });

  historyNode.innerHTML = rows.length ? `<div class="student-record-list">${rows.join('')}</div>` : '<div class="notice" role="status">No attendance records yet.</div>';
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
    window.addEventListener('student-attendance-updated', event => {
      renderStudentAttendanceHistory(event.detail.history, String(auth.user.program || '').toUpperCase());
    });
    $('#refreshAttendanceHistory').onclick = () => (
      loadStudentAttendance().catch((error) => toast(error.message, true))
    );
  } catch (error) {
    showPageError(error);
  }
});
