const video = document.getElementById("video");
const canvas = document.getElementById("playground");
const ctx = canvas.getContext("2d");

const startupOverlay = document.getElementById("startupOverlay");
const attractOverlay = document.getElementById("attractOverlay");
const cameraSelect = document.getElementById("cameraSelect");
const startExperienceBtn = document.getElementById("startExperienceBtn");
const installModeToggle = document.getElementById("installModeToggle");
const autoFullscreenToggle = document.getElementById("autoFullscreenToggle");
const hideUiToggle = document.getElementById("hideUiToggle");

const ui = document.getElementById("ui");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

const themeSelect = document.getElementById("themeSelect");
const modeSelect = document.getElementById("modeSelect");
const particleCountInput = document.getElementById("particleCount");
const particleCountValue = document.getElementById("particleCountValue");
const windStrengthInput = document.getElementById("windStrength");
const windStrengthValue = document.getElementById("windStrengthValue");
const burstSensitivityInput = document.getElementById("burstSensitivity");
const burstSensitivityValue = document.getElementById("burstSensitivityValue");
const trailsToggle = document.getElementById("trailsToggle");
const debugToggle = document.getElementById("debugToggle");
const mirrorToggle = document.getElementById("mirrorToggle");
const uiVisibleToggle = document.getElementById("uiVisibleToggle");
const nextPromptBtn = document.getElementById("nextPromptBtn");
const resetBtn = document.getElementById("resetBtn");
const promptText = document.getElementById("promptText");

let width = window.innerWidth;
let height = window.innerHeight;
let dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

let particles = [];
let pulses = [];
let lastBurstLeft = 0;
let lastBurstRight = 0;
let lastSeenBodyTime = 0;
let poseInstance = null;
let cameraController = null;
let currentStream = null;
let currentDeviceId = "";
let promptIndex = 0;

const config = {
  theme: "leaves",
  learningMode: "freeplay",
  particleCount: parseInt(particleCountInput.value, 10),
  windStrength: parseFloat(windStrengthInput.value),
  burstSensitivity: parseFloat(burstSensitivityInput.value),
  trails: trailsToggle.checked,
  debug: debugToggle.checked,
  mirror: mirrorToggle.checked,
  ambientWindX: 0.03,
  ambientWindY: -0.005,
  friction: 0.986,
  handRadius: 200,
  pulseRadius: 280,
  pulseForce: 6.2,
  burstCooldownMs: 260,
  installationMode: true,
  autoFullscreen: true,
  hideUiInInstallation: true,
  attractModeDelayMs: 5000
};

const prompts = {
  freeplay: [
    "Move your arms slowly and see what changes.",
    "Try making tiny breezes and giant gusts.",
    "Can you move the particles across the whole space?",
    "What happens when you use one hand versus two?"
  ],
  weather: [
    "Can you make a gentle breeze?",
    "Can you make a strong storm?",
    "What changes when you move faster?",
    "Which way are the particles traveling?",
    "Can you swirl the wind in a circle?"
  ],
  teamwork: [
    "Can two people work together to move everything to one side?",
    "Can one person make a breeze while another makes a storm?",
    "Can your team create a spinning swirl?",
    "Can you take turns making the room calm and wild?"
  ]
};

const poseState = {
  leftShoulder: null,
  rightShoulder: null,
  leftElbow: null,
  rightElbow: null,
  leftWrist: null,
  rightWrist: null
};

class HandEmitter {
  constructor(name) {
    this.name = name;
    this.x = width * 0.5;
    this.y = height * 0.5;
    this.px = this.x;
    this.py = this.y;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;
    this.visible = false;
    this.score = 0;
  }

  updateFromLandmark(landmark, visibility = 0) {
    if (!landmark || visibility < 0.3) {
      this.visible = false;
      this.speed *= 0.75;
      return;
    }

    this.visible = true;
    this.px = this.x;
    this.py = this.y;

    let mappedX = landmark.x * width;
    let mappedY = landmark.y * height;

    if (config.mirror) mappedX = width - mappedX;

    this.x = mappedX;
    this.y = mappedY;
    this.vx = this.x - this.px;
    this.vy = this.y - this.py;
    this.speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    this.score = visibility;
  }
}

const leftHand = new HandEmitter("left");
const rightHand = new HandEmitter("right");

function setStatus(text, mode = "normal") {
  statusText.textContent = text;
  statusDot.classList.remove("live", "error");
  if (mode === "live") statusDot.classList.add("live");
  if (mode === "error") statusDot.classList.add("error");
}

function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getThemeSettings(theme) {
  switch (theme) {
    case "fireflies":
      return {
        colors: ["#fff7b0", "#f8ff7a", "#ffd36e", "#fffce1"],
        sizeMin: 1.8,
        sizeMax: 4.6,
        speedMin: 0.05,
        speedMax: 0.45,
        alphaMin: 0.35,
        alphaMax: 0.95,
        shape: "glow"
      };
    case "dust":
      return {
        colors: ["#d7c2a3", "#c9b08d", "#e1d0b3", "#f0e2ca", "#b8936a"],
        sizeMin: 1.2,
        sizeMax: 5.2,
        speedMin: 0.08,
        speedMax: 0.7,
        alphaMin: 0.22,
        alphaMax: 0.7,
        shape: "dust"
      };
    case "confetti":
      return {
        colors: ["#ff6b6b", "#ffd93d", "#6bcBef", "#9d4edd", "#7bd389", "#ffffff"],
        sizeMin: 2.2,
        sizeMax: 7.5,
        speedMin: 0.1,
        speedMax: 1.2,
        alphaMin: 0.45,
        alphaMax: 1,
        shape: "rect"
      };
    case "leaves":
    default:
      return {
        colors: ["#7bd389", "#5aa469", "#d8f3dc", "#95d5b2", "#b7e4c7", "#caffbf"],
        sizeMin: 3,
        sizeMax: 10,
        speedMin: 0.08,
        speedMax: 0.9,
        alphaMin: 0.4,
        alphaMax: 0.95,
        shape: "leaf"
      };
  }
}

class Particle {
  constructor() {
    this.reset(true);
  }

  reset(initial = false) {
    const theme = getThemeSettings(config.theme);
    this.x = initial ? rand(0, width) : rand(-50, width + 50);
    this.y = initial ? rand(0, height) : rand(-50, height + 50);
    this.vx = rand(-0.3, 0.3);
    this.vy = rand(-0.3, 0.3);
    this.size = rand(theme.sizeMin, theme.sizeMax);
    this.color = pick(theme.colors);
    this.alpha = rand(theme.alphaMin, theme.alphaMax);
    this.rotation = rand(0, Math.PI * 2);
    this.rotationSpeed = rand(-0.03, 0.03);
    this.shape = theme.shape;
    this.floatPhase = rand(0, Math.PI * 2);
    this.speedFactor = rand(theme.speedMin, theme.speedMax);
  }

  applyHandWind(hand) {
    if (!hand.visible) return;

    const dx = this.x - hand.x;
    const dy = this.y - hand.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < config.handRadius && dist > 0.001) {
      const falloff = 1 - dist / config.handRadius;
      const motionBoost = clamp(hand.speed / 14, 0.4, 4.2);
      const power = falloff * config.windStrength * motionBoost;

      this.vx += hand.vx * 0.026 * power;
      this.vy += hand.vy * 0.026 * power;
      this.vx += (dx / dist) * 0.03 * power;
      this.vy += (dy / dist) * 0.03 * power;
    }
  }

  applyPulses() {
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pulse = pulses[i];
      const dx = this.x - pulse.x;
      const dy = this.y - pulse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < pulse.radius && dist > 0.001) {
        const force = (1 - dist / pulse.radius) * pulse.force;
        this.vx += (dx / dist) * force * 0.07;
        this.vy += (dy / dist) * force * 0.07;
      }
    }
  }

  update(time) {
    this.applyHandWind(leftHand);
    this.applyHandWind(rightHand);
    this.applyPulses();

    this.vx += config.ambientWindX * this.speedFactor * 0.02;
    this.vy += config.ambientWindY * this.speedFactor * 0.02;
    this.vy += Math.sin(time * 0.001 + this.floatPhase) * 0.002 * this.speedFactor;
    this.vx += Math.cos(time * 0.0007 + this.floatPhase) * 0.0015 * this.speedFactor;
    this.vx *= config.friction;
    this.vy *= config.friction;

    this.x += this.vx * 2.2;
    this.y += this.vy * 2.2;
    this.rotation += this.rotationSpeed;

    if (this.x < -80) this.x = width + 80;
    if (this.x > width + 80) this.x = -80;
    if (this.y < -80) this.y = height + 80;
    if (this.y > height + 80) this.y = -80;
  }

  drawLeaf() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(0, -this.size);
    ctx.quadraticCurveTo(this.size * 0.9, -this.size * 0.3, this.size * 0.45, this.size);
    ctx.quadraticCurveTo(0, this.size * 0.55, -this.size * 0.45, this.size);
    ctx.quadraticCurveTo(-this.size * 0.9, -this.size * 0.3, 0, -this.size);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -this.size * 0.8);
    ctx.lineTo(0, this.size * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  drawRect() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.size * 0.5, -this.size * 0.5, this.size, this.size * 1.4);
    ctx.restore();
  }

  drawGlow() {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    const glowRadius = this.size * 4;
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowRadius);
    grad.addColorStop(0, this.color);
    grad.addColorStop(0.28, this.color + "88");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawDust() {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  draw() {
    if (this.shape === "leaf") this.drawLeaf();
    else if (this.shape === "rect") this.drawRect();
    else if (this.shape === "glow") this.drawGlow();
    else this.drawDust();
  }
}

class Pulse {
  constructor(x, y, strength = 1) {
    this.x = x;
    this.y = y;
    this.life = 1;
    this.radius = config.pulseRadius * clamp(strength, 0.8, 1.5);
    this.force = config.pulseForce * clamp(strength, 0.8, 1.7);
    this.visualRadius = 10;
  }

  update() {
    this.life -= 0.022;
    this.visualRadius += 14;
  }

  draw() {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.life * 0.34;
    ctx.strokeStyle = "rgba(255,255,255,0.88)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.visualRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  get dead() {
    return this.life <= 0;
  }
}

function buildParticles() {
  particles = [];
  for (let i = 0; i < config.particleCount; i++) {
    particles.push(new Particle());
  }
}

function resetScene() {
  pulses = [];
  buildParticles();
}

function addPulse(x, y, strength = 1) {
  pulses.push(new Pulse(x, y, strength));
}

function tryBurstFromHand(hand, side, now) {
  if (!hand.visible) return;

  if (hand.speed > config.burstSensitivity) {
    if (side === "left" && now - lastBurstLeft > config.burstCooldownMs) {
      addPulse(hand.x, hand.y, clamp(hand.speed / 18, 1, 1.6));
      lastBurstLeft = now;
    }
    if (side === "right" && now - lastBurstRight > config.burstCooldownMs) {
      addPulse(hand.x, hand.y, clamp(hand.speed / 18, 1, 1.6));
      lastBurstRight = now;
    }
  }
}

function drawEmitterGlow(hand, color) {
  if (!hand.visible) return;

  const radius = clamp(24 + hand.speed * 2.2, 24, 95);
  const grad = ctx.createRadialGradient(hand.x, hand.y, 0, hand.x, hand.y, radius);
  grad.addColorStop(0, color);
  grad.addColorStop(0.25, color.replace("1)", "0.35)"));
  grad.addColorStop(1, "rgba(255,255,255,0)");

  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(hand.x, hand.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBackgroundGlow() {
  const focusX = (leftHand.visible && rightHand.visible)
    ? (leftHand.x + rightHand.x) * 0.5
    : leftHand.visible ? leftHand.x : rightHand.visible ? rightHand.x : width * 0.5;

  const focusY = (leftHand.visible && rightHand.visible)
    ? (leftHand.y + rightHand.y) * 0.5
    : leftHand.visible ? leftHand.y : rightHand.visible ? rightHand.y : height * 0.45;

  const grad = ctx.createRadialGradient(focusX, focusY, 0, focusX, focusY, 320);
  grad.addColorStop(0, "rgba(255,255,255,0.05)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(focusX, focusY, 320, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAttractMotion(time) {
  const cx = width * 0.5 + Math.cos(time * 0.0006) * width * 0.18;
  const cy = height * 0.5 + Math.sin(time * 0.0009) * height * 0.12;

  addSoftForce(cx, cy, Math.cos(time * 0.005) * 2.5, Math.sin(time * 0.004) * 2.5);
}

function addSoftForce(x, y, vx, vy) {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const dx = p.x - x;
    const dy = p.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 220 && dist > 0.001) {
      const falloff = 1 - dist / 220;
      p.vx += vx * 0.01 * falloff;
      p.vy += vy * 0.01 * falloff;
    }
  }
}

function drawDebugSkeleton() {
  if (!config.debug) return;

  const points = [
    poseState.leftShoulder, poseState.rightShoulder,
    poseState.leftElbow, poseState.rightElbow,
    poseState.leftWrist, poseState.rightWrist
  ].filter(Boolean);

  ctx.save();
  ctx.strokeStyle = "rgba(120, 220, 255, 0.9)";
  ctx.lineWidth = 3;
  drawSegment(poseState.leftShoulder, poseState.leftElbow);
  drawSegment(poseState.leftElbow, poseState.leftWrist);
  drawSegment(poseState.rightShoulder, poseState.rightElbow);
  drawSegment(poseState.rightElbow, poseState.rightWrist);
  drawSegment(poseState.leftShoulder, poseState.rightShoulder);

  for (const p of points) {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSegment(a, b) {
  if (!a || !b) return;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function mapLandmark(landmark) {
  if (!landmark) return null;
  let x = landmark.x * width;
  const y = landmark.y * height;
  if (config.mirror) x = width - x;
  return { x, y, visibility: landmark.visibility ?? 0 };
}

function onPoseResults(results) {
  const lm = results.poseLandmarks;

  if (!lm || !lm.length) {
    leftHand.visible = false;
    rightHand.visible = false;
    setStatus("No body detected. Step into view.");
    return;
  }

  lastSeenBodyTime = performance.now();
  setStatus("Body tracking live", "live");

  poseState.leftShoulder = mapLandmark(lm[11]);
  poseState.rightShoulder = mapLandmark(lm[12]);
  poseState.leftElbow = mapLandmark(lm[13]);
  poseState.rightElbow = mapLandmark(lm[14]);
  poseState.leftWrist = mapLandmark(lm[15]);
  poseState.rightWrist = mapLandmark(lm[16]);

  leftHand.updateFromLandmark(lm[15], lm[15]?.visibility ?? 0);
  rightHand.updateFromLandmark(lm[16], lm[16]?.visibility ?? 0);
}

function animate(timestamp) {
  const now = performance.now();

  if (!config.trails) {
    ctx.clearRect(0, 0, width, height);
  } else {
    ctx.fillStyle = "rgba(4, 10, 15, 0.16)";
    ctx.fillRect(0, 0, width, height);
  }

  drawBackgroundGlow();

  const bodyActiveRecently = now - lastSeenBodyTime < config.attractModeDelayMs;

  if (!bodyActiveRecently && config.installationMode) {
    drawAttractMotion(timestamp || 0);
    attractOverlay.classList.add("visible");
    attractOverlay.classList.remove("hidden");
  } else {
    attractOverlay.classList.remove("visible");
    attractOverlay.classList.add("hidden");
  }

  for (let i = 0; i < particles.length; i++) {
    particles[i].update(timestamp || 0);
    particles[i].draw();
  }

  if (bodyActiveRecently) {
    tryBurstFromHand(leftHand, "left", now);
    tryBurstFromHand(rightHand, "right", now);
  }

  for (let i = pulses.length - 1; i >= 0; i--) {
    pulses[i].update();
    pulses[i].draw();
    if (pulses[i].dead) pulses.splice(i, 1);
  }

  drawEmitterGlow(leftHand, "rgba(122, 211, 137, 1)");
  drawEmitterGlow(rightHand, "rgba(107, 203, 239, 1)");
  drawDebugSkeleton();

  requestAnimationFrame(animate);
}

async function loadCameraOptions() {
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    tempStream.getTracks().forEach(track => track.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");

    cameraSelect.innerHTML = "";

    if (!cams.length) {
      cameraSelect.innerHTML = `<option value="">No cameras found</option>`;
      return;
    }

    cams.forEach((cam, index) => {
      const option = document.createElement("option");
      option.value = cam.deviceId;
      option.textContent = cam.label || `Camera ${index + 1}`;
      cameraSelect.appendChild(option);
    });

    currentDeviceId = cameraSelect.value;
  } catch (err) {
    console.error(err);
    cameraSelect.innerHTML = `<option value="">Camera access needed</option>`;
  }
}

async function stopCurrentCamera() {
  if (cameraController && typeof cameraController.stop === "function") {
    try { cameraController.stop(); } catch (e) {}
  }
  cameraController = null;

  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }

  video.srcObject = null;
}

async function startPoseWithSelectedCamera(deviceId) {
  try {
    await stopCurrentCamera();
    setStatus("Starting selected camera...");

    currentStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    video.srcObject = currentStream;
    await video.play();

    if (!poseInstance) {
      poseInstance = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
      });

      poseInstance.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      poseInstance.onResults(onPoseResults);
    }

    cameraController = new Camera(video, {
      onFrame: async () => {
        if (poseInstance) {
          await poseInstance.send({ image: video });
        }
      },
      width: 1280,
      height: 720
    });

    cameraController.start();
    setStatus("Camera started. Looking for body...");
    lastSeenBodyTime = 0;
  } catch (err) {
    console.error(err);
    setStatus("Camera failed. Check permissions and selected device.", "error");
  }
}

function updatePrompt() {
  const list = prompts[config.learningMode] || prompts.freeplay;
  promptText.textContent = list[promptIndex % list.length];
}

function nextPrompt() {
  promptIndex += 1;
  updatePrompt();
}

function applyInstallationSettings() {
  config.installationMode = installModeToggle.checked;
  config.autoFullscreen = autoFullscreenToggle.checked;
  config.hideUiInInstallation = hideUiToggle.checked;

  if (config.installationMode && config.hideUiInInstallation) {
    ui.classList.add("hidden");
  } else {
    ui.classList.remove("hidden");
  }
}

async function enterFullscreenMaybe() {
  if (!config.autoFullscreen) return;
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    }
  } catch (err) {
    console.warn("Fullscreen was not entered automatically.", err);
  }
}

async function startExperience() {
  applyInstallationSettings();

  currentDeviceId = cameraSelect.value;
  await startPoseWithSelectedCamera(currentDeviceId);
  await enterFullscreenMaybe();

  startupOverlay.classList.remove("visible");
  startupOverlay.classList.add("hidden");
}

themeSelect.addEventListener("change", () => {
  config.theme = themeSelect.value;
  resetScene();
});

modeSelect.addEventListener("change", () => {
  config.learningMode = modeSelect.value;
  promptIndex = 0;
  updatePrompt();
});

particleCountInput.addEventListener("input", () => {
  config.particleCount = parseInt(particleCountInput.value, 10);
  particleCountValue.textContent = config.particleCount;
  buildParticles();
});

windStrengthInput.addEventListener("input", () => {
  config.windStrength = parseFloat(windStrengthInput.value);
  windStrengthValue.textContent = config.windStrength.toFixed(1);
});

burstSensitivityInput.addEventListener("input", () => {
  config.burstSensitivity = parseFloat(burstSensitivityInput.value);
  burstSensitivityValue.textContent = config.burstSensitivity.toFixed(0);
});

trailsToggle.addEventListener("change", () => {
  config.trails = trailsToggle.checked;
});

debugToggle.addEventListener("change", () => {
  config.debug = debugToggle.checked;
});

mirrorToggle.addEventListener("change", () => {
  config.mirror = mirrorToggle.checked;
});

uiVisibleToggle.addEventListener("change", () => {
  if (uiVisibleToggle.checked) ui.classList.remove("hidden");
  else ui.classList.add("hidden");
});

nextPromptBtn.addEventListener("click", nextPrompt);

resetBtn.addEventListener("click", () => {
  resetScene();
});

cameraSelect.addEventListener("change", async () => {
  currentDeviceId = cameraSelect.value;
  if (!startupOverlay.classList.contains("hidden")) return;
  await startPoseWithSelectedCamera(currentDeviceId);
});

startExperienceBtn.addEventListener("click", startExperience);

window.addEventListener("resize", () => {
  resizeCanvas();
  resetScene();
});

resizeCanvas();
buildParticles();
updatePrompt();
requestAnimationFrame(animate);
loadCameraOptions();
