const DB_NAME = "kinima.local.v1";
const DB_VERSION = 1;
const LEGACY_KEY = "kinima.sessions.v1";

let databasePromise;

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("sessions")) {
          const sessions = database.createObjectStore("sessions", { keyPath: "id" });
          sessions.createIndex("createdAt", "createdAt");
          sessions.createIndex("syncStatus", "syncStatus");
        }
        if (!database.objectStoreNames.contains("settings")) {
          database.createObjectStore("settings", { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento local."));
      request.onblocked = () => reject(new Error("Cerrá otras pestañas de Kinima y volvé a intentar."));
    });
  }
  return databasePromise;
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("La operación local se canceló."));
    transaction.onerror = () => reject(transaction.error || new Error("Falló una operación local."));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Falló una solicitud local."));
  });
}

export function createSessionId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function getSetting(key) {
  const database = await openDatabase();
  const transaction = database.transaction("settings", "readonly");
  const request = transaction.objectStore("settings").get(key);
  const valuePromise = requestResult(request);
  await transactionDone(transaction);
  return (await valuePromise)?.value;
}

async function putSetting(key, value) {
  const database = await openDatabase();
  const transaction = database.transaction("settings", "readwrite");
  transaction.objectStore("settings").put({ key, value });
  await transactionDone(transaction);
}

export async function listSessions() {
  const database = await openDatabase();
  const transaction = database.transaction("sessions", "readonly");
  const request = transaction.objectStore("sessions").getAll();
  const sessionsPromise = requestResult(request);
  await transactionDone(transaction);
  const sessions = await sessionsPromise;
  return sessions.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

export async function saveSession(session) {
  const database = await openDatabase();
  const transaction = database.transaction("sessions", "readwrite");
  transaction.objectStore("sessions").put(session);
  await transactionDone(transaction);
  return true;
}

export async function deleteSession(id) {
  const database = await openDatabase();
  const transaction = database.transaction("sessions", "readwrite");
  transaction.objectStore("sessions").delete(id);
  await transactionDone(transaction);
  return true;
}

export async function getLocalSetting(key) {
  return getSetting(key);
}

export async function setLocalSetting(key, value) {
  return putSetting(key, value);
}

export async function deleteLocalSetting(key) {
  const database = await openDatabase();
  const transaction = database.transaction("settings", "readwrite");
  transaction.objectStore("settings").delete(key);
  await transactionDone(transaction);
}

export async function initializeLocalStore() {
  if (!("indexedDB" in globalThis)) {
    throw new Error("Este navegador no ofrece almacenamiento local persistente para Kinima.");
  }

  let deviceId = await getSetting("deviceId");
  if (!deviceId) {
    deviceId = createSessionId();
    await putSetting("deviceId", deviceId);
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
    if (Array.isArray(legacy) && legacy.length > 0) {
      for (const oldSession of legacy) {
        const startedAt = oldSession.startedAt || oldSession.createdAt || new Date().toISOString();
        await saveSession({
          id: oldSession.id || createSessionId(),
          deviceId,
          patientId: oldSession.patientId || null,
          assignmentVersion: oldSession.assignmentVersion ?? null,
          startedAt,
          createdAt: oldSession.createdAt || startedAt,
          hits: Number(oldSession.hits) || 0,
          elapsedSeconds: Number(oldSession.elapsedSeconds) || 0,
          durationSeconds: Number(oldSession.durationSeconds) || Number(oldSession.elapsedSeconds) || 0,
          completed: Boolean(oldSession.completed),
          config: oldSession.config || oldSession.configuration || {},
          syncStatus: oldSession.syncStatus || "pending"
        });
      }
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch (error) {
    console.warn("No se pudo migrar el historial anterior de Kinima:", error);
  }

  return { deviceId, sessions: await listSessions() };
}
