const canvas = document.querySelector("#paint");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const ink = document.createElement("canvas");
const ictx = ink.getContext("2d");
const undoButton = document.querySelector("#undo");
const clearButton = document.querySelector("#clear");
const eraserButton = document.querySelector("#eraser");
const textToolButton = document.querySelector("#text-tool");
const textEntry = document.querySelector("#text-entry");
const textInput = document.querySelector("#text-input");

let width = 0,
  height = 0,
  dpr = 1;
let drawing = false,
  holding = false,
  moved = false,
  dirty = false,
  erasing = false;
let last = null,
  start = null,
  downAt = 0,
  holdTimer = null;
let hue = 197,
  brush = 0,
  paintType = 0;
let ripples = [];
const history = [];
const texts = [];
let backgroundColor = "#171918";
let draggingText = null;
let dragOffset = null;

const brushes = ["round", "diamond", "star"];
const paintTypes = ["continuous", "spray", "texture"];
const colorHues = [-2, 348, 27, 62, 149, 197, 267, -1];

function resize() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(devicePixelRatio || 1, 2);
  width = rect.width;
  height = rect.height;
  [canvas, ink].forEach((el) => {
    el.width = Math.round(width * dpr);
    el.height = Math.round(height * dpr);
  });
  [ctx, ictx].forEach((c) => c.setTransform(dpr, 0, 0, dpr, 0, 0));
  backgroundColor = "#171918";
  history.length = 0;
  saveHistory();
  render();
}
addEventListener("resize", resize);

const field = {
  color: () => ({ x: 56, y: 56, r: 19 }),
  brush: () => ({ x: 57, y: 125, r: 23 }),
  paintType: () => ({ x: 57, y: 194, r: 23 }),
  flood: () => ({ x: width * 0.5, y: height - 48, r: 30 }),
};

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function hueColor(alpha = 1) {
  if (hue === -2) return `rgba(245, 247, 242, ${alpha})`;
  if (hue === -1) return `rgba(23, 25, 24, ${alpha})`;
  return `hsla(${hue}, 90%, 66%, ${alpha})`;
}
function eventPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
}

function close(p, thing, factor = 1) {
  return distance(p, thing) < thing.r * factor;
}
function saveHistory() {
  history.push({
    image: ictx.getImageData(0, 0, ink.width, ink.height),
    backgroundColor,
    texts: texts.map((text) => ({ ...text, lines: [...text.lines] })),
  });
  if (history.length > 30) history.shift();
}
function undo() {
  if (history.length < 2) return;
  history.pop();
  const previous = history.at(-1);
  ictx.putImageData(previous.image, 0, 0);
  backgroundColor = previous.backgroundColor;
  texts.length = 0;
  texts.push(
    ...previous.texts.map((text) => ({ ...text, lines: [...text.lines] })),
  );
  render();
}
function clearCanvas() {
  ictx.save();
  ictx.fillStyle = backgroundColor;
  ictx.fillRect(0, 0, width, height);
  ictx.restore();
  texts.length = 0;
  history.length = 0;
  saveHistory();
  render();
}
function eraseStroke(a, b) {
  ictx.save();
  ictx.fillStyle = backgroundColor;
  ictx.strokeStyle = backgroundColor;
  ictx.lineWidth = 30;
  ictx.lineCap = "round";
  if (a.x === b.x && a.y === b.y) {
    ictx.beginPath();
    ictx.arc(a.x, a.y, 15, 0, Math.PI * 2);
    ictx.fill();
  } else {
    ictx.beginPath();
    ictx.moveTo(a.x, a.y);
    ictx.lineTo(b.x, b.y);
    ictx.stroke();
  }
  ictx.restore();
}
function drawLine(a, b) {
  if (erasing) {
    eraseStroke(a, b);
    dirty = true;
    return;
  }
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const speed = (Math.hypot(dx, dy) / Math.max(b.t - a.t, 1)) * 16;
  let lineWidth = Math.max(1.5, Math.min(15, 16 - speed));
  ictx.save();
  ictx.strokeStyle = hueColor(0.92);
  ictx.fillStyle = hueColor(0.9);
  ictx.lineCap = "round";
  ictx.lineJoin = "round";
  ictx.lineWidth = lineWidth;
  if (paintType === 0) paintContinuous(a, b, lineWidth);
  if (paintType === 1) paintSpray(a, b, lineWidth);
  if (paintType === 2) paintTexture(a, b, lineWidth);
  ictx.restore();
  dirty = true;
}
function paintContinuous(a, b, size) {
  if (brush === 0) {
    ictx.beginPath();
    ictx.moveTo(a.x, a.y);
    ictx.lineTo(b.x, b.y);
    ictx.stroke();
  }
  if (brush === 1) crystal(b, size);
  if (brush === 2) star(b, Math.max(4, size));
}
function paintSpray(a, b, size) {
  const steps = Math.max(4, Math.ceil(distance(a, b) / 5));
  ictx.globalAlpha = 0.32;
  for (let i = 0; i < steps; i++) {
    const progress = i / Math.max(steps - 1, 1);
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * (size * 1.6 + 3);
    const p = {
      x: a.x + (b.x - a.x) * progress + Math.cos(angle) * radius,
      y: a.y + (b.y - a.y) * progress + Math.sin(angle) * radius,
    };
    drawBrushShape(p, Math.max(1.3, size * 0.22));
  }
}
function paintTexture(a, b, size) {
  const steps = Math.max(2, Math.ceil(distance(a, b) / Math.max(size, 4)));
  ictx.globalAlpha = 0.52;
  for (let i = 0; i < steps; i++) {
    const progress = i / Math.max(steps - 1, 1);
    const wobble = Math.sin((a.x + a.y + i * 17) * 0.12) * size * 0.7;
    const p = {
      x:
        a.x +
        (b.x - a.x) * progress +
        ((-b.y + a.y) / Math.max(distance(a, b), 1)) * wobble,
      y:
        a.y +
        (b.y - a.y) * progress +
        ((b.x - a.x) / Math.max(distance(a, b), 1)) * wobble,
    };
    drawBrushShape(p, Math.max(2, size * 0.55));
  }
}
function crystal(p, s) {
  ictx.save();
  ictx.translate(p.x, p.y);
  ictx.rotate((p.x + p.y) * 0.04);
  ictx.beginPath();
  for (let i = 0; i < 4; i++) {
    ictx.lineTo(
      Math.cos((i * Math.PI) / 2) * s,
      Math.sin((i * Math.PI) / 2) * s,
    );
  }
  ictx.closePath();
  ictx.fill();
  ictx.restore();
}
function star(p, size) {
  ictx.save();
  ictx.translate(p.x, p.y);
  ictx.rotate(-Math.PI / 2);
  ictx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? size * 0.45 : size;
    const angle = (i * Math.PI) / 5;
    i
      ? ictx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
      : ictx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  ictx.closePath();
  ictx.fill();
  ictx.restore();
}
function fillCanvas() {
  ictx.save();
  ictx.fillStyle = hueColor();
  ictx.fillRect(0, 0, width, height);
  ictx.restore();
  backgroundColor = hueColor();
  saveHistory();
}
function addText(text) {
  const maxWidth = Math.max(160, width * 0.7);
  const words = text.trim().split(/\s+/);
  const lines = [];
  const font = "600 28px Outfit, system-ui, sans-serif";
  ictx.save();
  ictx.font = font;
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ictx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  });
  if (line) lines.push(line);
  const lineHeight = 36;
  const textWidth = Math.max(
    ...lines.map((entry) => ictx.measureText(entry).width),
  );
  ictx.restore();
  texts.push({
    text,
    lines,
    x: width / 2,
    y: height / 2,
    textWidth,
    maxWidth,
    lineHeight,
    font,
  });
  saveHistory();
  render();
}

function textBounds(text) {
  const height = text.lines.length * text.lineHeight;
  const textWidth = text.textWidth || text.maxWidth;
  return {
    left: text.x - textWidth / 2,
    right: text.x + textWidth / 2,
    top: text.y - height / 2,
    bottom: text.y + height / 2,
  };
}

function textAt(point) {
  return [...texts].reverse().find((text) => {
    const bounds = textBounds(text);
    return (
      point.x >= bounds.left &&
      point.x <= bounds.right &&
      point.y >= bounds.top &&
      point.y <= bounds.bottom
    );
  });
}

function drawTexts() {
  ctx.save();
  ctx.fillStyle = hueColor(0.95);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  texts.forEach((text) => {
    ctx.font = text.font;
    const firstY = text.y - ((text.lines.length - 1) * text.lineHeight) / 2;
    text.lines.forEach((entry, index) =>
      ctx.fillText(
        entry,
        text.x,
        firstY + index * text.lineHeight,
        text.maxWidth,
      ),
    );
  });
  ctx.restore();
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = eventPoint(e);
  const selectedText = textAt(p);
  if (selectedText) {
    draggingText = selectedText;
    dragOffset = { x: p.x - selectedText.x, y: p.y - selectedText.y };
    canvas.style.cursor = "grabbing";
    return;
  }
  const color = field.color(),
    shape = field.brush(),
    type = field.paintType(),
    flood = field.flood();
  if (close(p, color, 1.45)) {
    hue = colorHues[(colorHues.indexOf(hue) + 1) % colorHues.length];
    ripples.push({ ...color, life: 26, h: hue });
    render();
    return;
  }
  if (close(p, shape, 1.5)) {
    brush = (brush + 1) % brushes.length;
    ripples.push({ ...shape, life: 26, h: hue });
    render();
    return;
  }
  if (close(p, type, 1.5)) {
    paintType = (paintType + 1) % paintTypes.length;
    ripples.push({ ...type, life: 26, h: hue });
    render();
    return;
  }
  if (close(p, flood, 1.2)) {
    fillCanvas();
    ripples.push({ ...flood, life: 26, h: hue });
    render();
    return;
  }
  drawing = true;
  moved = false;
  dirty = false;
  downAt = performance.now();
  last = p;
  start = p;
  holdTimer = setTimeout(() => {
    if (drawing && !moved) {
      holding = true;
    }
  }, 240);
});
canvas.addEventListener("pointermove", (e) => {
  let p = eventPoint(e);
  if (draggingText) {
    const textWidth = draggingText.textWidth || draggingText.maxWidth;
    draggingText.x = Math.max(
      textWidth / 2,
      Math.min(width - textWidth / 2, p.x - dragOffset.x),
    );
    const halfHeight =
      (draggingText.lines.length * draggingText.lineHeight) / 2;
    draggingText.y = Math.max(
      halfHeight,
      Math.min(height - halfHeight, p.y - dragOffset.y),
    );
    render();
    return;
  }
  if (!drawing) {
    if (textAt(p)) canvas.style.cursor = "grab";
    else if (close(p, field.brush(), 1.2) || close(p, field.paintType(), 1.2))
      canvas.style.cursor = "cell";
    else canvas.style.cursor = "crosshair";
    return;
  }
  if (e.shiftKey && start) {
    const dx = p.x - start.x,
      dy = p.y - start.y;
    if (Math.abs(dx) > Math.abs(dy)) p.y = start.y;
    else p.x = start.x;
  }
  const movement = last ? distance(last, p) : 0;
  if (movement > 3) moved = true;
  if (moved) {
    clearTimeout(holdTimer);
    drawLine(last, p);
    last = p;
    render();
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (draggingText) {
    saveHistory();
    draggingText = null;
    dragOffset = null;
    canvas.style.cursor = "crosshair";
    render();
    return;
  }
  if (!drawing) return;
  clearTimeout(holdTimer);
  const p = eventPoint(e);
  if (!moved && !holding) stamp(p);
  drawing = false;
  holding = false;
  last = null;
  start = null;
  if (dirty) saveHistory();
  render();
});
canvas.addEventListener("pointercancel", () => {
  drawing = false;
  draggingText = null;
  dragOffset = null;
  clearTimeout(holdTimer);
  canvas.style.cursor = "crosshair";
});

function stamp(p) {
  if (erasing) {
    eraseStroke(p, p);
    dirty = true;
    return;
  }
  dirty = true;
  ictx.save();
  ictx.fillStyle = hueColor(0.92);
  ictx.strokeStyle = hueColor(0.92);
  ictx.lineWidth = 2;
  drawBrushShape(p, 10);
  ictx.restore();
}
function drawBrushShape(p, size) {
  if (brush === 0) {
    ictx.beginPath();
    ictx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ictx.fill();
  }
  if (brush === 1) {
    ictx.save();
    ictx.translate(p.x, p.y);
    ictx.rotate(Math.PI / 4);
    ictx.fillRect(-size, -size, size * 2, size * 2);
    ictx.restore();
  }
  if (brush === 2) star(p, size);
}
function holdMark() {
  if (!drawing || !holding || !last) return;
  dirty = true;
  const age = Math.min(1, (performance.now() - downAt) / 1200);
  if (erasing) {
    ictx.save();
    ictx.fillStyle = backgroundColor;
    ictx.beginPath();
    ictx.arc(last.x, last.y, 15 + age * 30, 0, Math.PI * 2);
    ictx.fill();
    ictx.restore();
    return;
  }
  ictx.save();
  ictx.fillStyle = hueColor(0.1);
  drawBrushShape(last, 5 + age * 40);
  ictx.restore();
}

function tool(ctx, p, kind) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (kind === "color") {
    if (hue === -2) {
      ctx.fillStyle = "#090a09";
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#f5f7f2";
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, 7);
      ctx.fill();
    } else {
      const g = ctx.createRadialGradient(-5, -6, 1, 0, 0, p.r);
      g.addColorStop(0, "#fff8");
      g.addColorStop(0.25, hue === -1 ? "#343735" : `hsl(${hue} 100% 68%)`);
      g.addColorStop(
        1,
        hue === -1 ? "#0c0d0c" : `hsl(${(hue + 65) % 360} 80% 42%)`,
      );
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, 7);
      ctx.fill();
    }
  }
  if (kind === "brush") {
    ctx.fillStyle = "#090a09";
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, 7);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.95;
    if (brush === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, 7);
      ctx.stroke();
    }
    if (brush === 1) {
      ctx.rotate(0.78);
      ctx.strokeRect(-7, -7, 14, 14);
    }
    if (brush === 2) {
      ctx.rotate(-Math.PI / 2);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 ? 4 : 10,
          angle = (i * Math.PI) / 5;
        i
          ? ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius)
          : ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, 7);
    ctx.stroke();
  }
  if (kind === "paintType") {
    ctx.fillStyle = "#090a09";
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, 7);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.92;
    if (paintType === 0) {
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(9, 0);
      ctx.stroke();
    }
    if (paintType === 1) {
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * 8, Math.sin(angle) * 8, 1.35, 0, 7);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 1.5, 0, 7);
      ctx.fill();
    }
    if (paintType === 2) {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-9, i * 5);
        ctx.quadraticCurveTo(0, i * 5 - 3, 9, i * 5);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, 7);
    ctx.stroke();
  }
  if (kind === "flood") {
    ctx.fillStyle = "#090a09";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, 7);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 4, 0, 7);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = hue === -1 ? "#ffffff" : hueColor();
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}
function render() {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(ink, 0, 0, width, height);
  drawTexts();
  holdMark();
  const objects = [
    [field.color(), "color"],
    [field.brush(), "brush"],
    [field.paintType(), "paintType"],
    [field.flood(), "flood"],
  ];
  objects.forEach(([p, k]) => tool(ctx, p, k));
  ripples = ripples.filter((r) => r.life-- > 0);
  ripples.forEach((r) => {
    ctx.strokeStyle = `hsla(${r.h},100%,72%,${r.life / 30})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r + (26 - r.life) * 1.7, 0, 7);
    ctx.stroke();
  });
}
resize();
function animate() {
  render();
  requestAnimationFrame(animate);
}
animate();

undoButton.addEventListener("click", undo);
clearButton.addEventListener("click", clearCanvas);
eraserButton.addEventListener("click", () => {
  erasing = !erasing;
  eraserButton.setAttribute("aria-pressed", String(erasing));
  canvas.style.cursor = erasing ? "not-allowed" : "crosshair";
});
textToolButton.addEventListener("click", () => {
  const opening = textEntry.hidden;
  textEntry.hidden = !opening;
  textToolButton.setAttribute("aria-expanded", String(opening));
  if (opening) textInput.focus();
});
textEntry.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = textInput.value.trim();
  if (!text) {
    textInput.focus();
    return;
  }
  addText(text);
  textEntry.reset();
  textEntry.hidden = true;
  textToolButton.setAttribute("aria-expanded", "false");
});
addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo();
  }
  if (event.key === "Escape" && !textEntry.hidden) {
    textEntry.hidden = true;
    textToolButton.setAttribute("aria-expanded", "false");
    textToolButton.focus();
  }
});
