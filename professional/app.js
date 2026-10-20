const state = { token: null, professional: null, patients: [], devices: [], professionals: [], patientAccess: [], deviceAccess: [] };
const $ = (selector) => document.querySelector(selector);
const authView = $('#auth-view');
const appView = $('#app-view');
const authMessage = $('#auth-message');

function setMessage(element, text, kind = '') {
  element.textContent = text;
  element.classList.toggle('is-error', kind === 'error');
  element.classList.toggle('is-success', kind === 'success');
}
async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('accept', 'application/json');
  if (options.body) headers.set('content-type', 'application/json');
  if (state.token) headers.set('authorization', `Bearer ${state.token}`);
  const response = await fetch(path, { ...options, headers, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Error ${response.status}`);
  return data;
}
function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha sin registrar';
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function describeConfiguration(configuration) {
  if (!configuration || typeof configuration !== 'object') return 'Configuración no disponible para esta sesión.';
  const labels = {
    horizontalRange: { short: 'corto', medium: 'medio', wide: 'amplio' },
    verticalRange: { low: 'bajo', medium: 'medio', high: 'alto' },
    workZone: { left: 'izquierda', center: 'centro', right: 'derecha', bilateral: 'bilateral' },
    targetSize: { large: 'grande', medium: 'mediano', small: 'pequeño' }
  };
  const values = [
    labels.horizontalRange[configuration.horizontalRange] && `alcance ${labels.horizontalRange[configuration.horizontalRange]}`,
    labels.verticalRange[configuration.verticalRange] && `nivel vertical ${labels.verticalRange[configuration.verticalRange]}`,
    labels.workZone[configuration.workZone] && `zona ${labels.workZone[configuration.workZone]}`,
    labels.targetSize[configuration.targetSize] && `objetivo ${labels.targetSize[configuration.targetSize]}`,
    Number.isInteger(Number(configuration.durationSeconds)) && `${Number(configuration.durationSeconds)} s`
  ].filter(Boolean);
  return values.length ? values.join(' · ') : 'Configuración no disponible para esta sesión.';
}
function showAuthMode(needsSetup) {
  $('#login-panel').hidden = needsSetup;
  $('#setup-panel').hidden = !needsSetup;
  setMessage(authMessage, needsSetup ? 'Usá el código guardado en .env para crear la primera cuenta administradora.' : '');
}
function enterApp(professional) {
  state.professional = professional;
  authView.hidden = true;
  appView.hidden = false;
  $('#welcome-title').textContent = `Hola, ${professional.displayName}`;
  document.querySelectorAll('.admin-only').forEach((element) => { element.hidden = professional.role !== 'administrator'; });
  void loadDashboard();
}
function logout() {
  state.token = null;
  state.professional = null;
  state.patients = [];
  state.devices = [];
  state.professionals = [];
  state.patientAccess = [];
  state.deviceAccess = [];
  appView.hidden = true;
  authView.hidden = false;
  $('#login-password').value = '';
  $('#setup-password').value = '';
  void initialize();
}
function makeItem(primary, secondary, meta = '') {
  const row = document.createElement('div'); row.className = 'item-row';
  const content = document.createElement('div'); content.className = 'item-main';
  const title = document.createElement('strong'); title.textContent = primary;
  const description = document.createElement('span'); description.textContent = secondary;
  content.append(title, description); row.append(content);
  if (meta) { const badge = document.createElement('span'); badge.className = 'item-meta'; badge.textContent = meta; row.append(badge); }
  return row;
}
function fillSelect(select, rows, label, placeholder) {
  const current = select.value;
  select.replaceChildren();
  const blank = document.createElement('option'); blank.value = ''; blank.textContent = placeholder; select.append(blank);
  for (const row of rows) {
    const option = document.createElement('option'); option.value = row.id; option.textContent = label(row); select.append(option);
  }
  if (rows.some((row) => row.id === current)) select.value = current;
}
function renderPatients() {
  $('#patient-count').textContent = String(state.patients.length);
  const list = $('#patient-list'); list.replaceChildren();
  if (!state.patients.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Todavía no hay pacientes.'; list.append(empty); }
  for (const patient of state.patients) list.append(makeItem(patient.localCode, patient.displayLabel, 'Paciente'));
  const label = (patient) => `${patient.localCode} · ${patient.displayLabel}`;
  fillSelect($('#assignment-patient'), state.patients, label, 'Seleccioná un paciente');
  fillSelect($('#history-patient'), state.patients, label, 'Seleccioná un paciente');
  fillSelect($('#patient-access-patient'), state.patients, label, 'Seleccioná un paciente');
}
function renderDevices() {
  $('#device-count').textContent = String(state.devices.length);
  const list = $('#device-list'); list.replaceChildren();
  if (!state.devices.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Todavía no hay consolas asignadas.'; list.append(empty); }
  for (const device of state.devices) {
    const assignment = device.activeAssignment;
    const detail = assignment ? `Asignada a ${assignment.patientCode} · versión ${assignment.version}` : 'Sin paciente asignado';
    const seen = device.lastSeenAt ? `Última conexión ${formatDate(device.lastSeenAt)}` : 'Aún no se conectó';
    const row = makeItem(`${device.deviceCode} · ${device.displayName}`, `${detail} · ${seen}`, assignment ? 'Asignada' : 'Disponible');
    if (state.professional.role === 'administrator') {
      const rotate = document.createElement('button');
      rotate.className = 'button button-quiet';
      rotate.type = 'button';
      rotate.textContent = 'Renovar token';
      rotate.dataset.rotateDevice = device.id;
      rotate.setAttribute('aria-label', `Renovar token de ${device.deviceCode}`);
      row.append(rotate);
    }
    list.append(row);
  }
  const label = (device) => `${device.deviceCode} · ${device.displayName}`;
  fillSelect($('#assignment-device'), state.devices, label, 'Seleccioná una consola');
  fillSelect($('#device-access-device'), state.devices, label, 'Seleccioná una consola');
}
function renderProfessionals() {
  const professionals = state.professionals.filter((professional) => professional.role === 'professional');
  const label = (professional) => `${professional.displayName} · ${professional.email}`;
  fillSelect($('#patient-access-professional'), professionals, label, 'Seleccioná un profesional');
  fillSelect($('#device-access-professional'), professionals, label, 'Seleccioná un profesional');
}
function renderAccessList(element, grants, kind) {
  element.replaceChildren();
  if (!grants.length) {
    const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No hay accesos compartidos.'; element.append(empty); return;
  }
  for (const grant of grants) {
    const isPatient = kind === 'patient';
    const subject = isPatient
      ? `${grant.patientCode} · ${grant.patientLabel}`
      : `${grant.deviceCode} · ${grant.deviceName}`;
    const row = makeItem(subject, `Compartido con ${grant.professionalName} · ${grant.professionalEmail}`, 'Compartido');
    const button = document.createElement('button');
    button.className = 'button button-quiet';
    button.type = 'button';
    button.textContent = 'Revocar acceso';
    button.dataset.professionalId = grant.professionalId;
    if (isPatient) button.dataset.revokePatient = grant.patientId;
    else button.dataset.revokeDeviceAccess = grant.deviceId;
    button.setAttribute('aria-label', `Revocar acceso de ${grant.professionalName} a ${subject}`);
    row.append(button);
    element.append(row);
  }
}
function renderAccess() {
  renderAccessList($('#patient-access-list'), state.patientAccess, 'patient');
  renderAccessList($('#device-access-list'), state.deviceAccess, 'device');
}
async function loadDashboard() {
  try {
    const [patients, devices, professionals, access] = await Promise.all([
      api('/api/v1/professional/patients'),
      api('/api/v1/professional/devices'),
      state.professional.role === 'administrator' ? api('/api/v1/admin/professionals') : Promise.resolve({ professionals: [] }),
      state.professional.role === 'administrator' ? api('/api/v1/admin/access') : Promise.resolve({ patientAccess: [], deviceAccess: [] })
    ]);
    state.patients = patients.patients || [];
    state.devices = devices.devices || [];
    state.professionals = professionals.professionals || [];
    state.patientAccess = access.patientAccess || [];
    state.deviceAccess = access.deviceAccess || [];
    renderPatients(); renderDevices(); renderProfessionals(); renderAccess();
    $('#connection-indicator').classList.remove('is-error');
    $('#connection-indicator').lastChild.textContent = ' Conectado al servidor';
  } catch (error) {
    $('#connection-indicator').classList.add('is-error');
    $('#connection-indicator').lastChild.textContent = ' Error de conexión';
    console.error('Kinima portal:', error.message);
  }
}
async function initialize() {
  const indicator = $('#connection-indicator');
  indicator.classList.remove('is-error');
  indicator.lastChild.textContent = ' Conectando';
  try {
    const status = await api('/api/v1/setup/status');
    showAuthMode(status.needsFirstAdmin);
    indicator.lastChild.textContent = ' Servidor disponible';
  } catch (error) {
    showAuthMode(false);
    indicator.classList.add('is-error');
    indicator.lastChild.textContent = ' Sin conexión';
    setMessage(authMessage, `No se pudo contactar la API: ${error.message}`, 'error');
  }
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); setMessage(authMessage, 'Ingresando…');
  try {
    const result = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#login-email').value, password: $('#login-password').value }) });
    state.token = result.accessToken; enterApp(result.professional);
  } catch (error) { setMessage(authMessage, error.message, 'error'); }
});
$('#setup-form').addEventListener('submit', async (event) => {
  event.preventDefault(); setMessage(authMessage, 'Creando cuenta…');
  try {
    const result = await api('/api/v1/setup/first-admin', { method: 'POST', body: JSON.stringify({
      bootstrapToken: $('#setup-token').value, displayName: $('#setup-name').value, email: $('#setup-email').value, password: $('#setup-password').value
    }) });
    $('#setup-token').value = ''; $('#setup-password').value = '';
    state.token = result.accessToken; enterApp(result.professional);
  } catch (error) { setMessage(authMessage, error.message, 'error'); }
});
$('#logout-button').addEventListener('click', logout);
$('#patient-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/v1/professional/patients', { method: 'POST', body: JSON.stringify({ localCode: $('#patient-code').value, displayLabel: $('#patient-label').value }) });
    $('#patient-form').reset(); setMessage($('#patient-message'), 'Paciente agregado.', 'success'); await loadDashboard();
  } catch (error) { setMessage($('#patient-message'), error.message, 'error'); }
});
$('#device-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await api('/api/v1/admin/devices', { method: 'POST', body: JSON.stringify({ deviceCode: $('#device-code').value, displayName: $('#device-label').value }) });
    $('#device-form').reset();
    $('#device-token-panel strong').textContent = 'Credencial de consola — se muestra una sola vez';
    $('#device-token-help').textContent = 'Copiala a KINIMA_DEVICE_TOKEN en el archivo protegido de esa Raspberry y reiniciá el servicio local. No la pegues en la interfaz web ni la compartas.';
    $('#device-token-value').textContent = result.deviceToken; $('#device-token-panel').hidden = false; await loadDashboard();
  } catch (error) { window.alert(error.message); }
});
$('#token-dismiss').addEventListener('click', () => { $('#device-token-value').textContent = ''; $('#device-token-panel').hidden = true; });
$('#device-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-rotate-device]');
  if (!button) return;
  if (!window.confirm('La credencial actual dejará de funcionar al confirmar. ¿Querés renovar el token de esta consola?')) return;
  button.disabled = true;
  try {
    const result = await api(`/api/v1/admin/devices/${encodeURIComponent(button.dataset.rotateDevice)}/rotate-token`, { method: 'POST' });
    $('#device-token-value').textContent = result.deviceToken;
    $('#device-token-panel').hidden = false;
    $('#device-token-panel strong').textContent = 'Nueva credencial de consola — se muestra una sola vez';
    $('#device-token-help').textContent = 'La credencial anterior quedó invalidada. Actualizá KINIMA_DEVICE_TOKEN en la Raspberry y reiniciá el servicio local. Las sesiones cifradas pendientes permanecen en la consola.';
    $('#device-token-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    window.alert(error.message);
  } finally {
    button.disabled = false;
  }
});
$('#assignment-form').addEventListener('submit', async (event) => {
  event.preventDefault(); setMessage($('#assignment-message'), 'Guardando asignación…');
  const exercise = { horizontalRange: $('#setting-horizontal').value, verticalRange: $('#setting-vertical').value, workZone: $('#setting-zone').value, targetSize: $('#setting-target').value, durationSeconds: Number($('#setting-duration').value) };
  try {
    await api(`/api/v1/professional/assignments/${encodeURIComponent($('#assignment-device').value)}`, { method: 'PUT', body: JSON.stringify({ patientId: $('#assignment-patient').value, exercise }) });
    setMessage($('#assignment-message'), 'Asignación guardada. La consola la recibirá en su próxima sincronización.', 'success');
    await loadDashboard();
  } catch (error) { setMessage($('#assignment-message'), error.message, 'error'); }
});
$('#history-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const patientId = $('#history-patient').value;
  if (!patientId) return;
  const list = $('#history-list'); list.replaceChildren();
  const loading = document.createElement('p'); loading.className = 'empty'; loading.textContent = 'Cargando sesiones…'; list.append(loading);
  try {
    const result = await api(`/api/v1/professional/patients/${encodeURIComponent(patientId)}/sessions?limit=100`);
    list.replaceChildren();
    if (!result.sessions.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Este paciente todavía no tiene sesiones recibidas.'; list.append(empty); return; }
    for (const session of result.sessions) {
      const detail = `${session.hits} aciertos · ${session.elapsedSeconds} s en movimiento · ${session.completed ? 'temporizador completo' : 'finalizada manualmente'}`;
      const row = makeItem(formatDate(session.startedAt), detail, `Asignación v${session.assignmentVersion}`);
      const configuration = document.createElement('span');
      configuration.textContent = describeConfiguration(session.configuration);
      row.querySelector('.item-main').append(configuration);
      list.append(row);
    }
  } catch (error) { list.replaceChildren(); const message = document.createElement('p'); message.className = 'empty'; message.textContent = error.message; list.append(message); }
});
$('#professional-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/v1/admin/professionals', { method: 'POST', body: JSON.stringify({ displayName: $('#professional-name').value, email: $('#professional-email').value, password: $('#professional-password').value }) });
    $('#professional-form').reset(); setMessage($('#professional-message'), 'Cuenta creada. Compartí la contraseña temporal por un canal privado.', 'success'); await loadDashboard();
  } catch (error) { setMessage($('#professional-message'), error.message, 'error'); }
});
$('#patient-access-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api(`/api/v1/admin/patients/${encodeURIComponent($('#patient-access-patient').value)}/access`, { method: 'PUT', body: JSON.stringify({ professionalId: $('#patient-access-professional').value }) });
    setMessage($('#access-message'), 'Acceso al paciente compartido.', 'success'); await loadDashboard();
  } catch (error) { setMessage($('#access-message'), error.message, 'error'); }
});
$('#device-access-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api(`/api/v1/admin/devices/${encodeURIComponent($('#device-access-device').value)}/access`, { method: 'PUT', body: JSON.stringify({ professionalId: $('#device-access-professional').value }) });
    setMessage($('#access-message'), 'Acceso a la consola compartido.', 'success'); await loadDashboard();
  } catch (error) { setMessage($('#access-message'), error.message, 'error'); }
});
$('#patient-access-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-revoke-patient]');
  if (!button) return;
  if (!window.confirm('El profesional dejará de consultar este paciente. ¿Querés revocar el acceso?')) return;
  button.disabled = true;
  try {
    await api(`/api/v1/admin/patients/${encodeURIComponent(button.dataset.revokePatient)}/access`, {
      method: 'DELETE', body: JSON.stringify({ professionalId: button.dataset.professionalId })
    });
    setMessage($('#access-message'), 'Acceso al paciente revocado.', 'success'); await loadDashboard();
  } catch (error) { setMessage($('#access-message'), error.message, 'error'); }
  finally { button.disabled = false; }
});
$('#device-access-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-revoke-device-access]');
  if (!button) return;
  if (!window.confirm('El profesional dejará de administrar esta consola. ¿Querés revocar el acceso?')) return;
  button.disabled = true;
  try {
    await api(`/api/v1/admin/devices/${encodeURIComponent(button.dataset.revokeDeviceAccess)}/access`, {
      method: 'DELETE', body: JSON.stringify({ professionalId: button.dataset.professionalId })
    });
    setMessage($('#access-message'), 'Acceso a la consola revocado.', 'success'); await loadDashboard();
  } catch (error) { setMessage($('#access-message'), error.message, 'error'); }
  finally { button.disabled = false; }
});

void initialize();
