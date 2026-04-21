const video = document.getElementById("video");
const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");

const startupOverlay = document.getElementById("startupOverlay");
const attractOverlay = document.getElementById("attractOverlay");
const kidPromptOverlay = document.getElementById("kidPromptOverlay");
const kidStepText = document.getElementById("kidStepText");
const kidPromptText = document.getElementById("kidPromptText");
const kidCoachText = document.getElementById("kidCoachText");

const cameraSelect = document.getElementById("cameraSelect");
const cameraSelectInline = document.getElementById("cameraSelectInline");
const startExperienceBtn = document.getElementById("startExperienceBtn");
const installModeToggle = document.getElementById("installModeToggle");
const autoFullscreenToggle = document.getElementById("autoFullscreenToggle");
const hideUiToggle = document.getElementById("hideUiToggle");

const ui = document.getElementById("ui");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const gardenThemeSelect = document.getElementById("gardenThemeSelect");
const difficultySelect = document.getElementById("difficultySelect");
const audioToggle = document.getElementById("audioToggle");
const debugToggle = document.getElementById("debugToggle");
const mirrorToggle = document.getElementById("mirrorToggle");
const uiVisibleToggle = document.getElementById("uiVisibleToggle");
const repeatPromptBtn = document.getElementById("repeatPromptBtn");
const resetBtn = document.getElementById("resetBtn");
const promptText = document.getElementById("promptText");
const stepText = document.getElementById("stepText");
const coachText = document.getElementById("coachText");

let width = window.innerWidth;
let height = window.innerHeight;
let dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

let poseInstance = null;
let cameraController = null;
let currentStream = null;
let currentDeviceId = "";
let lastSeenBodyTime = 0;
let lastSpokenTime = 0;

const config = {
  mirror: true,
  debug: false,
  installationMode: true,
  autoFullscreen: true,
  hideUiInInstallation: true,
  attractModeDelayMs: 5000,
  gardenTheme: "spring",
  difficulty: "guided",
  audio: true
};

const poseState = {
  leftShoulder: null,
  rightShoulder: null,
  leftElbow: null,
  rightElbow: null,
  leftWrist: null,
  rightWrist: null,
  leftHip: null,
  rightHip: null,
  leftKnee: null,
  rightKnee: null,
  nose: null
};

const gestureConfidence = {
  crouch: 0,
  grow: 0,
  handsUp: 0,
  sway: 0,
  still: 0
};

const actionState = {
  plantedPulse: 0,
  growEnergy: 0,
  sunEnergy: 0,
  rainEnergy: 0,
  stillness: 0,
  swayAmount: 0
};

const garden = {
  flowers: [],
  butterflies: [],
  raindrops: [],
  pollen: [],
  clouds: [],
  sunLevel: 0,
  skylineParallax: 0
};

const sequence = {
  step: 0,
  completed: false,
  waitingForNextStep: false,
  waitTimer: 0,
  steps: [
    {
      key: "plant",
      label: "Step 1 of 5",
      prompt: "Crouch down and plant a seed",
      operatorPrompt: "Can you crouch down and plant a seed?",
      simplified: "Bend down low",
      celebration: "You planted the seed!"
    },
    {
      key: "grow",
      label: "Step 2 of 5",
      prompt: "Stand tall and grow the flower",
      operatorPrompt: "Can you stand tall and help the flower grow?",
      simplified: "Stand up big and tall",
      celebration: "Your flower is growing!"
    },
    {
      key: "sun",
      label: "Step 3 of 5",
      prompt: "Raise both hands to wake the sun",
      operatorPrompt: "Can you raise both hands to wake the sun?",
      simplified: "Put both hands up high",
      celebration: "You woke the sun!"
    },
    {
      key: "rain",
      label: "Step 4 of 5",
      prompt: "Sway side to side to make rain",
      operatorPrompt: "Can you sway side to side to make a little rain?",
      simplified: "Move side to side",
      celebration: "You made the rain!"
    },
    {
      key: "still",
      label: "Step 5 of 5",
      prompt: "Freeze and wait for the butterfly",
      operatorPrompt: "Can you stay very still so the butterfly lands?",
      simplified: "Freeze like a statue",
      celebration: "The butterfly found your garden!"
    }
  ]
};

const smartCoach = {
  stuckFrames: 0,
  successFrames: 0,
  simplifiedMode: false,
  lastHintAt: 0,
  lastPraiseAt: 0
};

const timers = {
  plantHold: 0,
  growHold: 0,
  sunHold: 0,
  rainHold: 0,
  stillHold: 0,
  rainCooldown: 0
};

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

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function distance(a, b) {
  if (!a || !b) return 0;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function averagePoint(a, b) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

function mapLandmark(landmark) {
  if (!landmark) return null;
  let x = landmark.x * width;
  const y = landmark.y * height;
  if (config.mirror) x = width - x;
  return { x, y, visibility: landmark.visibility ?? 0 };
}

function speak(text, force = false) {
  if (!config.audio || !("speechSynthesis" in window)) return;
  const now = performance.now();
  if (!force && now - lastSpokenTime < 2600) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.85;
  utterance.pitch = 1.02;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
  lastSpokenTime = now;
}

function currentStep() {
  return sequence.steps[sequence.step];
}

function syncKidPrompt() {
  if (config.difficulty === "freeplay") {
    kidStepText.textContent = "Free Play";
    kidPromptText.textContent = "Grow the garden your way";
    kidCoachText.textContent = "Crouch, stretch, sway, and freeze.";
    return;
  }

  const step = currentStep();
  kidStepText.textContent = step.label;
  kidPromptText.textContent = smartCoach.simplifiedMode ? step.simplified : step.prompt;
}

function updateGuidance() {
  if (config.difficulty === "freeplay") {
    stepText.textContent = "Free Play Mode";
    promptText.textContent = "Crouch, grow, wake the sun, sway for rain, and freeze for a butterfly.";
    coachText.textContent = "Try any movement and watch the garden respond.";
    syncKidPrompt();
    return;
  }

  const step = currentStep();
  stepText.textContent = `${step.label}: ${step.prompt}`;
  promptText.textContent = smartCoach.simplifiedMode ? step.simplified : step.operatorPrompt;
  syncKidPrompt();
}

function repeatPrompt() {
  speak(kidPromptText.textContent, true);
}

function resetCoachState() {
  smartCoach.stuckFrames = 0;
  smartCoach.successFrames = 0;
  smartCoach.simplifiedMode = false;
  smartCoach.lastHintAt = 0;
  smartCoach.lastPraiseAt = 0;
  coachText.textContent = "Take your time. The garden is ready.";
  kidCoachText.textContent = "Take your time. The garden is ready.";
}

function startBreathingPause(message) {
  sequence.waitingForNextStep = true;
  sequence.waitTimer = 180; // about 3 seconds at 60fps
  coachText.textContent = message;
  kidCoachText.textContent = message;
}

function advanceSequence() {
  if (config.difficulty !== "guided") return;

  const step = currentStep();
  coachText.textContent = step.celebration;
  kidCoachText.textContent = step.celebration;
  speak(step.celebration, true);

  if (sequence.step < sequence.steps.length - 1) {
    startBreathingPause(step.celebration);
  } else {
    sequence.completed = true;
    sequence.waitingForNextStep = false;
    stepText.textContent = "Garden Complete!";
    promptText.textContent = "You helped the whole garden come alive!";
    coachText.textContent = "Amazing work, gardener!";
    kidStepText.textContent = "Garden Complete!";
    kidPromptText.textContent = "You helped the whole garden come alive!";
    kidCoachText.textContent = "Amazing work, gardener!";
    speak("You helped the whole garden come alive!", true);
  }
}

function updateSequencePause() {
  if (!sequence.waitingForNextStep) return;

  sequence.waitTimer -= 1;
  if (sequence.waitTimer <= 0) {
    sequence.waitingForNextStep = false;
    sequence.step += 1;
    resetCoachState();
    updateGuidance();
    speak(kidPromptText.textContent, true);
  }
}

function resetSequence() {
  sequence.step = 0;
  sequence.completed = false;
  sequence.waitingForNextStep = false;
  sequence.waitTimer = 0;
  resetCoachState();
  updateGuidance();
}

function createFlowerPatch() {
  const groundY = height * 0.79;
  const spacing = width / 6;
  garden.flowers = [];

  for (let i = 0; i < 5; i++) {
    garden.flowers.push({
      x: spacing * (i + 1),
      y: groundY,
      growth: 0,
      planted: false,
      bloomColor: getBloomPalette()[i % getBloomPalette().length],
      leafColor: getLeafColor(),
      swayPhase: rand(0, Math.PI * 2)
    });
  }
}

function createClouds() {
  garden.clouds = [
    { x: width * 0.16, y: height * 0.15, scale: 1.0, speed: 0.05 },
    { x: width * 0.50, y: height * 0.12, scale: 1.18, speed: 0.04 },
    { x: width * 0.80, y: height * 0.18, scale: 0.92, speed: 0.05 }
  ];
}

function createButterflies() {
  garden.butterflies = [
    {
      x: width * 0.72,
      y: height * 0.46,
      tx: width * 0.72,
      ty: height * 0.46,
      visible: false,
      wing: 0
    }
  ];
}

function resetGarden() {
  garden.raindrops = [];
  garden.pollen = [];
  garden.sunLevel = 0;
  garden.skylineParallax = 0;

  actionState.plantedPulse = 0;
  actionState.growEnergy = 0;
  actionState.sunEnergy = 0;
  actionState.rainEnergy = 0;
  actionState.stillness = 0;
  actionState.swayAmount = 0;

  gestureConfidence.crouch = 0;
  gestureConfidence.grow = 0;
  gestureConfidence.handsUp = 0;
  gestureConfidence.sway = 0;
  gestureConfidence.still = 0;

  timers.plantHold = 0;
  timers.growHold = 0;
  timers.sunHold = 0;
  timers.rainHold = 0;
  timers.stillHold = 0;
  timers.rainCooldown = 0;

  createFlowerPatch();
  createClouds();
  createButterflies();
  resetSequence();
}

function getThemeColors() {
  if (config.gardenTheme === "bronx") {
    return {
      skyTop: "#dcf5ff",
      skyBottom: "#fff7ed",
      groundTop: "#95dc82",
      groundBottom: "#46a037"
    };
  }

  if (config.gardenTheme === "pollinator") {
    return {
      skyTop: "#e8fbff",
      skyBottom: "#fffef5",
      groundTop: "#b6e37f",
      groundBottom: "#65a83c"
    };
  }

  return {
    skyTop: "#dff5ff",
    skyBottom: "#f9fdff",
    groundTop: "#8fd27d",
    groundBottom: "#46a037"
  };
}

function getBloomPalette() {
  if (config.gardenTheme === "bronx") {
    return ["#f4c400", "#f58220", "#18a8e0", "#b1268f", "#46a037"];
  }
  if (config.gardenTheme === "pollinator") {
    return ["#f4c400", "#f58220", "#ff7fc9", "#7e62ff", "#46a037"];
  }
  return ["#ffca54", "#ff8c42", "#6bccef", "#e863c4", "#7ed957"];
}

function getLeafColor() {
  return config.gardenTheme === "bronx" ? "#46a037" : "#54a83b";
}

function syncCameraSelects(value) {
  cameraSelect.value = value;
  cameraSelectInline.value = value;
}

function drawSky() {
  const colors = getThemeColors();
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, colors.skyTop);
  grad.addColorStop(1, colors.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  for (const cloud of garden.clouds) {
    drawCloud(cloud.x, cloud.y, cloud.scale);
  }
}

function drawBronxSkyline() {
  const horizonY = height * 0.66;
  const baseColor = config.gardenTheme === "bronx"
    ? "rgba(77, 96, 128, 0.33)"
    : "rgba(92, 110, 130, 0.22)";

  ctx.save();
  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);

  const buildings = [
    [0.03, 0.03], [0.08, 0.08], [0.12, 0.05], [0.16, 0.10], [0.21, 0.04],
    [0.28, 0.09], [0.34, 0.05], [0.41, 0.11], [0.48, 0.06], [0.56, 0.13],
    [0.63, 0.07], [0.69, 0.12], [0.75, 0.05], [0.82, 0.10], [0.89, 0.04], [0.96, 0.08]
  ];

  for (const [px, h] of buildings) {
    const x = px * width + garden.skylineParallax;
    const bw = width * 0.03;
    const bh = height * h;
    ctx.lineTo(x, horizonY);
    ctx.lineTo(x, horizonY - bh);
    ctx.lineTo(x + bw, horizonY - bh);
    ctx.lineTo(x + bw, horizonY);
  }

  ctx.lineTo(width, horizonY);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGround() {
  const colors = getThemeColors();
  const groundTop = height * 0.75;

  const grad = ctx.createLinearGradient(0, groundTop, 0, height);
  grad.addColorStop(0, colors.groundTop);
  grad.addColorStop(1, colors.groundBottom);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, groundTop);
  ctx.quadraticCurveTo(width * 0.25, groundTop - 20, width * 0.5, groundTop + 8);
  ctx.quadraticCurveTo(width * 0.75, groundTop + 24, width, groundTop - 5);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();
}

function drawSun() {
  const x = width * 0.86;
  const y = lerp(height * 0.2, height * 0.09, garden.sunLevel);
  const radius = lerp(30, 56, garden.sunLevel);

  ctx.save();
  ctx.globalAlpha = 0.2 + garden.sunLevel * 0.8;

  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.3);
  glow.addColorStop(0, "rgba(244,196,0,0.95)");
  glow.addColorStop(0.45, "rgba(245,130,32,0.35)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f4c400";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawCloud(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(-28, 6, 24, 0, Math.PI * 2);
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.arc(28, 7, 22, 0, Math.PI * 2);
  ctx.arc(6, 14, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSeedMounds() {
  for (const flower of garden.flowers) {
    ctx.fillStyle = flower.planted ? "#8d5f34" : "rgba(122, 90, 52, 0.25)";
    ctx.beginPath();
    ctx.ellipse(flower.x, flower.y + 10, 26, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFlower(flower, time) {
  const growth = flower.growth;
  if (!flower.planted && growth <= 0.01) return;

  const stemHeight = 25 + growth * 115;
  const bloomRadius = 8 + growth * 22;
  const sway = Math.sin(time * 0.0015 + flower.swayPhase) * (2 + growth * 6);

  const stemTopX = flower.x + sway;
  const stemTopY = flower.y - stemHeight;

  ctx.save();

  ctx.strokeStyle = flower.leafColor;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(flower.x, flower.y);
  ctx.quadraticCurveTo(flower.x - 6, flower.y - stemHeight * 0.45, stemTopX, stemTopY);
  ctx.stroke();

  if (growth > 0.18) {
    ctx.strokeStyle = flower.leafColor;
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(flower.x - 2, flower.y - stemHeight * 0.42);
    ctx.quadraticCurveTo(flower.x - 25, flower.y - stemHeight * 0.52, flower.x - 8, flower.y - stemHeight * 0.58);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(flower.x + 1, flower.y - stemHeight * 0.58);
    ctx.quadraticCurveTo(flower.x + 26, flower.y - stemHeight * 0.68, flower.x + 10, flower.y - stemHeight * 0.74);
    ctx.stroke();
  }

  if (growth > 0.28) {
    ctx.fillStyle = flower.bloomColor;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 + time * 0.0004;
      const px = stemTopX + Math.cos(a) * bloomRadius * 0.95;
      const py = stemTopY + Math.sin(a) * bloomRadius * 0.95;
      ctx.beginPath();
      ctx.arc(px, py, bloomRadius * 0.52, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#f4c400";
    ctx.beginPath();
    ctx.arc(stemTopX, stemTopY, bloomRadius * 0.48, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawRaindrop(x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);

  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.quadraticCurveTo(6, -2, 5, 5);
  ctx.quadraticCurveTo(4, 11, 0, 12);
  ctx.quadraticCurveTo(-4, 11, -5, 5);
  ctx.quadraticCurveTo(-6, -2, 0, -10);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, -10, 0, 12);
  grad.addColorStop(0, "rgba(180, 235, 255, 0.95)");
  grad.addColorStop(1, "rgba(24,168,224,0.72)");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.restore();
}

function drawRain() {
  for (const drop of garden.raindrops) {
    drawRaindrop(drop.x, drop.y, drop.size);
  }
}

function drawButterflies() {
  for (const b of garden.butterflies) {
    if (!b.visible) continue;

    b.x = lerp(b.x, b.tx, 0.03);
    b.y = lerp(b.y, b.ty, 0.03);
    b.wing += 0.18;

    const flap = Math.sin(b.wing) * 8;

    ctx.save();
    ctx.translate(b.x, b.y);

    ctx.fillStyle = "#b1268f";
    ctx.beginPath();
    ctx.ellipse(-8, 0, 10 + flap * 0.12, 14, -0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#18a8e0";
    ctx.beginPath();
    ctx.ellipse(8, 0, 10 + flap * 0.12, 14, 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 12);
    ctx.stroke();

    ctx.restore();
  }
}

function drawPollen() {
  for (const p of garden.pollen) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawDebugSkeleton() {
  if (!config.debug) return;

  const pairs = [
    [poseState.leftShoulder, poseState.rightShoulder],
    [poseState.leftShoulder, poseState.leftElbow],
    [poseState.leftElbow, poseState.leftWrist],
    [poseState.rightShoulder, poseState.rightElbow],
    [poseState.rightElbow, poseState.rightWrist],
    [poseState.leftShoulder, poseState.leftHip],
    [poseState.rightShoulder, poseState.rightHip],
    [poseState.leftHip, poseState.rightHip],
    [poseState.leftHip, poseState.leftKnee],
    [poseState.rightHip, poseState.rightKnee]
  ];

  ctx.save();
  ctx.strokeStyle = "rgba(17, 90, 140, 0.9)";
  ctx.lineWidth = 4;

  for (const [a, b] of pairs) {
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const points = Object.values(poseState).filter(Boolean);
  for (const p of points) {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function emitRainBurst() {
  for (let i = 0; i < 6; i++) {
    garden.raindrops.push({
      x: rand(width * 0.18, width * 0.84),
      y: rand(height * 0.20, height * 0.34),
      vy: rand(2.2, 3.5),
      size: rand(0.9, 1.5)
    });
  }
}

function emitPollen(x, y, color) {
  for (let i = 0; i < 3; i++) {
    garden.pollen.push({
      x: x + rand(-10, 10),
      y: y + rand(-10, 10),
      vx: rand(-0.4, 0.4),
      vy: rand(-0.8, -0.2),
      size: rand(2, 4),
      alpha: rand(0.4, 0.85),
      color
    });
  }
}

function updateEnvironmentalMotion() {
  for (const cloud of garden.clouds) {
    cloud.x += cloud.speed + actionState.swayAmount * 0.0008;
    if (cloud.x > width + 120) cloud.x = -120;
  }

  for (let i = garden.raindrops.length - 1; i >= 0; i--) {
    const drop = garden.raindrops[i];
    drop.y += drop.vy;
    if (drop.y > height * 0.80) {
      garden.raindrops.splice(i, 1);
    }
  }

  for (let i = garden.pollen.length - 1; i >= 0; i--) {
    const p = garden.pollen[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= 0.015;
    if (p.alpha <= 0) garden.pollen.splice(i, 1);
  }

  garden.skylineParallax = Math.sin(performance.now() * 0.00008) * 10;

  const activeBody = performance.now() - lastSeenBodyTime < config.attractModeDelayMs;
  if (!activeBody && config.installationMode) {
    garden.sunLevel = lerp(garden.sunLevel, 0.45, 0.008);
  }
}

function updateFlowers() {
  for (const flower of garden.flowers) {
    if (actionState.plantedPulse > 0.7 && !flower.planted) {
      flower.planted = true;
      flower.growth = Math.max(flower.growth, 0.06);
      emitPollen(flower.x, flower.y - 8, flower.bloomColor);
    }

    if (flower.planted) {
      flower.growth = clamp(flower.growth + actionState.growEnergy * 0.0016, 0, 1);
      if (flower.growth > 0.32 && Math.random() < 0.02) {
        emitPollen(flower.x, flower.y - (40 + flower.growth * 85), flower.bloomColor);
      }
    }
  }
}

function updateButterflies() {
  const grownFlowers = garden.flowers.filter(f => f.growth > 0.55);
  const butterfly = garden.butterflies[0];

  if (actionState.stillness > 0.88 && grownFlowers.length > 0) {
    const targetFlower = grownFlowers[Math.floor(Math.random() * grownFlowers.length)];
    butterfly.visible = true;
    butterfly.tx = targetFlower.x + rand(-8, 8);
    butterfly.ty = targetFlower.y - (85 + targetFlower.growth * 45);
  } else if (actionState.stillness < 0.52) {
    butterfly.visible = false;
  }
}

function allFlowersPlanted() {
  return garden.flowers.every(f => f.planted);
}

function averageGrowth() {
  const total = garden.flowers.reduce((sum, f) => sum + f.growth, 0);
  return total / garden.flowers.length;
}

function updateGestureConfidence() {
  const leftWrist = poseState.leftWrist;
  const rightWrist = poseState.rightWrist;
  const leftShoulder = poseState.leftShoulder;
  const rightShoulder = poseState.rightShoulder;
  const leftHip = poseState.leftHip;
  const rightHip = poseState.rightHip;
  const leftKnee = poseState.leftKnee;
  const rightKnee = poseState.rightKnee;

  if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    gestureConfidence.crouch = lerp(gestureConfidence.crouch, 0, 0.08);
    gestureConfidence.grow = lerp(gestureConfidence.grow, 0, 0.08);
    gestureConfidence.handsUp = lerp(gestureConfidence.handsUp, 0, 0.08);
    gestureConfidence.sway = lerp(gestureConfidence.sway, 0, 0.08);
    gestureConfidence.still = lerp(gestureConfidence.still, 0, 0.08);
    return;
  }

  const shoulderY = (leftShoulder.y + rightShoulder.y) * 0.5;
  const hipY = (leftHip.y + rightHip.y) * 0.5;
  const torsoHeight = Math.max(hipY - shoulderY, 1);

  const handsUpRaw =
    leftWrist.y < leftShoulder.y - torsoHeight * 0.12 &&
    rightWrist.y < rightShoulder.y - torsoHeight * 0.12;

  const centerX = averagePoint(leftHip, rightHip)?.x ?? width * 0.5;
  const shoulderCenterX = averagePoint(leftShoulder, rightShoulder)?.x ?? centerX;
  const swayOffset = Math.abs(centerX - shoulderCenterX);

  let crouchingRaw = false;
  if (leftKnee && rightKnee) {
    const kneeY = (leftKnee.y + rightKnee.y) * 0.5;
    crouchingRaw = (kneeY - hipY) < torsoHeight * 0.66;
  }

  const handMotion =
    distance(leftWrist, leftShoulder) +
    distance(rightWrist, rightShoulder);

  const growRaw = !crouchingRaw ? clamp(handMotion / 360, 0, 1) : 0;
  const swayRaw = clamp((swayOffset - 24) / 42, 0, 1);

  const motionAmount =
    distance(leftWrist, rightWrist) * 0.0017 +
    swayOffset * 0.02;

  const stillRaw = motionAmount < 0.95 && !crouchingRaw && !handsUpRaw ? 1 : 0;

  gestureConfidence.crouch = lerp(gestureConfidence.crouch, crouchingRaw ? 1 : 0, 0.08);
  gestureConfidence.grow = lerp(gestureConfidence.grow, growRaw, 0.08);
  gestureConfidence.handsUp = lerp(gestureConfidence.handsUp, handsUpRaw ? 1 : 0, 0.08);
  gestureConfidence.sway = lerp(gestureConfidence.sway, swayRaw, 0.08);
  gestureConfidence.still = lerp(gestureConfidence.still, stillRaw, 0.08);
}

function updateActionState() {
  updateGestureConfidence();

  timers.plantHold = gestureConfidence.crouch > 0.7 ? timers.plantHold + 1 : 0;
  timers.growHold = gestureConfidence.grow > 0.28 ? timers.growHold + 1 : 0;
  timers.sunHold = gestureConfidence.handsUp > 0.76 ? timers.sunHold + 1 : 0;
  timers.rainHold = gestureConfidence.sway > 0.58 ? timers.rainHold + 1 : 0;
  timers.stillHold = gestureConfidence.still > 0.86 ? timers.stillHold + 1 : 0;

  if (timers.plantHold > 26) {
    actionState.plantedPulse = 1;
  } else {
    actionState.plantedPulse = lerp(actionState.plantedPulse, 0, 0.12);
  }

  actionState.growEnergy = lerp(actionState.growEnergy, gestureConfidence.grow, 0.04);
  actionState.sunEnergy = lerp(actionState.sunEnergy, gestureConfidence.handsUp, 0.04);
  actionState.rainEnergy = lerp(actionState.rainEnergy, gestureConfidence.sway, 0.04);
  actionState.stillness = lerp(actionState.stillness, gestureConfidence.still, 0.04);
  actionState.swayAmount = lerp(actionState.swayAmount, gestureConfidence.sway * 36, 0.05);

  garden.sunLevel = lerp(garden.sunLevel, actionState.sunEnergy, 0.025);

  if (timers.rainCooldown > 0) timers.rainCooldown -= 1;
  if (timers.rainHold > 28 && timers.rainCooldown <= 0) {
    emitRainBurst();
    timers.rainCooldown = 34;
  }
}

function updateSmartCoach() {
  if (config.difficulty !== "guided" || sequence.completed || sequence.waitingForNextStep) return;

  const step = currentStep();
  const now = performance.now();

  let confidence = 0;
  let hint = "";
  let praise = "";

  if (step.key === "plant") {
    confidence = gestureConfidence.crouch;
    hint = confidence > 0.42 ? "A little lower." : "Try bending down low.";
    praise = "Yes, you’re planting!";
  }

  if (step.key === "grow") {
    confidence = gestureConfidence.grow;
    hint = confidence > 0.35 ? "Keep growing tall." : "Stand up big and tall.";
    praise = "Great growing!";
  }

  if (step.key === "sun") {
    confidence = gestureConfidence.handsUp;
    hint = confidence > 0.46 ? "Lift both hands higher." : "Put both hands up in the sky.";
    praise = "You found the sun move!";
  }

  if (step.key === "rain") {
    confidence = gestureConfidence.sway;
    hint = confidence > 0.34 ? "Make a bigger sway." : "Move side to side.";
    praise = "That’s the rain move!";
  }

  if (step.key === "still") {
    confidence = gestureConfidence.still;
    hint = confidence > 0.42 ? "Almost. Stay still." : "Freeze like a statue.";
    praise = "Beautiful stillness!";
  }

  if (confidence > 0.46) {
    smartCoach.successFrames += 1;
    smartCoach.stuckFrames = 0;
  } else {
    smartCoach.stuckFrames += 1;
    smartCoach.successFrames = 0;
  }

  if (smartCoach.successFrames > 24 && now - smartCoach.lastPraiseAt > 3400) {
    coachText.textContent = praise;
    kidCoachText.textContent = praise;
    smartCoach.lastPraiseAt = now;
  }

  if (smartCoach.stuckFrames > 150) {
    smartCoach.simplifiedMode = true;
  }

  if (smartCoach.stuckFrames > 170 && now - smartCoach.lastHintAt > 4200) {
    coachText.textContent = hint;
    kidCoachText.textContent = hint;
    speak(hint);
    smartCoach.lastHintAt = now;
  }

  updateGuidance();
}

function checkGuidedStepCompletion() {
  if (config.difficulty !== "guided" || sequence.completed || sequence.waitingForNextStep) return;

  const current = currentStep();

  if (current.key === "plant" && allFlowersPlanted()) {
    advanceSequence();
    return;
  }

  if (current.key === "grow" && averageGrowth() > 0.45) {
    advanceSequence();
    return;
  }

  if (current.key === "sun" && garden.sunLevel > 0.72) {
    advanceSequence();
    return;
  }

  if (current.key === "rain" && garden.raindrops.length > 12) {
    advanceSequence();
    return;
  }

  if (current.key === "still" && actionState.stillness > 0.9 && garden.butterflies[0].visible) {
    advanceSequence();
  }
}

function drawAttractMode() {
  const activeBody = performance.now() - lastSeenBodyTime < config.attractModeDelayMs;
  if (!activeBody && config.installationMode) {
    attractOverlay.classList.add("visible");
    attractOverlay.classList.remove("hidden");
  } else {
    attractOverlay.classList.remove("visible");
    attractOverlay.classList.add("hidden");
  }
}

function onPoseResults(results) {
  const lm = results.poseLandmarks;

  if (!lm || !lm.length) {
    setStatus("No body detected. Step into view.");
    return;
  }

  lastSeenBodyTime = performance.now();
  setStatus("Garden tracking live", "live");

  poseState.nose = mapLandmark(lm[0]);
  poseState.leftShoulder = mapLandmark(lm[11]);
  poseState.rightShoulder = mapLandmark(lm[12]);
  poseState.leftElbow = mapLandmark(lm[13]);
  poseState.rightElbow = mapLandmark(lm[14]);
  poseState.leftWrist = mapLandmark(lm[15]);
  poseState.rightWrist = mapLandmark(lm[16]);
  poseState.leftHip = mapLandmark(lm[23]);
  poseState.rightHip = mapLandmark(lm[24]);
  poseState.leftKnee = mapLandmark(lm[25]);
  poseState.rightKnee = mapLandmark(lm[26]);
}

async function loadCameraOptions() {
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    tempStream.getTracks().forEach(track => track.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");

    cameraSelect.innerHTML = "";
    cameraSelectInline.innerHTML = "";

    if (!cams.length) {
      cameraSelect.innerHTML = `<option value="">No cameras found</option>`;
      cameraSelectInline.innerHTML = `<option value="">No cameras found</option>`;
      return;
    }

    cams.forEach((cam, index) => {
      const label = cam.label || `Camera ${index + 1}`;

      const option1 = document.createElement("option");
      option1.value = cam.deviceId;
      option1.textContent = label;
      cameraSelect.appendChild(option1);

      const option2 = document.createElement("option");
      option2.value = cam.deviceId;
      option2.textContent = label;
      cameraSelectInline.appendChild(option2);
    });

    currentDeviceId = cameraSelect.value;
    syncCameraSelects(currentDeviceId);
  } catch (err) {
    console.error(err);
    cameraSelect.innerHTML = `<option value="">Camera access needed</option>`;
    cameraSelectInline.innerHTML = `<option value="">Camera access needed</option>`;
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
        minDetectionConfidence: 0.55,
        minTrackingConfidence: 0.55
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
    setStatus("Camera started. Looking for garden helper...");
    lastSeenBodyTime = 0;
  } catch (err) {
    console.error(err);
    setStatus("Camera failed. Check permissions and selected device.", "error");
  }
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
  syncCameraSelects(currentDeviceId);
  await startPoseWithSelectedCamera(currentDeviceId);
  await enterFullscreenMaybe();

  startupOverlay.classList.remove("visible");
  startupOverlay.classList.add("hidden");

  updateGuidance();
  speak(kidPromptText.textContent, true);
}

function drawScene(time) {
  drawSky();
  drawBronxSkyline();
  drawSun();
  drawRain();
  drawPollen();
  drawGround();
  drawSeedMounds();

  for (const flower of garden.flowers) {
    drawFlower(flower, time);
  }

  drawButterflies();
  drawDebugSkeleton();
}

function animate(time) {
  ctx.clearRect(0, 0, width, height);

  updateActionState();
  updateFlowers();
  updateButterflies();
  updateEnvironmentalMotion();
  updateSmartCoach();
  checkGuidedStepCompletion();
  updateSequencePause();
  drawScene(time || 0);
  drawAttractMode();

  requestAnimationFrame(animate);
}

gardenThemeSelect.addEventListener("change", () => {
  config.gardenTheme = gardenThemeSelect.value;
  resetGarden();
});

difficultySelect.addEventListener("change", () => {
  config.difficulty = difficultySelect.value;
  resetSequence();
});

audioToggle.addEventListener("change", () => {
  config.audio = audioToggle.checked;
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

repeatPromptBtn.addEventListener("click", repeatPrompt);

resetBtn.addEventListener("click", () => {
  resetGarden();
});

cameraSelect.addEventListener("change", () => {
  currentDeviceId = cameraSelect.value;
  syncCameraSelects(currentDeviceId);
});

cameraSelectInline.addEventListener("change", async () => {
  currentDeviceId = cameraSelectInline.value;
  syncCameraSelects(currentDeviceId);
  if (!startupOverlay.classList.contains("hidden")) return;
  await startPoseWithSelectedCamera(currentDeviceId);
});

startExperienceBtn.addEventListener("click", startExperience);

window.addEventListener("resize", () => {
  resizeCanvas();
  resetGarden();
});

resizeCanvas();
resetGarden();
requestAnimationFrame(animate);
loadCameraOptions();
updateGuidance();
