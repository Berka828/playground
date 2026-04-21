const video = document.getElementById("video");
const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");

const startupOverlay = document.getElementById("startupOverlay");
const attractOverlay = document.getElementById("attractOverlay");
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
const debugToggle = document.getElementById("debugToggle");
const mirrorToggle = document.getElementById("mirrorToggle");
const uiVisibleToggle = document.getElementById("uiVisibleToggle");
const nextPromptBtn = document.getElementById("nextPromptBtn");
const resetBtn = document.getElementById("resetBtn");
const promptText = document.getElementById("promptText");

let width = window.innerWidth;
let height = window.innerHeight;
let dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

let poseInstance = null;
let cameraController = null;
let currentStream = null;
let currentDeviceId = "";
let lastSeenBodyTime = 0;
let promptIndex = 0;

const config = {
  mirror: true,
  debug: false,
  installationMode: true,
  autoFullscreen: true,
  hideUiInInstallation: true,
  attractModeDelayMs: 5000,
  gardenTheme: "spring",
  difficulty: "guided"
};

const prompts = [
  "Can you crouch down and plant a seed?",
  "Can you stand tall and help the flower grow?",
  "Can you raise both hands to wake the sun?",
  "Can you sway side to side to make rain?",
  "Can you stay very still so the butterfly lands?"
];

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

const actionState = {
  planted: false,
  plantCooldown: 0,
  growEnergy: 0,
  sunEnergy: 0,
  rainEnergy: 0,
  stillness: 0,
  breeze: 0,
  swayAmount: 0
};

const garden = {
  flowers: [],
  butterflies: [],
  raindrops: [],
  clouds: [],
  pollen: [],
  sunLevel: 0,
  guideMessageTimer: 0
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
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5
  };
}

function mapLandmark(landmark) {
  if (!landmark) return null;
  let x = landmark.x * width;
  const y = landmark.y * height;
  if (config.mirror) x = width - x;
  return { x, y, visibility: landmark.visibility ?? 0 };
}

function createFlowerPatch() {
  const groundY = height * 0.78;
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
    { x: width * 0.2, y: height * 0.16, scale: 1.0, speed: 0.08 },
    { x: width * 0.52, y: height * 0.12, scale: 1.25, speed: 0.05 },
    { x: width * 0.78, y: height * 0.18, scale: 0.95, speed: 0.07 }
  ];
}

function createButterflies() {
  garden.butterflies = [
    {
      x: width * 0.72,
      y: height * 0.45,
      tx: width * 0.72,
      ty: height * 0.45,
      visible: false,
      wing: 0
    }
  ];
}

function resetGarden() {
  garden.raindrops = [];
  garden.pollen = [];
  garden.sunLevel = 0;
  actionState.planted = false;
  actionState.plantCooldown = 0;
  actionState.growEnergy = 0;
  actionState.sunEnergy = 0;
  actionState.rainEnergy = 0;
  actionState.stillness = 0;
  actionState.breeze = 0;
  actionState.swayAmount = 0;
  createFlowerPatch();
  createClouds();
  createButterflies();
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

function updatePrompt() {
  promptText.textContent = prompts[promptIndex % prompts.length];
}

function nextPrompt() {
  promptIndex += 1;
  updatePrompt();
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

function drawRain() {
  for (const drop of garden.raindrops) {
    ctx.save();
    ctx.strokeStyle = "rgba(24,168,224,0.75)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(drop.x, drop.y);
    ctx.lineTo(drop.x - 4, drop.y + 14);
    ctx.stroke();
    ctx.restore();
  }
}

function drawButterflies(time) {
  for (const b of garden.butterflies) {
    if (!b.visible) continue;

    b.x = lerp(b.x, b.tx, 0.03);
    b.y = lerp(b.y, b.ty, 0.03);
    b.wing += 0.25;

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

function emitRain() {
  for (let i = 0; i < 6; i++) {
    garden.raindrops.push({
      x: rand(width * 0.12, width * 0.88),
      y: rand(height * 0.18, height * 0.38),
      vy: rand(7, 10)
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

function updateEnvironmentalMotion(time) {
  for (const cloud of garden.clouds) {
    cloud.x += cloud.speed + actionState.breeze * 0.08;
    if (cloud.x > width + 120) cloud.x = -120;
  }

  for (let i = garden.raindrops.length - 1; i >= 0; i--) {
    const drop = garden.raindrops[i];
    drop.y += drop.vy;
    drop.x += actionState.breeze * 0.4;
    if (drop.y > height * 0.82) {
      garden.raindrops.splice(i, 1);
    }
  }

  for (let i = garden.pollen.length - 1; i >= 0; i--) {
    const p = garden.pollen[i];
    p.x += p.vx + actionState.breeze * 0.3;
    p.y += p.vy;
    p.alpha -= 0.015;
    if (p.alpha <= 0) garden.pollen.splice(i, 1);
  }

  const activeBody = performance.now() - lastSeenBodyTime < config.attractModeDelayMs;
  if (!activeBody && config.installationMode) {
    actionState.breeze = lerp(actionState.breeze, 0.25, 0.02);
    garden.sunLevel = lerp(garden.sunLevel, 0.55, 0.01);

    if (Math.random() < 0.08) emitRain();
  } else {
    actionState.breeze = lerp(actionState.breeze, clamp(actionState.swayAmount * 0.03, 0, 0.8), 0.08);
  }

  if (actionState.rainEnergy > 0.2 && Math.random() < 0.5) {
    emitRain();
  }
}

function updateFlowers() {
  for (const flower of garden.flowers) {
    if (actionState.planted && !flower.planted) {
      flower.planted = true;
      flower.growth = Math.max(flower.growth, 0.06);
      emitPollen(flower.x, flower.y - 8, flower.bloomColor);
    }

    if (flower.planted) {
      flower.growth = clamp(flower.growth + actionState.growEnergy * 0.003, 0, 1);
      if (flower.growth > 0.32 && Math.random() < 0.04) {
        emitPollen(flower.x, flower.y - (40 + flower.growth * 85), flower.bloomColor);
      }
    }
  }
}

function updateButterflies() {
  const grownFlowers = garden.flowers.filter(f => f.growth > 0.55);
  const butterfly = garden.butterflies[0];

  if (actionState.stillness > 0.75 && grownFlowers.length > 0) {
    const targetFlower = grownFlowers[Math.floor(Math.random() * grownFlowers.length)];
    butterfly.visible = true;
    butterfly.tx = targetFlower.x + rand(-8, 8);
    butterfly.ty = targetFlower.y - (85 + targetFlower.growth * 45);
  } else if (actionState.stillness < 0.35) {
    butterfly.visible = false;
  }
}

function updateActionState() {
  const leftWrist = poseState.leftWrist;
  const rightWrist = poseState.rightWrist;
  const leftShoulder = poseState.leftShoulder;
  const rightShoulder = poseState.rightShoulder;
  const leftHip = poseState.leftHip;
  const rightHip = poseState.rightHip;
  const leftKnee = poseState.leftKnee;
  const rightKnee = poseState.rightKnee;

  if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    actionState.growEnergy = lerp(actionState.growEnergy, 0, 0.1);
    actionState.sunEnergy = lerp(actionState.sunEnergy, 0, 0.1);
    actionState.rainEnergy = lerp(actionState.rainEnergy, 0, 0.1);
    actionState.stillness = lerp(actionState.stillness, 0, 0.1);
    actionState.swayAmount = lerp(actionState.swayAmount, 0, 0.1);
    return;
  }

  const shoulderY = (leftShoulder.y + rightShoulder.y) * 0.5;
  const hipY = (leftHip.y + rightHip.y) * 0.5;
  const torsoHeight = Math.max(hipY - shoulderY, 1);

  const handsUp =
    leftWrist.y < leftShoulder.y - torsoHeight * 0.15 &&
    rightWrist.y < rightShoulder.y - torsoHeight * 0.15;

  const centerX = averagePoint(leftHip, rightHip)?.x ?? width * 0.5;
  const shoulderCenterX = averagePoint(leftShoulder, rightShoulder)?.x ?? centerX;
  const swayOffset = Math.abs(centerX - shoulderCenterX);

  let crouching = false;
  if (leftKnee && rightKnee) {
    const kneeY = (leftKnee.y + rightKnee.y) * 0.5;
    crouching = (kneeY - hipY) < torsoHeight * 0.75;
  } else {
    crouching = torsoHeight < height * 0.16;
  }

  const handMotion =
    distance(leftWrist, leftShoulder) +
    distance(rightWrist, rightShoulder);

  actionState.growEnergy = lerp(actionState.growEnergy, crouching ? 0 : clamp(handMotion / 280, 0.08, 1.1), 0.06);
  actionState.sunEnergy = lerp(actionState.sunEnergy, handsUp ? 1 : 0, 0.08);
  actionState.rainEnergy = lerp(actionState.rainEnergy, clamp(swayOffset / 45, 0, 1), 0.08);
  actionState.swayAmount = lerp(actionState.swayAmount, swayOffset, 0.1);

  const motionAmount =
    distance(leftWrist, rightWrist) * 0.003 +
    swayOffset * 0.05 +
    Math.abs(actionState.rainEnergy * 12);

  const isStill = motionAmount < 1.8 && !crouching && !handsUp;
  actionState.stillness = lerp(actionState.stillness, isStill ? 1 : 0, 0.05);

  if (crouching && actionState.plantCooldown <= 0) {
    actionState.planted = true;
    actionState.plantCooldown = 70;
  } else {
    actionState.planted = false;
  }

  if (actionState.plantCooldown > 0) {
    actionState.plantCooldown -= 1;
  }

  garden.sunLevel = lerp(garden.sunLevel, actionState.sunEnergy, 0.04);
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
}

function drawScene(time) {
  drawSky();
  drawSun();
  drawRain();
  drawPollen();
  drawGround();
  drawSeedMounds();

  for (const flower of garden.flowers) {
    drawFlower(flower, time);
  }

  drawButterflies(time);
  drawDebugSkeleton();
}

function animate(time) {
  ctx.clearRect(0, 0, width, height);

  updateActionState();
  updateFlowers();
  updateButterflies();
  updateEnvironmentalMotion(time || 0);
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
updatePrompt();
requestAnimationFrame(animate);
loadCameraOptions();
