import { createSessionId, deleteLocalSetting, deleteSession, getLocalSetting, initializeLocalStore, listSessions, saveSession, setLocalSetting } from "./local-store.js";
const MODULE_URL = "./node_modules/@mediapipe/tasks-vision/vision_bundle.mjs";
const WASM_URL = "./node_modules/@mediapipe/tasks-vision/wasm";
const MODEL_URL = "./assets/mediapipe/hand_landmarker.task";

const DEFAULT_CONFIG = {
  horizontal: "medio",
  vertical: "medio",
  zone: "bilateral",
  target: "medio",
  duration: 30
};
const config = { ...DEFAULT_CONFIG };

const labels = {
  horizontal: { corto: "corto", medio: "medio", amplio: "amplio" },
  vertical: { bajo: "bajo", medio: "medio", alto: "alto" },
  zone: {
    izquierda: "izquierda",
    centro: "centro",
    derecha: "derecha",
    bilateral: "bilateral"
  },
  target: { grande: "grande", medio: "mediano", pequeno: "pequeño" }
};

const screens = {
  config: document.querySelector("#screen-config"),
  game: document.querySelector("#screen-game"),
  results: document.querySelector("#screen-results")
};

const startButton = document.querySelector("#btn-start");
const startStatus = document.querySelector("#start-status");
const video = document.querySelector("#camera-video");
const canvas = document.querySelector("#game-canvas");
const stage = document.querySelector("#camera-stage");
const context = canvas.getContext("2d");
const gameNotice = document.querySelector("#game-notice");

let handLandmarker = null;
let detectorPromise = null;
let cameraStream = null;
let animationFrameId = 0;
let lastVideoTime = -1;
let lastDetectionAt = 0;
let lastSeenAt = 0;
let lastTimestamp = 0;
let currentTarget = null;
let previousTarget = null;
let fingertip = null;
let indexChain = null;
let score = 0;
let sessionStartedAt = 0;
let sessionEndsAt = 0;
let activeDuration = 30;
let mode = "ready";
let noticeText = "";
let storedSessions = [];
let localDeviceId = "";
let deviceServiceAvailable = false;
let deviceProductionMode = false;
let deviceServiceRequired = false;
let activeAssignment = null;
let sessionStartedIso = "";

function setScreen(name) {
  Object.entries(screens).forEach(([screenName, element]) => {
    element.classList.toggle("is-active", screenName === name);
  });
}

function updateConfigSummary() {
  const summary = "Alcance " + labels.horizontal[config.horizontal] +
    " · altura " + labels.vertical[config.vertical] +
    " · zona " + labels.zone[config.zone] +
    " · objetivo " + labels.target[config.target] +
    " · " + config.duration + " segundos.";
  document.querySelector("#config-summary").textContent = summary;
}

function updateGameConfigLabel() {
  document.querySelector("#game-zone-label").textContent =
    "Zona " + labels.zone[config.zone] +
    " · alcance " + labels.horizontal[config.horizontal] +
    " · altura " + labels.vertical[config.vertical];
}

document.querySelectorAll("[data-setting]").forEach((button) => {
  button.addEventListener("click", () => {
    const setting = button.dataset.setting;
    const value = button.dataset.value;
    config[setting] = setting === "duration" ? Number(value) : value;

    document.querySelectorAll('[data-setting="' + setting + '"]').forEach((option) => {
      const selected = option === button;
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });

    updateConfigSummary();
  });
});



function renderHistory() {
  const list = document.querySelector("#history-list");
  const count = document.querySelector("#history-count");
  count.textContent = String(storedSessions.length);
  list.replaceChildren();

  if (storedSessions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-history";
    empty.textContent = "Tus resultados guardados aparecerán acá.";
    list.append(empty);
    return;
  }

  storedSessions.slice(0, 3).forEach((session) => {
    const row = document.createElement("div");
    row.className = "history-row";

    const date = document.createElement("span");
    date.className = "history-date";
    date.textContent = formatDate(session.createdAt);

    const result = document.createElement("span");
    result.className = "history-result";
    result.textContent = session.hits + " aciertos · " + session.elapsedSeconds + " s";

    row.append(date, result);
    list.append(row);
  });
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sesión anterior";
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

async function ensureCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Este navegador no permite usar la cámara en este contexto. Abrí el proyecto desde localhost.");
  }

  if (cameraStream && cameraStream.active) return;

  cameraStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  });

  video.srcObject = cameraStream;
  await video.play();
  await waitForVideoMetadata();
}

function waitForVideoMetadata() {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("La cámara no entregó una imagen. Revisá que no esté siendo usada por otra aplicación."));
    }, 10000);

    function onLoaded() {
      cleanup();
      resolve();
    }

    function cleanup() {
      window.clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onLoaded);
    }

    video.addEventListener("loadedmetadata", onLoaded, { once: true });
  });
}

async function ensureDetector() {
  if (handLandmarker) return handLandmarker;
  if (detectorPromise) return detectorPromise;

  detectorPromise = (async () => {
    const visionModule = await import(MODULE_URL);
    const vision = await visionModule.FilesetResolver.forVisionTasks(WASM_URL);
    return visionModule.HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.5
    });
  })();

  try {
    handLandmarker = await detectorPromise;
    return handLandmarker;
  } catch (error) {
    detectorPromise = null;
    throw error;
  }
}

function explainCameraError(error) {
  if (error && error.name === "NotAllowedError") {
    return "No se habilitó la cámara. Permití el acceso desde el ícono junto a la dirección del navegador y volvé a intentarlo.";
  }
  if (error && error.name === "NotFoundError") {
    return "No se encontró una cámara disponible en este equipo.";
  }
  if (error && error.name === "NotReadableError") {
    return "La cámara está ocupada por otra aplicación. Cerrala y probá de nuevo.";
  }
  if (error && /fetch|network|download|wasm/i.test(error.message || "")) {
    return "No se pudieron cargar los recursos locales de MediaPipe. Confirmá que la instalación esté completa y recargá la aplicación.";
  }
  if (error && error.message) return error.message;
  return "No se pudo iniciar el ejercicio. Revisá los recursos locales y el permiso de cámara.";
}

async function beginSession() {
  if (deviceProductionMode && !activeAssignment) {
    startStatus.textContent = "Esta consola no tiene una asignación activa. El profesional debe asignar un paciente y ejercicio.";
    startStatus.classList.add("is-error");
    startButton.disabled = true;
    return;
  }
  startButton.disabled = true;
  startStatus.classList.remove("is-error");
  startStatus.textContent = "";
  mode = "loading";
  setScreen("game");
  setGameNotice("Solicitando acceso a la cámara…");

  try {
    await ensureCamera();
    setGameNotice("Cargando el detector de mano…");
    await ensureDetector();
    syncCanvasSize();
    updateGameConfigLabel();
    score = 0;
    document.querySelector("#score").textContent = "0";
    activeDuration = config.duration;
    sessionStartedAt = performance.now();
    sessionStartedIso = new Date().toISOString();
    sessionEndsAt = sessionStartedAt + activeDuration * 1000;
    previousTarget = null;
    currentTarget = createTarget();
    previousTarget = currentTarget;
    fingertip = null;
    indexChain = null;
    lastSeenAt = 0;
    lastVideoTime = -1;
    lastDetectionAt = 0;
    lastTimestamp = 0;
    mode = "playing";
    setGameNotice("Mostrá una mano frente a la cámara.");
    animationFrameId = requestAnimationFrame(renderFrame);
  } catch (error) {
    mode = "ready";
    stopCamera();
    setScreen("config");
    startStatus.textContent = explainCameraError(error);
    startStatus.classList.add("is-error");
    startButton.disabled = false;
  }
}

function syncCanvasSize() {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  stage.style.aspectRatio = width + " / " + height;
}

function getTargetBounds() {
  const zones = {
    izquierda: [0.06, 0.43],
    centro: [0.28, 0.72],
    derecha: [0.57, 0.94],
    bilateral: [0.06, 0.94]
  };
  const horizontalScale = { corto: 0.38, medio: 0.68, amplio: 1 }[config.horizontal];
  const verticalScale = { bajo: 0.42, medio: 0.72, alto: 1 }[config.vertical];
  const zone = zones[config.zone];
  const centerX = (zone[0] + zone[1]) / 2;
  const halfX = ((zone[1] - zone[0]) * horizontalScale) / 2;
  const halfY = (0.42 * verticalScale);
  return {
    minX: Math.max(0.04, centerX - halfX),
    maxX: Math.min(0.96, centerX + halfX),
    minY: Math.max(0.06, 0.5 - halfY),
    maxY: Math.min(0.94, 0.5 + halfY)
  };
}

function createTarget() {
  const width = canvas.width || 1280;
  const height = canvas.height || 720;
  const margin = Math.min(width, height) * 0.095;
  const bounds = getTargetBounds();
  const left = Math.max(margin, bounds.minX * width);
  const right = Math.min(width - margin, bounds.maxX * width);
  const top = Math.max(margin, bounds.minY * height);
  const bottom = Math.min(height - margin, bounds.maxY * height);
  const radiusScale = { grande: 0.075, medio: 0.052, pequeno: 0.034 }[config.target];
  const target = {
    x: left + Math.random() * Math.max(1, right - left),
    y: top + Math.random() * Math.max(1, bottom - top),
    radius: Math.min(width, height) * radiusScale
  };

  if (previousTarget) {
    const minimumDistance = target.radius * 2.7;
    let attempts = 0;
    while (attempts < 8 && Math.hypot(target.x - previousTarget.x, target.y - previousTarget.y) < minimumDistance) {
      target.x = left + Math.random() * Math.max(1, right - left);
      target.y = top + Math.random() * Math.max(1, bottom - top);
      attempts += 1;
    }
  }

  return target;
}

function setGameNotice(value) {
  if (noticeText === value) return;
  noticeText = value;
  gameNotice.textContent = value;
}

function renderFrame(now) {
  if (mode !== "playing") return;
  animationFrameId = requestAnimationFrame(renderFrame);

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime &&
      now - lastDetectionAt >= 30) {
    lastVideoTime = video.currentTime;
    lastDetectionAt = now;
    const timestamp = Math.max(now, lastTimestamp + 1);
    lastTimestamp = timestamp;
    try {
      const result = handLandmarker.detectForVideo(video, timestamp);
      updateHand(result, now);
    } catch (error) {
      setGameNotice("El detector tuvo un problema. Finalizá y volvé a iniciar el ejercicio.");
      console.error("Kinima hand tracking error:", error);
    }
  }

  if (now >= sessionEndsAt) {
    void finishSession(true);
    return;
  }

  updateTimer(now);
  drawFrame(now);
}

function updateHand(result, now) {
  const landmarks = result.landmarks && result.landmarks[0];
  if (landmarks && landmarks[8]) {
    const tip = landmarks[8];
    const point = { x: tip.x * canvas.width, y: tip.y * canvas.height };
    if (fingertip) {
      point.x = fingertip.x * 0.56 + point.x * 0.44;
      point.y = fingertip.y * 0.56 + point.y * 0.44;
    }
    fingertip = point;
    indexChain = [landmarks[5], landmarks[6], landmarks[7], landmarks[8]].map((landmark) => ({
      x: landmark.x * canvas.width,
      y: landmark.y * canvas.height
    }));
    lastSeenAt = now;
    setGameNotice("Seguí el objetivo con la punta del índice.");

    if (currentTarget) {
      const distance = Math.hypot(fingertip.x - currentTarget.x, fingertip.y - currentTarget.y);
      if (distance <= currentTarget.radius * 0.82) {
        score += 1;
        document.querySelector("#score").textContent = String(score);
        previousTarget = currentTarget;
        currentTarget = createTarget();
        setGameNotice("¡Muy bien! Buscá el siguiente objetivo.");
      }
    }
  } else if (now - lastSeenAt > 140) {
    fingertip = null;
    indexChain = null;
    setGameNotice("Mostrá una mano frente a la cámara.");
  }
}

function updateTimer(now) {
  const remaining = Math.max(0, Math.ceil((sessionEndsAt - now) / 1000));
  document.querySelector("#time-left").textContent = String(remaining);
  const progress = Math.max(0, (sessionEndsAt - now) / (activeDuration * 1000));
  document.querySelector("#timer-bar").style.transform = "scaleX(" + progress + ")";
}

function drawFrame(now) {
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  if (currentTarget) drawTarget(now);
  if (indexChain && fingertip) drawTrackedIndex();
}

function drawTarget(now) {
  const pulse = 1 + Math.sin(now / 170) * 0.045;
  const radius = currentTarget.radius * pulse;
  const { x, y } = currentTarget;

  const glow = context.createRadialGradient(x, y, radius * 0.25, x, y, radius * 2.35);
  glow.addColorStop(0, "rgba(85, 189, 181, 0.3)");
  glow.addColorStop(1, "rgba(85, 189, 181, 0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(x, y, radius * 2.35, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(183, 235, 228, 0.72)";
  context.lineWidth = Math.max(2, radius * 0.075);
  context.beginPath();
  context.arc(x, y, radius * 0.8, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = "#55BDB5";
  context.strokeStyle = "#D9F5F0";
  context.lineWidth = Math.max(2, radius * 0.09);
  drawStarPath(x, y, radius * 0.71, radius * 0.4, 5);
  context.fill();
  context.stroke();

  context.fillStyle = "rgba(255, 255, 255, 0.96)";
  context.beginPath();
  context.arc(x, y, Math.max(2, radius * 0.105), 0, Math.PI * 2);
  context.fill();
}

function drawStarPath(x, y, outerRadius, innerRadius, points) {
  context.beginPath();
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI * index) / points - Math.PI / 2;
    const pointX = x + Math.cos(angle) * radius;
    const pointY = y + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  }
  context.closePath();
}

function drawTrackedIndex() {
  context.beginPath();
  context.moveTo(indexChain[0].x, indexChain[0].y);
  for (let index = 1; index < indexChain.length; index += 1) {
    context.lineTo(indexChain[index].x, indexChain[index].y);
  }
  context.strokeStyle = "rgba(239, 139, 118, 0.95)";
  context.lineWidth = Math.max(3, canvas.width * 0.0045);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();

  const radius = Math.max(9, canvas.width * 0.013);
  context.fillStyle = "rgba(239, 139, 118, 0.25)";
  context.beginPath();
  context.arc(fingertip.x, fingertip.y, radius * 1.8, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#FFF7F2";
  context.strokeStyle = "#EF8B76";
  context.lineWidth = Math.max(3, canvas.width * 0.0035);
  context.beginPath();
  context.arc(fingertip.x, fingertip.y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

async function finishSession(completed) {
  if (mode !== "playing") return;
  mode = "finished";
  cancelAnimationFrame(animationFrameId);
  const elapsedSeconds = Math.min(activeDuration, Math.max(1, Math.round((performance.now() - sessionStartedAt) / 1000)));
  const createdAt = new Date().toISOString();
  const sessionConfig = { ...config };
  const session = {
    id: createSessionId(),
    deviceId: localDeviceId,
    patientId: activeAssignment?.patientId || null,
    assignmentVersion: activeAssignment?.version ?? null,
    startedAt: sessionStartedIso || createdAt,
    createdAt,
    hits: score,
    elapsedSeconds,
    durationSeconds: activeDuration,
    completed,
    config: sessionConfig,
    syncStatus: "pending"
  };
  let saved = false;
  try {
    if (deviceServiceAvailable) {
      await queueSessionOnDevice(session);
      saved = true;
      storedSessions = await loadDeviceHistory();
    } else if (!deviceProductionMode) {
      await saveSession(session);
      saved = true;
      storedSessions = await listSessions();
    } else {
      throw new Error("El almacenamiento cifrado de la consola no está disponible.");
    }
  } catch (error) {
    console.error("Kinima could not save this session locally:", error);
  }
  renderHistory();
  updateSyncStatus();
  stopCamera();
  context.clearRect(0, 0, canvas.width, canvas.height);

  document.querySelector("#results-title").textContent = score > 0 ? "¡Buen trabajo!" : "¡Sesión completada!";
  document.querySelector("#results-subtitle").textContent = completed
    ? "Terminaste el tiempo de ejercicio."
    : "Gracias por completar este ejercicio.";
  document.querySelector("#final-score").textContent = String(score);
  document.querySelector("#final-duration").textContent = String(elapsedSeconds);
  document.querySelector("#final-config").textContent =
    "Alcance " + labels.horizontal[sessionConfig.horizontal] +
    " · altura " + labels.vertical[sessionConfig.vertical] +
    " · zona " + labels.zone[sessionConfig.zone] +
    " · objetivo " + labels.target[sessionConfig.target] +
    " · " + sessionConfig.duration + " segundos";
  document.querySelector(".saved-note").innerHTML = saved
    ? '<span aria-hidden="true">✓</span> Resultado guardado en este dispositivo'
    : '<span aria-hidden="true">!</span> No se pudo guardar en este navegador';
  setScreen("results");
  startButton.disabled = false;
}

function stopCamera() {
  cancelAnimationFrame(animationFrameId);
  animationFrameId = 0;
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  video.pause();
  video.srcObject = null;
}

startButton.addEventListener("click", beginSession);
document.querySelector("#btn-finish").addEventListener("click", () => void finishSession(false));
document.querySelector("#btn-again").addEventListener("click", () => {
  setScreen("config");
  mode = "ready";
  const needsAssignment = deviceProductionMode && !activeAssignment;
  startStatus.textContent = needsAssignment
    ? "Esta consola no tiene una asignación activa. El profesional debe asignar un paciente y ejercicio."
    : "";
  startStatus.classList.toggle("is-error", needsAssignment);
  startButton.disabled = needsAssignment;
});

function setSyncLabel(label, { offline = false, error = false } = {}) {
  const element = document.querySelector("#sync-status");
  element.replaceChildren();
  const dot = document.createElement("span");
  dot.className = "status-dot";
  element.append(dot, document.createTextNode(" " + label));
  element.classList.toggle("is-offline", offline);
  element.classList.toggle("is-error", error);
}

async function queueSessionOnDevice(session) {
  const response = await fetch("/api/local/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(session),
    cache: "no-store"
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error?.message || "El servicio local no recibió la sesión.");
  }
}

async function loadDeviceHistory() {
  const response = await fetch("/api/local/history", { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo cargar el historial cifrado de la consola.");
  const result = await response.json();
  return Array.isArray(result.sessions) ? result.sessions : [];
}

async function flushBrowserOutbox(sessions) {
  if (!deviceServiceAvailable) return;
  for (const session of sessions) {
    try {
      await queueSessionOnDevice(session);
      await deleteSession(session.id);
    } catch (error) {
      throw new Error("No se pudo trasladar el historial anterior al almacenamiento cifrado: " + error.message);
    }
  }
  storedSessions = await loadDeviceHistory();
}

async function refreshAssignmentIfChanged(status) {
  if (mode !== "ready" && mode !== "finished") return;
  const currentVersion = activeAssignment?.status === "active" ? Number(activeAssignment.version) : null;
  const currentPatientId = activeAssignment?.status === "active" ? activeAssignment.patientId : null;
  if (status.assignmentVersion === currentVersion && status.assignedPatientId === currentPatientId) return;

  const response = await fetch("/api/local/bootstrap", { cache: "no-store" });
  if (!response.ok) return;
  const bootstrap = await response.json();
  if (bootstrap.deviceId !== localDeviceId) return;
  const nextAssignment = bootstrap.assignment || null;
  const nextVersion = nextAssignment?.status === "active" ? Number(nextAssignment.version) : null;
  const nextPatientId = nextAssignment?.status === "active" ? nextAssignment.patientId : null;
  if (nextVersion === currentVersion && nextPatientId === currentPatientId) return;

  applyAssignedConfiguration(nextAssignment);
  storedSessions = await loadDeviceHistory();
  renderHistory();
}

function updateSyncStatus() {
  const browserPending = deviceServiceAvailable ? 0 : storedSessions.filter((session) => session.syncStatus === "pending").length;
  if (!deviceServiceAvailable) {
    setSyncLabel((navigator.onLine ? "Guardado local" : "Sin conexión") + " · " + browserPending + " pendiente" + (browserPending === 1 ? "" : "s") + " de sincronización", { offline: !navigator.onLine });
    return;
  }
  fetch("/api/local/status", { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error("Estado local no disponible.");
    return response.json();
  }).then(async (status) => {
    await refreshAssignmentIfChanged(status);
    const pending = Number(status.pendingSessions || 0) + browserPending;
    const attention = Number(status.attentionSessions || 0);
    const localOnly = Number(status.localOnlySessions || 0);
    let label;
    if (!status.serverConfigured) label = "Guardado en esta consola · " + pending + " pendiente" + (pending === 1 ? "" : "s");
    else if (status.syncState === "error") label = "Servidor no disponible" + (pending ? " · " + pending + " en cola local" : "") + (attention ? " · " + attention + " para revisar" : "");
    else if (status.syncState === "syncing") label = "Sincronizando · " + pending + " pendiente" + (pending === 1 ? "" : "s");
    else if (attention) label = "Revisar " + attention + " sesión" + (attention === 1 ? "" : "es");
    else if (pending) label = "En cola · " + pending + " pendiente" + (pending === 1 ? "" : "s") + " de envío";
    else if (localOnly) label = "Consola lista · " + localOnly + " sesión" + (localOnly === 1 ? "" : "es") + " guardada" + (localOnly === 1 ? "" : "s") + " sin asignación";
    else if (status.lastSuccessfulSync) label = "Sincronizado · " + formatDate(status.lastSuccessfulSync);
    else label = "Consola local lista";
    setSyncLabel(label, { offline: !navigator.onLine || status.syncState === "error", error: attention > 0 });
  }).catch(() => {
    setSyncLabel("Consola local · estado del servidor no disponible", { offline: true });
  });
}
const assignmentValues = {
  horizontalRange: { short: "corto", medium: "medio", wide: "amplio" },
  verticalRange: { low: "bajo", medium: "medio", high: "alto" },
  workZone: { left: "izquierda", center: "centro", right: "derecha", bilateral: "bilateral" },
  targetSize: { large: "grande", medium: "medio", small: "pequeno" }
};

function applyAssignedConfiguration(assignment) {
  const assigned = Boolean(assignment && assignment.status === "active" && assignment.exercise);
  activeAssignment = assigned ? assignment : null;
  if (assigned) {
    const exercise = assignment.exercise;
    config.horizontal = assignmentValues.horizontalRange[exercise.horizontalRange] || DEFAULT_CONFIG.horizontal;
    config.vertical = assignmentValues.verticalRange[exercise.verticalRange] || DEFAULT_CONFIG.vertical;
    config.zone = assignmentValues.workZone[exercise.workZone] || DEFAULT_CONFIG.zone;
    config.target = assignmentValues.targetSize[exercise.targetSize] || DEFAULT_CONFIG.target;
    config.duration = Number(exercise.durationSeconds) || DEFAULT_CONFIG.duration;
  } else {
    Object.assign(config, DEFAULT_CONFIG);
  }
  document.querySelectorAll("[data-setting]").forEach((button) => {
    button.disabled = assigned;
  });
  const needsAssignment = deviceProductionMode && !assigned;
  startButton.disabled = needsAssignment;
  startStatus.textContent = needsAssignment
    ? "Esta consola no tiene una asignación activa. El profesional debe asignar un paciente y ejercicio."
    : "";
  startStatus.classList.toggle("is-error", needsAssignment);

  for (const [setting, value] of Object.entries(config)) {
    document.querySelectorAll('[data-setting="' + setting + '"]').forEach((option) => {
      const selected = option.dataset.value === String(value);
      option.classList.toggle("is-selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
  }
  updateConfigSummary();
}

async function initializeApp() {
  const syncStatus = document.querySelector("#sync-status");
  startButton.disabled = true;
  try {
    let deviceBootstrap = null;
    try {
      const response = await fetch("/api/local/bootstrap", { cache: "no-store" });
      if (response.ok) deviceBootstrap = await response.json();
    } catch { /* En la computadora se puede ejecutar el modo de desarrollo sin el servicio de Raspberry. */ }

    deviceServiceAvailable = Boolean(deviceBootstrap?.secureLocalStore);
    deviceProductionMode = Boolean(deviceBootstrap?.production);
    deviceServiceRequired = deviceProductionMode || location.port === "4173";
    if (deviceServiceRequired && !deviceServiceAvailable) {
      throw new Error("El servicio local cifrado no está disponible. Reiniciá Kinima o pedí asistencia.");
    }

    if (deviceServiceAvailable) {
      localDeviceId = deviceBootstrap.deviceId;
      activeAssignment = deviceBootstrap.assignment || null;
      let browserSessions = [];
      try {
        const browserData = await initializeLocalStore();
        browserSessions = browserData.sessions;
        await deleteLocalSetting("activeAssignment");
      } catch (error) {
        console.warn("No se pudo revisar el historial anterior del navegador:", error.message);
      }
      await flushBrowserOutbox(browserSessions);
      storedSessions = await loadDeviceHistory();
    } else {
      const localData = await initializeLocalStore();
      localDeviceId = localData.deviceId;
      storedSessions = localData.sessions;
      activeAssignment = await getLocalSetting("activeAssignment");
      await setLocalSetting("deviceId", localDeviceId);
      await setLocalSetting("activeAssignment", activeAssignment);
    }

    applyAssignedConfiguration(activeAssignment);
    renderHistory();
    updateSyncStatus();
    startButton.disabled = deviceProductionMode && !activeAssignment;
  } catch (error) {
    syncStatus.innerHTML = '<span class="status-dot"></span> Almacenamiento local no disponible';
    syncStatus.classList.add("is-error");
    startButton.disabled = true;
    startStatus.textContent = error.message || "No se pudo preparar el almacenamiento local.";
    startStatus.classList.add("is-error");
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("No se pudo activar el modo sin conexión de Kinima:", error);
    });
  }
}

updateConfigSummary();
renderHistory();
void initializeApp();
window.addEventListener("online", () => {
  if (deviceServiceAvailable) void fetch("/api/local/sync", { method: "POST" }).catch(() => {}).finally(updateSyncStatus);
  else updateSyncStatus();
});
window.addEventListener("offline", updateSyncStatus);
window.setInterval(() => {
  if (deviceServiceAvailable) updateSyncStatus();
}, 30_000);

