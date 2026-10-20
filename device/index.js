import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const HOST = process.env.DEVICE_HOST || '127.0.0.1';
const PORT = Number(process.env.DEVICE_PORT || 4173);
const API_BASE = String(process.env.KINIMA_API_BASE_URL || '').replace(/\/+$/, '');
const DEVICE_TOKEN = process.env.KINIMA_DEVICE_TOKEN || '';
const configuredId = process.env.KINIMA_DEVICE_ID || '';
const dataKeyText = process.env.DEVICE_DATA_KEY || '';
const DATA_KEY = Buffer.from(dataKeyText, 'base64url');
if (!/^[A-Za-z0-9_-]{43}$/.test(dataKeyText) || DATA_KEY.length !== 32) throw new Error('DEVICE_DATA_KEY debe ser una clave base64url de 32 bytes; ejecutá scripts/prepare-local-env.ps1.');
if (!['127.0.0.1', '::1'].includes(HOST)) throw new Error('El servicio local de Raspberry solo debe escuchar en loopback.');
const DB_PATH = resolve(process.cwd(), process.env.DEVICE_DB_PATH || './data/kinima-device.sqlite');
const MAX_BODY = 96 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const STATIC = new Map([
  ['/', ['index.html', '.html']], ['/index.html', ['index.html', '.html']], ['/app.js', ['app.js', '.js']],
  ['/style.css', ['style.css', '.css']], ['/local-store.js', ['local-store.js', '.js']],
  ['/service-worker.js', ['service-worker.js', '.js']], ['/manifest.webmanifest', ['manifest.webmanifest', '.webmanifest']],
  ['/kinima-icon.svg', ['kinima-icon.svg', '.svg']],
  ['/assets/kinima-isotipo.png', ['assets/kinima-isotipo.png', '.png']],
  ['/assets/kinima-logo-azul.png', ['assets/kinima-logo-azul.png', '.png']],
  ['/assets/kinima-logo-crema.png', ['assets/kinima-logo-crema.png', '.png']]
]);
for (const asset of [
  'vision_bundle.mjs',
  'wasm/vision_wasm_internal.js',
  'wasm/vision_wasm_internal.wasm',
  'wasm/vision_wasm_module_internal.js',
  'wasm/vision_wasm_module_internal.wasm',
  'wasm/vision_wasm_nosimd_internal.js',
  'wasm/vision_wasm_nosimd_internal.wasm'
]) {
  const extension = asset.endsWith('.mjs') ? '.mjs' : asset.endsWith('.wasm') ? '.wasm' : '.js';
  const assetPath = 'node_modules/@mediapipe/tasks-vision/' + asset;
  STATIC.set('/' + assetPath, [assetPath, extension]);
}
STATIC.set('/assets/mediapipe/hand_landmarker.task', ['assets/mediapipe/hand_landmarker.task', '.task']);

if (process.env.NODE_ENV === 'production' && API_BASE && !API_BASE.startsWith('https://')) {
  throw new Error('La sincronización de una consola real requiere KINIMA_API_BASE_URL con HTTPS.');
}
await mkdir(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS device_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS device_sessions (
    id TEXT PRIMARY KEY,

    assignment_version INTEGER,
    started_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','attention','local_only')),
    synced_at TEXT,
    last_error TEXT,
    encrypted_payload TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS device_sessions_pending ON device_sessions(sync_status, created_at);
`);

const encryptedStateKeys = new Set(['assignment', 'recentSessions']);
function encryptText(plainText) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', DATA_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return JSON.stringify({ iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: ciphertext.toString('base64url') });
}
function decryptText(encoded) {
  const value = JSON.parse(encoded);
  const decipher = createDecipheriv('aes-256-gcm', DATA_KEY, Buffer.from(value.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(value.data, 'base64url')), decipher.final()]).toString('utf8');
}
function getState(key) {
  const row = db.prepare('SELECT value FROM device_state WHERE key=?').get(key);
  if (!row) return null;
  const serialized = encryptedStateKeys.has(key) ? decryptText(row.value) : row.value;
  try { return JSON.parse(serialized); } catch { return serialized; }
}
function setState(key, value) {
  const serialized = JSON.stringify(value);
  const stored = encryptedStateKeys.has(key) ? encryptText(serialized) : serialized;
  db.prepare('INSERT INTO device_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, stored);
}

function isEncryptedEnvelope(value) {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed.iv === 'string' && typeof parsed.tag === 'string' && typeof parsed.data === 'string';
  } catch { return false; }
}
function runTransaction(callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
function migrateLocalStorage() {
  const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='device_sessions'").get()?.sql || '';
  const columns = new Set(db.prepare('PRAGMA table_info(device_sessions)').all().map((column) => column.name));
  if (!columns.has('encrypted_payload') || !tableSql.includes('local_only')) {
    const oldRows = db.prepare('SELECT * FROM device_sessions').all();
    runTransaction(() => {
      db.exec('ALTER TABLE device_sessions RENAME TO device_sessions_legacy');
      db.exec(`CREATE TABLE device_sessions (
        id TEXT PRIMARY KEY, assignment_version INTEGER, started_at TEXT NOT NULL, created_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','attention','local_only')),
        synced_at TEXT, last_error TEXT, encrypted_payload TEXT NOT NULL
      )`);
      const insert = db.prepare(`INSERT INTO device_sessions(id,assignment_version,started_at,created_at,sync_status,synced_at,last_error,encrypted_payload)
        VALUES(?,?,?,?,?,?,?,?)`);
      for (const row of oldRows) {
        let session;
        if (row.encrypted_payload) session = JSON.parse(decryptText(row.encrypted_payload));
        else if (row.session_json) {
          try { session = JSON.parse(row.session_json); } catch { session = {}; }
        } else session = {};
        const startedAt = session.startedAt || row.started_at || row.created_at || new Date().toISOString();
        const createdAt = session.createdAt || row.created_at || startedAt;
        const patientId = session.patientId || row.patient_id || null;
        const assignmentVersion = Number(session.assignmentVersion || row.assignment_version) || null;
        const exercise = session.configuration || session.config || row.configuration || row.config || {};
        session = {
          ...session, id: row.id, patientId, assignmentVersion, startedAt, createdAt,
          hits: Number(session.hits ?? row.hits) || 0,
          elapsedSeconds: Number(session.elapsedSeconds ?? row.elapsed_seconds) || 0,
          durationSeconds: Number(session.durationSeconds ?? row.duration_seconds) || 0,
          completed: Boolean(session.completed ?? row.completed), configuration: exercise,
          syncStatus: patientId && assignmentVersion ? (row.sync_status || 'pending') : 'local_only'
        };
        const allowed = ['pending','synced','attention','local_only'];
        const status = allowed.includes(row.sync_status) && patientId && assignmentVersion ? row.sync_status : (patientId && assignmentVersion ? 'pending' : 'local_only');
        insert.run(row.id, assignmentVersion, startedAt, createdAt, status, row.synced_at || null, row.last_error || null, encryptText(JSON.stringify(session)));
      }
      db.exec('DROP TABLE device_sessions_legacy');
      db.exec('CREATE INDEX IF NOT EXISTS device_sessions_pending ON device_sessions(sync_status, created_at)');
    });
  }

  for (const row of db.prepare('SELECT key,value FROM device_state').all()) {
    if (!encryptedStateKeys.has(row.key)) continue;
    if (isEncryptedEnvelope(row.value)) {
      decryptText(row.value); // Fail closed if the saved key no longer matches.
      continue;
    }
    let value;
    try { value = JSON.parse(row.value); } catch { value = row.value; }
    setState(row.key, value);
  }
}
migrateLocalStorage();
let deviceId = getState('deviceId') || configuredId || randomUUID();
if (configuredId && getState('deviceId') && configuredId !== getState('deviceId')) throw new Error('KINIMA_DEVICE_ID no coincide con la consola ya inicializada.');
setState('deviceId', deviceId);
let currentAssignment = getState('assignment');
let syncState = 'waiting';
let lastSyncError = '';
let syncInFlight = null;
let retryDelayMs = 60_000;
let initialSyncPromise = null;

const translations = {
  horizontal: { corto: 'short', medio: 'medium', amplio: 'wide', short: 'short', medium: 'medium', wide: 'wide' },
  vertical: { bajo: 'low', medio: 'medium', alto: 'high', low: 'low', medium: 'medium', high: 'high' },
  zone: { izquierda: 'left', centro: 'center', derecha: 'right', bilateral: 'bilateral', left: 'left', center: 'center', right: 'right' },
  target: { grande: 'large', medio: 'medium', pequeno: 'small', pequeño: 'small', large: 'large', medium: 'medium', small: 'small' }
};
function canonicalExercise(config, durationSeconds) {
  if (!config || typeof config !== 'object') return null;
  const exercise = {
    horizontalRange: translations.horizontal[config.horizontalRange || config.horizontal],
    verticalRange: translations.vertical[config.verticalRange || config.vertical],
    workZone: translations.zone[config.workZone || config.zone],
    targetSize: translations.target[config.targetSize || config.target],
    durationSeconds: Number(config.durationSeconds || durationSeconds || config.duration)
  };
  if (!exercise.horizontalRange || !exercise.verticalRange || !exercise.workZone || !exercise.targetSize ||
      !Number.isInteger(exercise.durationSeconds) || exercise.durationSeconds < 15 || exercise.durationSeconds > 600) return null;
  return exercise;
}function sendJson(res, status, value) {
  const text = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
  res.end(text);
}
function error(res, status, code, message) { sendJson(res, status, { error: { code, message } }); }
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Solicitud demasiado grande.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('JSON no válido.'), { status: 400 }); }
}
function originAllowed(req) {
  const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`]);
  const host = String(req.headers.host || '').toLowerCase();
  if (!allowedHosts.has(host)) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  return new Set([...allowedHosts].map((value) => `http://${value}`)).has(origin);
}
function sameExercise(a, b) {
  return ['horizontalRange','verticalRange','workZone','targetSize','durationSeconds'].every((key) => a?.[key] === b?.[key]);
}
function getSessions() {
  const remote = (getState('recentSessions') || []).map((session) => ({
    ...session, createdAt: session.createdAt || session.startedAt, config: session.config || session.configuration || {}, syncStatus: 'synced'
  }));
  const local = db.prepare('SELECT encrypted_payload,sync_status FROM device_sessions ORDER BY created_at DESC LIMIT 100').all()
    .map((row) => ({ ...JSON.parse(decryptText(row.encrypted_payload)), syncStatus: row.sync_status }));
  const merged = new Map(remote.map((session) => [session.id, session]));
  for (const session of local) merged.set(session.id, session);
  return Array.from(merged.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100);
}
function validUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function sameStoredSession(existing, incoming) {
  return existing.id === incoming.id &&
    existing.deviceId === incoming.deviceId &&
    (existing.patientId || null) === (incoming.patientId || null) &&
    (Number(existing.assignmentVersion) || null) === (Number(incoming.assignmentVersion) || null) &&
    Date.parse(existing.startedAt) === Date.parse(incoming.startedAt) &&
    existing.hits === incoming.hits &&
    existing.elapsedSeconds === incoming.elapsedSeconds &&
    existing.durationSeconds === incoming.durationSeconds &&
    existing.completed === incoming.completed &&
    sameExercise(existing.configuration || existing.config, incoming.configuration);
}
function storeSession(input) {
  if (!input || !validUuid(input.id) || !Number.isInteger(input.hits) || input.hits < 0 ||
      typeof input.completed !== 'boolean') {
    throw Object.assign(new Error('La sesión no tiene identificador, puntaje o estado válido.'), { status: 400 });
  }

  const hasPatientId = input.patientId !== undefined && input.patientId !== null;
  const hasAssignmentVersion = input.assignmentVersion !== undefined && input.assignmentVersion !== null;
  if (hasPatientId !== hasAssignmentVersion ||
      (hasPatientId && (!validUuid(input.patientId) || !Number.isInteger(Number(input.assignmentVersion)) || Number(input.assignmentVersion) < 1))) {
    throw Object.assign(new Error('La sesión no tiene una asignación profesional válida.'), { status: 400 });
  }

  const patientId = hasPatientId ? input.patientId : null;
  const assignmentVersion = hasAssignmentVersion ? Number(input.assignmentVersion) : null;
  if (typeof input.startedAt !== 'string' || !Number.isFinite(Date.parse(input.startedAt))) {
    throw Object.assign(new Error('La sesión no tiene una fecha de inicio válida.'), { status: 400 });
  }

  const assignment = currentAssignment?.status === 'active' ? currentAssignment : null;
  const incoming = canonicalExercise(input.configuration || input.config, input.durationSeconds);
  const matchesCurrent = Boolean(assignment && patientId === assignment.patientId && assignmentVersion === assignment.version);
  const configuration = matchesCurrent ? assignment.exercise : incoming;
  if (!configuration) throw Object.assign(new Error('La configuración de la sesión no coincide con una asignación local válida.'), { status: 409 });

  const durationSeconds = Number(matchesCurrent ? configuration.durationSeconds : (input.durationSeconds ?? configuration.durationSeconds));
  if (!Number.isInteger(durationSeconds) || durationSeconds < 15 || durationSeconds > 600 ||
      durationSeconds !== configuration.durationSeconds) {
    throw Object.assign(new Error('La duración no coincide con la configuración del ejercicio.'), { status: 400 });
  }
  if (assignment && assignmentVersion === assignment.version && patientId === assignment.patientId && !sameExercise(configuration, assignment.exercise)) {
    throw Object.assign(new Error('La configuración de la sesión no coincide con la asignación profesional.'), { status: 409 });
  }

  const startedAt = new Date(input.startedAt).toISOString();
  const elapsedSeconds = Math.max(1, Math.min(durationSeconds, Number(input.elapsedSeconds) || 1));
  const session = {
    id: input.id,
    deviceId,
    patientId,
    assignmentVersion,
    startedAt,
    createdAt: new Date().toISOString(),
    hits: input.hits,
    durationSeconds,
    elapsedSeconds,
    completed: input.completed,
    configuration,
    syncStatus: patientId && assignmentVersion ? 'pending' : 'local_only'
  };

  db.prepare('INSERT INTO device_sessions(id,assignment_version,started_at,created_at,sync_status,encrypted_payload)\n    VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(
      session.id, session.assignmentVersion, session.startedAt, session.createdAt, session.syncStatus, encryptText(JSON.stringify(session))
    );

  const row = db.prepare('SELECT encrypted_payload,sync_status FROM device_sessions WHERE id=?').get(session.id);
  if (!row) throw new Error('No se pudo confirmar el guardado local de la sesión.');
  const existing = JSON.parse(decryptText(row.encrypted_payload));
  if (!sameStoredSession(existing, session)) {
    throw Object.assign(new Error('El identificador de sesión ya existe con otros datos.'), { status: 409 });
  }
  return { ...existing, syncStatus: row.sync_status };
}
async function centralRequest(route, payload) {
  if (!API_BASE || !DEVICE_TOKEN) throw new Error('Falta configurar KINIMA_API_BASE_URL o KINIMA_DEVICE_TOKEN.');
  const response = await fetch(`${API_BASE}${route}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${DEVICE_TOKEN}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || `El servidor respondió ${response.status}.`);
  return result;
}
function pendingSessions() {
  return db.prepare("SELECT encrypted_payload FROM device_sessions WHERE sync_status='pending' ORDER BY created_at LIMIT 50").all()
    .map((row) => JSON.parse(decryptText(row.encrypted_payload))).filter((session) => session.patientId && session.assignmentVersion);
}
async function syncNow() {
  if (!API_BASE || !DEVICE_TOKEN) {
    syncState = 'local';
    lastSyncError = '';
    return { configured: false };
  }
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    syncState = 'syncing';
    lastSyncError = '';
    try {
      const syncResponse = await centralRequest('/api/v1/device/sync', {
        deviceId,
        knownAssignmentVersion: Number(currentAssignment?.version || 0),
        lastSessionCursor: null
      });
      if (syncResponse.deviceId) {
        if (configuredId && configuredId !== syncResponse.deviceId) throw new Error('La credencial pertenece a otra consola; revisá KINIMA_DEVICE_ID.');
        deviceId = syncResponse.deviceId;
        setState('deviceId', deviceId);
      }
      currentAssignment = syncResponse.assignment || null;
      setState('assignment', currentAssignment);
      setState('recentSessions', Array.isArray(syncResponse.recentSessions) ? syncResponse.recentSessions : []);

      let acceptedTotal = 0;
      let rejectedTotal = 0;
      while (true) {
        const sessions = pendingSessions();
        if (!sessions.length) break;
        const submittedIds = new Set(sessions.map((session) => session.id));
        const batch = await centralRequest('/api/v1/sessions/batch', {
          sessions: sessions.map((session) => ({
            id: session.id,
            patientId: session.patientId,
            assignmentVersion: session.assignmentVersion,
            startedAt: session.startedAt,
            durationSeconds: session.durationSeconds,
            elapsedSeconds: session.elapsedSeconds,
            hits: session.hits,
            completed: session.completed,
            configuration: session.configuration
          }))
        });

        const acceptedIds = Array.isArray(batch.accepted)
          ? [...new Set(batch.accepted.filter((id) => submittedIds.has(id)))]
          : [];
        const acceptedSet = new Set(acceptedIds);
        const rejectedItems = Array.isArray(batch.rejected)
          ? [...new Map(batch.rejected.filter((item) => item && submittedIds.has(item.id) && !acceptedSet.has(item.id))
              .map((item) => [item.id, item])).values()]
          : [];
        if (!acceptedIds.length && !rejectedItems.length) {
          throw new Error('El servidor no confirmó ninguna de las sesiones enviadas.');
        }

        const markSynced = db.prepare("UPDATE device_sessions SET sync_status='synced',synced_at=?,last_error=NULL WHERE id=?");
        const markAttention = db.prepare("UPDATE device_sessions SET sync_status='attention',last_error=? WHERE id=?");
        runTransaction(() => {
          const timestamp = new Date().toISOString();
          for (const id of acceptedIds) markSynced.run(timestamp, id);
          for (const item of rejectedItems) markAttention.run(item.reason || 'El servidor rechazó la sesión.', item.id);
        });
        acceptedTotal += acceptedIds.length;
        rejectedTotal += rejectedItems.length;
      }

      setState('lastSuccessfulSync', syncResponse.serverTime || new Date().toISOString());
      retryDelayMs = 60_000;
      syncState = rejectedTotal ? 'attention' : 'ready';
      lastSyncError = rejectedTotal ? rejectedTotal + ' sesión(es) requieren revisión.' : '';
      return { configured: true, accepted: acceptedTotal, rejected: rejectedTotal };
    } catch (error) {
      syncState = 'error';
      lastSyncError = error.message || 'No se pudo sincronizar.';
      const delay = retryDelayMs;
      retryDelayMs = Math.min(retryDelayMs * 2, 6 * 60 * 60 * 1000);
      const timer = setTimeout(() => { void syncNow(); }, delay);
      timer.unref?.();
      return { configured: true, error: lastSyncError };
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}
function statusPayload() {
  const counts = db.prepare(`SELECT
    SUM(CASE WHEN sync_status='pending' THEN 1 ELSE 0 END) AS pending,
    SUM(CASE WHEN sync_status='attention' THEN 1 ELSE 0 END) AS attention,
    SUM(CASE WHEN sync_status='local_only' THEN 1 ELSE 0 END) AS local_only
    FROM device_sessions`).get();
  return {
    deviceId,
    assignmentVersion: currentAssignment?.status === 'active' ? Number(currentAssignment.version) : null,
    assignedPatientId: currentAssignment?.status === 'active' ? currentAssignment.patientId : null,
    serverConfigured: Boolean(API_BASE && DEVICE_TOKEN),
    syncState,
    pendingSessions: Number(counts.pending || 0),
    attentionSessions: Number(counts.attention || 0),
    localOnlySessions: Number(counts.local_only || 0),
    lastSuccessfulSync: getState('lastSuccessfulSync'),
    lastSyncError
  };
}

async function respondStatic(path, res) {
  const entry = STATIC.get(path);
  if (!entry) return false;
  try {
    const contents = await readFile(resolve(ROOT, entry[0]));
    res.writeHead(200, {
      'content-type': MIME[entry[1]],
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'content-security-policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    res.end(contents);
  } catch {
    error(res, 404, 'not_found', 'No se encontró este archivo de Kinima.');
  }
  return true;
}
async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (!originAllowed(req)) { error(res, 403, 'origin_denied', 'Host u origen de navegador no permitido.'); return; }
  if (req.method === 'GET' && await respondStatic(url.pathname, res)) return;

  if (req.method === 'GET' && url.pathname === '/api/local/bootstrap') {
    // La consola lee la asignación al iniciar. Esperá la sincronización inicial
    // para que la primera pantalla use la versión más reciente.
    if (initialSyncPromise) await initialSyncPromise;
    const localStatus = statusPayload();
    sendJson(res, 200, {
      deviceId,
      assignment: currentAssignment,
      recentSessions: getSessions(),
      serverConfigured: Boolean(API_BASE && DEVICE_TOKEN),
      secureLocalStore: true,
      production: process.env.NODE_ENV === 'production',
      lastSuccessfulSync: getState('lastSuccessfulSync'),
      syncState,
      pendingSessions: localStatus.pendingSessions,
      attentionSessions: localStatus.attentionSessions,
      lastSyncError
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/local/status') { sendJson(res, 200, statusPayload()); return; }
  if (req.method === 'GET' && url.pathname === '/api/local/history') { sendJson(res, 200, { sessions: getSessions() }); return; }
  if (req.method === 'POST' && url.pathname === '/api/local/sessions') {
    const input = await readBody(req);
    const session = storeSession(input);
    sendJson(res, 202, { stored: true, queued: session.syncStatus === 'pending', sessionId: session.id, syncStatus: session.syncStatus });
    void syncNow();
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/local/sync') {
    const result = await syncNow();
    sendJson(res, result.error ? 502 : 202, { ...result, ...statusPayload() });
    return;
  }
  error(res, 404, 'not_found', 'No se encontró esta ruta.');
}

const server = createServer((req, res) => {
  handle(req, res).catch((problem) => {
    console.error('Kinima device service error:', problem.message);
    if (!res.headersSent) error(res, problem.status || 500, problem.status ? 'request_error' : 'server_error', problem.status ? problem.message : 'Ocurrió un error interno.');
    else res.destroy();
  });
});
server.listen(PORT, HOST, () => {
  console.log(`Kinima local service listening on http://${HOST}:${PORT}`);
  initialSyncPromise = syncNow().finally(() => { initialSyncPromise = null; });
});
const dailySyncTimer = setInterval(() => { void syncNow(); }, 24 * 60 * 60 * 1000);
dailySyncTimer.unref?.();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
