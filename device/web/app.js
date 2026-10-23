import { FilesetResolver, HandLandmarker } from "/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs";

const $ = (id) => document.getElementById(id);
const ui = {
  connectionPill: $("connection-pill"), connectionLabel: $("connection-label"),
  homeScreen: $("home-screen"), gameScreen: $("game-screen"), resultScreen: $("result-screen"),
  assignmentLoading: $("assignment-loading"), assignmentReady: $("assignment-ready"), assignmentEmpty: $("assignment-empty"),
  patientCode: $("patient-code"), exerciseDetails: $("exercise-details"), emptyCopy: $("empty-copy"),
  startButton: $("btn-start"), startFeedback: $("start-feedback"), reloadButton: $("btn-reload"),
  refreshButton: $("btn-refresh"), syncButton: $("btn-sync"), syncStatus: $("sync-status"),
  pendingSessions: $("pending-sessions"), lastSync: $("last-sync"), syncFeedback: $("sync-feedback"),
  recentSessions: $("recent-sessions"), camera: $("camera"), gameStage: $("game-stage"),
  cameraMessage: $("camera-message"), target: $("target"), pointer: $("pointer"),
  timer: $("timer"), score: $("score"), gameHint: $("game-hint"), finishButton: $("btn-finish"),
  resultSummary: $("result-summary"), saveFeedback: $("save-feedback"), retrySaveButton: $("btn-retry-save"),
  homeButton: $("btn-home")
};

const RANGE_LABELS = { short: "Corto", medium: "Medio", wide: "Amplio" };
const VERTICAL_LABELS = { low: "Bajo", medium: "Medio", high: "Alto" };
const ZONE_LABELS = { left: "Izquierda", center: "Centro", right: "Derecha", bilateral: "Ambos lados" };
const SIZE_LABELS = { large: "Grande", medium: "Mediano", small: "Chico" };
const SYNC_LABELS = {
  waiting: "Esperando conexión", local: "Solo consola", syncing: "Sincronizando",
  ready: "Al día", attention: "Revisar sesión", error: "Sin conexión central"
};
const SESSION_LABELS = {
  pending: "Pendiente de envío", synced: "Sincronizada", attention: "Requiere revisión", local_only: "Solo en esta consola"
};

const state = {
  bootstrap: null,
  assignment: null,
  exercise: null,
  landmarker: null,
  landmarkerPromise: null,
  stream: null,
  animationFrame: 0,
  timerInterval: 0,
  startedAt: "",
  startedAtMs: 0,
  score: 0,
  targetPosition: null,
  hitLocked: false,
  lastVideoTime: -1,
  lastFrameAt: 0,
  ending: false,
  pendingResult: null,
  resultSaved: false
};

function setConnection(label, mood) {
  ui.connectionLabel.textContent = label;
  ui.connectionPill.dataset.state = mood;
}

function setFeedback(element, message, mood = "") {
  element.textContent = message;
  element.classList.toggle("is-success", mood === "success");
  element.classList.toggle("is-error", mood === "error");
}

function formatDate(value) {
  if (!value) return "Todavía no";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Todavía no";
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  }).format(date);
}

function formatDuration(seconds) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  if (!minutes) return `${remainder} segundos`;
  return remainder ? `${minutes} min ${remainder} s` : `${minutes} min`;
}

function formatClock(seconds) {
  const remaining = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: { Accept: "application/json", ...options.headers }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof result.error === "string" ? result.error : result.error?.message;
    throw new Error(message || `El servicio respondió ${response.status}.`);
  }
  return result;
}

function isValidExercise(exercise) {
  return Boolean(exercise &&
    Object.hasOwn(RANGE_LABELS, exercise.horizontalRange) &&
    Object.hasOwn(VERTICAL_LABELS, exercise.verticalRange) &&
    Object.hasOwn(ZONE_LABELS, exercise.workZone) &&
    Object.hasOwn(SIZE_LABELS, exercise.targetSize) &&
    Number.isInteger(Number(exercise.durationSeconds)) &&
    Number(exercise.durationSeconds) >= 15 && Number(exercise.durationSeconds) <= 600);
}

function normalizeExercise(exercise) {
  return {
    horizontalRange: exercise.horizontalRange,
    verticalRange: exercise.verticalRange,
    workZone: exercise.workZone,
    targetSize: exercise.targetSize,
    durationSeconds: Number(exercise.durationSeconds)
  };
}

function renderExercise(exercise) {
  const values = [
    ["Duración", formatDuration(exercise.durationSeconds)],
    ["Zona", ZONE_LABELS[exercise.workZone]],
    ["Alcance", `${RANGE_LABELS[exercise.horizontalRange]} · ${VERTICAL_LABELS[exercise.verticalRange]}`],
    ["Objetivos", SIZE_LABELS[exercise.targetSize]]
  ];
  ui.exerciseDetails.replaceChildren();
  for (const [label, value] of values) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    row.append(term, detail);
    ui.exerciseDetails.append(row);
  }
}

function renderAssignment() {
  const assignment = state.assignment;
  const exercise = assignment?.exercise;
  const ready = assignment?.status === "active" && isValidExercise(exercise);
  ui.assignmentLoading.hidden = true;
  ui.assignmentReady.hidden = !ready;
  ui.assignmentEmpty.hidden = ready;

  if (!ready) {
    ui.emptyCopy.textContent = state.bootstrap?.serverConfigured
      ? "Cuando tu profesional asigne una actividad a esta consola, aparecerá acá."
      : "Esta consola conserva la última actividad recibida. Cuando tenga conexión, volverá a consultar al servidor.";
    if (assignment?.status === "active") {
      ui.emptyCopy.textContent = "La actividad recibida no tiene una configuración que esta consola pueda ejecutar. Pedile a tu equipo que la revise.";
    }
    return;
  }

  state.exercise = normalizeExercise(exercise);
  ui.patientCode.textContent = assignment.patientCode || "Actividad asignada";
  renderExercise(state.exercise);
  const offline = state.bootstrap?.syncState === "error";
  setFeedback(ui.startFeedback, offline
    ? "Se usará la actividad guardada en esta consola. La sesión se sincronizará cuando vuelva internet."
    : "La consola guardará tu resultado al terminar.", offline ? "" : "success");
  ui.startButton.disabled = Boolean(state.pendingResult && !state.resultSaved);
}

function renderRecentSessions(sessions = []) {
  if (!sessions.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Las sesiones guardadas aparecerán acá.";
    ui.recentSessions.replaceChildren(empty);
    return;
  }

  ui.recentSessions.replaceChildren();
  for (const session of sessions.slice(0, 4)) {
    const row = document.createElement("article");
    row.className = "recent-row";
    const summary = document.createElement("div");
    const title = document.createElement("strong");
    const detail = document.createElement("span");
    const status = document.createElement("span");
    title.textContent = `${Number(session.hits) || 0} objetivos · ${formatDuration(session.elapsedSeconds || session.durationSeconds)}`;
    detail.textContent = formatDate(session.startedAt || session.createdAt);
    status.className = "session-status";
    status.textContent = SESSION_LABELS[session.syncStatus] || "Guardada";
    summary.append(title, detail);
    row.append(summary, status);
    ui.recentSessions.append(row);
  }
}

function renderStatus(status) {
  const syncState = status.syncState || "waiting";
  const localOnly = !status.serverConfigured;
  ui.syncStatus.textContent = localOnly ? "Pendiente de configurar" : (SYNC_LABELS[syncState] || "Estado desconocido");
  ui.pendingSessions.textContent = String(status.pendingSessions ?? 0);
  ui.lastSync.textContent = formatDate(status.lastSuccessfulSync);

  if (syncState === "error") setConnection("Consola local · sin conexión central", "error");
  else if (syncState === "attention") setConnection("Hay una sesión para revisar", "attention");
  else if (localOnly || syncState === "local") setConnection("Consola local en línea", "local");
  else if (syncState === "syncing") setConnection("Sincronizando", "checking");
  else setConnection("Consola en línea", "ready");
  if (status.lastSyncError) setFeedback(ui.syncFeedback, status.lastSyncError, "error");
}

async function loadDeviceView() {
  ui.refreshButton.disabled = true;
  ui.reloadButton.disabled = true;
  try {
    state.bootstrap = await requestJson("/api/local/bootstrap");
    state.assignment = state.bootstrap.assignment || null;
    renderAssignment();
    renderRecentSessions(state.bootstrap.recentSessions || []);
    renderStatus(state.bootstrap);
    if (state.bootstrap.lastSyncError) setFeedback(ui.syncFeedback, state.bootstrap.lastSyncError, "error");
    else setFeedback(ui.syncFeedback, "", "");
  } catch (error) {
    state.bootstrap = null;
    state.assignment = null;
    ui.assignmentLoading.hidden = true;
    ui.assignmentReady.hidden = true;
    ui.assignmentEmpty.hidden = false;
    ui.emptyCopy.textContent = "No se pudo consultar el servicio de esta consola. Revisá que esté encendido e intentá de nuevo.";
    renderRecentSessions([]);
    setConnection("Servicio local no disponible", "error");
    setFeedback(ui.syncFeedback, error.message || "No se pudo consultar el dispositivo.", "error");
  } finally {
    ui.refreshButton.disabled = false;
    ui.reloadButton.disabled = false;
  }
}

async function refreshStatus() {
  ui.refreshButton.disabled = true;
  try {
    const status = await requestJson("/api/local/status");
    renderStatus(status);
    if (status.lastSyncError) setFeedback(ui.syncFeedback, status.lastSyncError, "error");
  } catch (error) {
    setConnection("Servicio local no disponible", "error");
    setFeedback(ui.syncFeedback, error.message || "No se pudo consultar la consola.", "error");
  } finally {
    ui.refreshButton.disabled = false;
  }
}

async function ensureLandmarker() {
  if (state.landmarker) return state.landmarker;
  if (!state.landmarkerPromise) {
    state.landmarkerPromise = (async () => {
      const files = await FilesetResolver.forVisionTasks("/node_modules/@mediapipe/tasks-vision/wasm");
      return HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/assets/mediapipe/hand_landmarker.task", delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
    })();
  }
  state.landmarker = await state.landmarkerPromise;
  return state.landmarker;
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador no permite usar la cámara. Abrí Kinima desde la consola local.");
  }
  state.stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  });
  ui.camera.srcObject = state.stream;
  await ui.camera.play();
  await new Promise((resolve) => {
    if (ui.camera.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) resolve();
    else ui.camera.addEventListener("loadeddata", resolve, { once: true });
  });
}

function setNewTarget() {
  const exercise = state.exercise;
  const zones = {
    left: [0.08, 0.43], center: [0.29, 0.71], right: [0.57, 0.92], bilateral: [0.08, 0.92]
  };
  const rangeScale = { short: 0.55, medium: 0.78, wide: 1 }[exercise.horizontalRange];
  const [zoneMin, zoneMax] = zones[exercise.workZone];
  const zoneCenter = (zoneMin + zoneMax) / 2;
  const halfWidth = (zoneMax - zoneMin) * rangeScale / 2;
  const x = zoneCenter + (Math.random() * 2 - 1) * halfWidth;
  const vertical = { low: [0.5, 0.84], medium: [0.29, 0.84], high: [0.13, 0.84] }[exercise.verticalRange];
  const y = vertical[0] + Math.random() * (vertical[1] - vertical[0]);
  state.targetPosition = { x, y };
  ui.target.style.left = `${x * 100}%`;
  ui.target.style.top = `${y * 100}%`;
  ui.target.hidden = false;
}

function updateTimer(now = performance.now()) {
  if (!state.startedAtMs || state.ending) return;
  const durationMs = state.exercise.durationSeconds * 1000;
  const elapsedMs = Math.max(0, now - state.startedAtMs);
  const remaining = Math.max(0, (durationMs - elapsedMs) / 1000);
  ui.timer.textContent = formatClock(remaining);
  if (remaining <= 0) void finishGame(true);
}

function onHandResults(result, now) {
  const landmark = result.landmarks?.[0]?.[8];
  if (!landmark) {
    ui.pointer.hidden = true;
    ui.cameraMessage.hidden = false;
    ui.cameraMessage.textContent = "Mostrá una mano a la cámara";
    ui.gameHint.textContent = "Cuando la consola vea tu índice, vas a poder tocar los objetivos.";
    return;
  }

  const x = Math.max(0, Math.min(1, 1 - landmark.x));
  const y = Math.max(0, Math.min(1, landmark.y));
  ui.pointer.style.left = `${x * 100}%`;
  ui.pointer.style.top = `${y * 100}%`;
  ui.pointer.hidden = false;
  ui.cameraMessage.hidden = true;
  ui.gameHint.textContent = "¡Bien! Seguí la estrella con la punta de tu índice.";

  if (!state.targetPosition || ui.target.hidden) return;
  const rect = ui.gameStage.getBoundingClientRect();
  const dx = (x - state.targetPosition.x) * rect.width;
  const dy = (y - state.targetPosition.y) * rect.height;
  const hitRadius = ui.target.getBoundingClientRect().width * 0.5 + 17;
  const distance = Math.hypot(dx, dy);

  if (state.hitLocked && distance > hitRadius * 1.7) state.hitLocked = false;
  if (distance <= hitRadius && !state.hitLocked) {
    state.hitLocked = true;
    state.score += 1;
    ui.score.textContent = String(state.score);
    ui.target.hidden = true;
    ui.gameStage.classList.remove("target-hit");
    void ui.gameStage.offsetWidth;
    ui.gameStage.classList.add("target-hit");
    window.setTimeout(() => ui.gameStage.classList.remove("target-hit"), 280);
    window.setTimeout(() => {
      if (!state.ending) setNewTarget();
    }, 450);
  }
  updateTimer(now);
}

function gameFrame(now) {
  if (state.ending) return;
  if (now - state.lastFrameAt >= 32 && ui.camera.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && ui.camera.currentTime !== state.lastVideoTime) {
    state.lastFrameAt = now;
    state.lastVideoTime = ui.camera.currentTime;
    try {
      const result = state.landmarker.detectForVideo(ui.camera, now);
      onHandResults(result, now);
    } catch {
      ui.cameraMessage.hidden = false;
      ui.cameraMessage.textContent = "No pudimos leer el movimiento. Volvé a iniciar la actividad.";
    }
  }
  updateTimer(now);
  state.animationFrame = requestAnimationFrame(gameFrame);
}

function showScreen(name) {
  ui.homeScreen.hidden = name !== "home";
  ui.gameScreen.hidden = name !== "game";
  ui.resultScreen.hidden = name !== "result";
}

function closeCamera() {
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.animationFrame = 0;
  state.timerInterval = 0;
  if (state.stream) for (const track of state.stream.getTracks()) track.stop();
  state.stream = null;
  ui.camera.srcObject = null;
  ui.pointer.hidden = true;
  ui.target.hidden = true;
}

async function startGame() {
  if (!state.assignment || !isValidExercise(state.assignment.exercise) || state.pendingResult && !state.resultSaved) return;
  ui.startButton.disabled = true;
  setFeedback(ui.startFeedback, "Preparando cámara y detector…");
  try {
    await ensureLandmarker();
    await startCamera();
    state.exercise = normalizeExercise(state.assignment.exercise);
    state.startedAt = new Date().toISOString();
    state.startedAtMs = performance.now();
    state.score = 0;
    state.ending = false;
    state.hitLocked = false;
    state.lastVideoTime = -1;
    state.lastFrameAt = 0;
    ui.score.textContent = "0";
    ui.timer.textContent = formatClock(state.exercise.durationSeconds);
    ui.cameraMessage.hidden = false;
    ui.cameraMessage.textContent = "Mostrá una mano a la cámara";
    ui.target.dataset.size = state.exercise.targetSize;
    setNewTarget();
    showScreen("game");
    state.animationFrame = requestAnimationFrame(gameFrame);
  } catch (error) {
    closeCamera();
    showScreen("home");
    setFeedback(ui.startFeedback, error.message || "No se pudo iniciar la cámara.", "error");
    ui.startButton.disabled = false;
  }
}

async function saveResult() {
  if (!state.pendingResult || state.resultSaved) return;
  ui.retrySaveButton.disabled = true;
  setFeedback(ui.saveFeedback, "Guardando la sesión en esta consola…");
  try {
    const result = await requestJson("/api/local/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state.pendingResult)
    });
    state.resultSaved = true;
    ui.retrySaveButton.hidden = true;
    ui.homeButton.hidden = false;
    const detail = result.syncStatus === "local_only"
      ? "Quedó guardada en esta consola."
      : result.queued
        ? "Quedó guardada y se enviará al portal cuando haya conexión."
        : "Quedó guardada en esta consola.";
    setFeedback(ui.saveFeedback, detail, "success");
    await loadDeviceView();
  } catch (error) {
    ui.retrySaveButton.hidden = false;
    ui.homeButton.hidden = false;
    setFeedback(ui.saveFeedback, `${error.message || "No se pudo guardar la sesión."} Podés volver a intentarlo.`, "error");
  } finally {
    ui.retrySaveButton.disabled = false;
  }
}

async function finishGame(completed) {
  if (state.ending) return;
  state.ending = true;
  const durationSeconds = state.exercise.durationSeconds;
  const elapsed = Math.min(durationSeconds, Math.floor((performance.now() - state.startedAtMs) / 1000));
  const elapsedSeconds = completed ? durationSeconds : Math.max(1, elapsed);
  closeCamera();

  state.pendingResult = {
    id: crypto.randomUUID(),
    patientId: state.assignment.patientId,
    assignmentVersion: Number(state.assignment.version),
    startedAt: state.startedAt,
    durationSeconds,
    elapsedSeconds,
    hits: state.score,
    completed: Boolean(completed),
    configuration: state.exercise
  };
  state.resultSaved = false;
  ui.resultSummary.textContent = `Encontraste ${state.score} ${state.score === 1 ? "objetivo" : "objetivos"} en ${formatDuration(elapsedSeconds)}.`;
  ui.retrySaveButton.hidden = true;
  ui.homeButton.hidden = true;
  showScreen("result");
  await saveResult();
}

ui.startButton.addEventListener("click", () => void startGame());
ui.reloadButton.addEventListener("click", () => void loadDeviceView());
ui.refreshButton.addEventListener("click", () => void refreshStatus());
ui.syncButton.addEventListener("click", async () => {
  ui.syncButton.disabled = true;
  setFeedback(ui.syncFeedback, "Consultando el servidor central…");
  try {
    const result = await requestJson("/api/local/sync", { method: "POST" });
    await loadDeviceView();
    if (!result.configured) setFeedback(ui.syncFeedback, "El guardado local funciona. Falta configurar la conexión central.");
    else if (result.error) setFeedback(ui.syncFeedback, result.error, "error");
    else setFeedback(ui.syncFeedback, result.accepted
      ? `Sincronización lista · ${result.accepted} sesión(es) enviada(s).`
      : "Sincronización lista. No hay sesiones pendientes.", "success");
  } catch (error) {
    setFeedback(ui.syncFeedback, error.message || "No se pudo iniciar la sincronización.", "error");
  } finally {
    ui.syncButton.disabled = false;
  }
});
ui.finishButton.addEventListener("click", () => {
  if (window.confirm("¿Querés terminar esta actividad ahora?")) void finishGame(false);
});
ui.retrySaveButton.addEventListener("click", () => void saveResult());
ui.homeButton.addEventListener("click", async () => {
  if (!state.resultSaved) return;
  state.pendingResult = null;
  showScreen("home");
  await loadDeviceView();
});

void loadDeviceView();
