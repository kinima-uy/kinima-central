const elements = {
  connectionPill: document.getElementById('connection-pill'),
  connectionLabel: document.getElementById('connection-label'),
  serviceStatus: document.getElementById('service-status'),
  syncStatus: document.getElementById('sync-status'),
  pendingSessions: document.getElementById('pending-sessions'),
  lastSync: document.getElementById('last-sync'),
  testButton: document.getElementById('btnPrueba'),
  testFeedback: document.getElementById('estado-prueba'),
  refreshButton: document.getElementById('btn-refresh'),
  syncButton: document.getElementById('btn-sync'),
  syncFeedback: document.getElementById('sync-feedback')
};

const syncLabels = {
  waiting: 'Esperando conexión',
  local: 'Guardado local',
  syncing: 'Sincronizando',
  ready: 'Al día',
  attention: 'Revisión pendiente',
  error: 'Sin conexión central'
};

function setFeedback(element, message, state = '') {
  element.textContent = message;
  element.classList.toggle('is-success', state === 'success');
  element.classList.toggle('is-error', state === 'error');
}

function setConnection(label, state) {
  elements.connectionLabel.textContent = label;
  elements.connectionPill.dataset.state = state;
}

function formatDate(value) {
  if (!value) return 'Todavía no';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Todavía no';
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...options.headers
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof result.error === 'string' ? result.error : result.error?.message;
    throw new Error(message || `El servicio respondió ${response.status}.`);
  }
  return result;
}

function showServiceUnavailable(message) {
  setConnection('Servicio local no disponible', 'error');
  elements.serviceStatus.textContent = 'Sin conexión';
  elements.syncStatus.textContent = '—';
  elements.pendingSessions.textContent = '—';
  elements.lastSync.textContent = '—';
  setFeedback(elements.syncFeedback, message, 'error');
}

async function refreshStatus({ quiet = false } = {}) {
  if (!['http:', 'https:'].includes(window.location.protocol)) {
    showServiceUnavailable('Abrí la página desde el servicio local para consultar el estado de la consola.');
    return null;
  }

  elements.refreshButton.disabled = true;
  if (!quiet) setConnection('Consultando la consola', 'checking');

  try {
    const status = await requestJson('/api/local/status');
    const syncState = status.syncState || 'waiting';
    const localOnly = !status.serverConfigured;

    elements.serviceStatus.textContent = status.deviceId
      ? `En línea · …${status.deviceId.slice(-6)}`
      : 'En línea';
    elements.syncStatus.textContent = localOnly
      ? 'Pendiente de configurar'
      : (syncLabels[syncState] || 'Estado desconocido');
    elements.pendingSessions.textContent = String(status.pendingSessions ?? 0);
    elements.lastSync.textContent = formatDate(status.lastSuccessfulSync);

    if (syncState === 'error') {
      setConnection('Consola en modo local', 'error');
    } else if (syncState === 'attention') {
      setConnection('Hay sesiones para revisar', 'attention');
    } else if (localOnly || syncState === 'local') {
      setConnection('Consola local en línea', 'local');
    } else if (syncState === 'syncing') {
      setConnection('Sincronizando', 'checking');
    } else {
      setConnection('Consola en línea', 'ready');
    }

    if (!quiet) {
      setFeedback(
        elements.syncFeedback,
        status.lastSyncError || (localOnly
          ? 'El servicio local está activo. La conexión central se configura aparte.'
          : 'Estado actualizado.'),
        status.lastSyncError ? 'error' : ''
      );
    }
    return status;
  } catch (error) {
    showServiceUnavailable(error.message || 'No se pudo consultar el servicio local.');
    return null;
  } finally {
    elements.refreshButton.disabled = false;
  }
}

elements.testButton.addEventListener('click', () => {
  const time = new Intl.DateTimeFormat('es-UY', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date());
  setFeedback(elements.testFeedback, `La interfaz Kinima respondió correctamente · ${time}`, 'success');
});

elements.refreshButton.addEventListener('click', () => {
  void refreshStatus();
});

elements.syncButton.addEventListener('click', async () => {
  elements.syncButton.disabled = true;
  setFeedback(elements.syncFeedback, 'Consultando el servidor…');

  try {
    const result = await requestJson('/api/local/sync', { method: 'POST' });
    await refreshStatus({ quiet: true });
    if (!result.configured) {
      setFeedback(elements.syncFeedback, 'El servicio local funciona; la sincronización central todavía no está configurada.');
    } else if (result.error) {
      setFeedback(elements.syncFeedback, result.error, 'error');
    } else {
      const accepted = Number(result.accepted || 0);
      setFeedback(
        elements.syncFeedback,
        accepted ? `Sincronización completada · ${accepted} sesión(es) enviada(s).` : 'Sincronización completada. No hay sesiones pendientes.',
        'success'
      );
    }
  } catch (error) {
    await refreshStatus({ quiet: true });
    setFeedback(elements.syncFeedback, error.message || 'No se pudo iniciar la sincronización.', 'error');
  } finally {
    elements.syncButton.disabled = false;
  }
});

void refreshStatus();
