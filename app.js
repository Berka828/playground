const canvas = document.getElementById("playground");
const ctx = canvas.getContext("2d");

const themeSelect = document.getElementById("themeSelect");
const particleCountInput = document.getElementById("particleCount");
const particleCountValue = document.getElementById("particleCountValue");
const windStrengthInput = document.getElementById("windStrength");
const windStrengthValue = document.getElementById("windStrengthValue");
const trailToggle = document.getElementById("trailToggle");
const autoDriftToggle = document.getElementById("autoDriftToggle");
const burstBtn = document.getElementById("burstBtn");
const resetBtn = document.getElementById("resetBtn");

let width = window.innerWidth;
let height = window.innerHeight;
let dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

canvas.width = width * dpr;
canvas.height = height * dpr;
canvas.style.width = width + "px";
canvas.style.height = height + "px";
ctx.scale(dpr, dpr);

let particles = [];
let pulses = [];
let lastTime = 0;

const pointer = {
  x: width * 0.5,
  y: height * 0.5,
  px: width * 0.5,
  py: height * 0.5,
  vx: 0,
  vy: 0,
  active: false
};

const config = {
  theme: "leaves",
  particleCount: parseInt(particleCountInput.value, 10),
  windStrength: parseFloat(windStrengthInput.value),
  trails: trailToggle.checked,
  autoDrift: autoDriftToggle.checked,
  ambientWindX: 0.08,
  ambientWindY: -0.01,
  friction: 0.985,
  pointerRadius: 180,
  pulseForce: 5.5,
  pulseRadius: 240
};

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

function getThemeSettings(theme) {
  switch (theme) {
    case "confetti":
      return {
        backgroundGlow: "rgba(255,255,255,0.04)",
        colors: ["#ff6b6b", "#ffd93d", "#6bcBef", "#9d4edd", "#7bd389", "#ffffff"],
        sizeMin: 2,
        sizeMax: 7,
        speedMin: 0.1,
        speedMax: 1.1,
        alphaMin: 0.45,
        alphaMax: 1,
        shape: "rect"
      };

    case "fireflies":
      return {
        backgroundGlow: "rgba(255, 231, 150, 0.04)",
        colors: ["#fff7b0", "#f8ff7a", "#ffd36e", "#fffbe6"],
        sizeMin: 1.5,
        sizeMax: 4.5,
        speedMin: 0.05,
        speedMax: 0.45,
        alphaMin: 0.35,
        alphaMax: 0.95,
        shape: "glow"
      };

    case "dust":
      return {
        backgroundGlow: "rgba(224, 200, 150, 0.03)",
        colors: ["#d7c2a3", "#c9b08d", "#e1d0b3", "#f0e2ca", "#b8936a"],
        sizeMin: 1,
        sizeMax: 5,
        speedMin: 0.08,
        speedMax: 0.7,
        alphaMin: 0.22,
        alphaMax: 0.65,
        shape: "dust"
      };

    case "leaves":
    default:
      return {
        backgroundGlow: "rgba(140, 255, 180, 0.03)",
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
    this.baseSize = this.size;
    this.color = pick(theme.colors);
    this.alpha = rand(theme.alphaMin, theme.alphaMax);
    this.rotation = rand(0, Math.PI * 2);
    this.rotationSpeed = rand(-0.03, 0.03);
    this.shape = theme.shape;
    this.floatPhase = rand(0, Math.PI * 2);
    this.speedFactor = rand(theme.speedMin, theme.speedMax);
  }

  applyPointerWind() {
    if (!pointer.active) return;

    const dx = this.x - pointer.x;
    const dy = this.y - pointer.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < config.pointerRadius && dist > 0.001) {
      const power = (1 - dist / config.pointerRadius) * config.windStrength;
      this.vx += pointer.vx * 0.02 * power;
      this.vy += pointer.vy * 0.02 * power;

      this.vx += (dx / dist) * 0.02 * power;
      this.vy += (dy / dist) * 0.02 * power;
    }
  }

  applyPulses() {
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pulse = pulses[i];
      const dx = this.x - pulse.x;
      const dy = this.y - pulse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < pulse.radius && dist > 0.001) {
        const strength = (1 - dist / pulse.radius) * pulse.force;
        this.vx += (dx / dist) * strength * 0.06;
        this.vy += (dy / dist) * strength * 0.06;
      }
    }
  }

  update(time) {
    this.applyPointerWind();
    this.applyPulses();

    if (config.autoDrift) {
      this.vx += config.ambientWindX * this.speedFactor * 0.02;
      this.vy += config.ambientWindY * this.speedFactor * 0.02;
    }

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
    grad.addColorStop(0.3, this.color + "88");
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
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.life = 1;
    this.radius = config.pulseRadius;
    this.force = config.pulseForce;
    this.visualRadius = 10;
  }

  update() {
    this.life -= 0.02;
    this.visualRadius += 12;
  }

  draw() {
    if (this.life <= 0) return;

    ctx.save();
    ctx.globalAlpha = this.life * 0.35;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
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

function addPulse(x, y) {
  pulses.push(new Pulse(x, y));
}

function drawBackgroundGlow() {
  const theme = getThemeSettings(config.theme);

  const grad = ctx.createRadialGradient(
    pointer.x, pointer.y, 0,
    pointer.x, pointer.y, 260
  );
  grad.addColorStop(0, theme.backgroundGlow);
  grad.addColorStop(1, "rgba(255,255,255,0)");

  ctx.save();
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function animate(timestamp) {
  const time = timestamp || 0;
  const delta = time - lastTime;
  lastTime = time;

  if (!config.trails) {
    ctx.clearRect(0, 0, width, height);
  } else {
    ctx.fillStyle = "rgba(5, 11, 16, 0.14)";
    ctx.fillRect(0, 0, width, height);
  }

  drawBackgroundGlow();

  for (let i = 0; i < particles.length; i++) {
    particles[i].update(time, delta);
    particles[i].draw();
  }

  for (let i = pulses.length - 1; i >= 0; i--) {
    pulses[i].update();
    pulses[i].draw();
    if (pulses[i].dead) {
      pulses.splice(i, 1);
    }
  }

  requestAnimationFrame(animate);
}

function updatePointer(x, y) {
  pointer.px = pointer.x;
  pointer.py = pointer.y;
  pointer.x = x;
  pointer.y = y;
  pointer.vx = pointer.x - pointer.px;
  pointer.vy = pointer.y - pointer.py;
  pointer.active = true;
}

window.addEventListener("mousemove", (e) => {
  updatePointer(e.clientX, e.clientY);
});

window.addEventListener("touchmove", (e) => {
  if (e.touches && e.touches[0]) {
    updatePointer(e.touches[0].clientX, e.touches[0].clientY);
  }
}, { passive: true });

window.addEventListener("mousedown", (e) => {
  updatePointer(e.clientX, e.clientY);
  addPulse(pointer.x, pointer.y);
});

window.addEventListener("touchstart", (e) => {
  if (e.touches && e.touches[0]) {
    updatePointer(e.touches[0].clientX, e.touches[0].clientY);
    addPulse(pointer.x, pointer.y);
  }
}, { passive: true });

window.addEventListener("mouseleave", () => {
  pointer.active = false;
});

window.addEventListener("resize", () => {
  resizeCanvas();
  resetScene();
});

themeSelect.addEventListener("change", () => {
  config.theme = themeSelect.value;
  resetScene();
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

trailToggle.addEventListener("change", () => {
  config.trails = trailToggle.checked;
});

autoDriftToggle.addEventListener("change", () => {
  config.autoDrift = autoDriftToggle.checked;
});

burstBtn.addEventListener("click", () => {
  addPulse(width * 0.5, height * 0.5);
});

resetBtn.addEventListener("click", () => {
  resetScene();
});

resizeCanvas();
buildParticles();
requestAnimationFrame(animate);
