const imageInput = document.getElementById("imageInput");
const dropzone = document.getElementById("dropzone");
const chooseBtn = document.getElementById("chooseBtn");
const previewWrap = document.getElementById("previewWrap");
const fileName = document.getElementById("fileName");
const canvas = document.getElementById("imageCanvas");
const ctx = canvas.getContext("2d");
const emptyAnalysis = document.getElementById("emptyAnalysis");
const analysisContent = document.getElementById("analysisContent");
const reviewBadge = document.getElementById("reviewBadge");
const removeBtn = document.getElementById("removeBtn");
const undoBtn = document.getElementById("undoBtn");
const downloadBtn = document.getElementById("downloadBtn");
const toolHint = document.getElementById("toolHint");

let sourceImage = null;
let activeTool = "blur";
let masks = [];
let drawing = false;
let startPoint = null;
let currentMask = null;

function openPicker() { imageInput.click(); }
dropzone.addEventListener("click", (event) => {
  if (!event.target.closest("button")) openPicker();
});
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openPicker(); }
});
chooseBtn.addEventListener("click", (event) => { event.stopPropagation(); openPicker(); });
imageInput.addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  if (file) loadImage(file);
});
["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, event => {
  event.preventDefault(); dropzone.classList.add("dragover");
}));
["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, event => {
  event.preventDefault(); dropzone.classList.remove("dragover");
}));
dropzone.addEventListener("drop", event => {
  const file = event.dataTransfer.files[0];
  if (file) loadImage(file);
});

function loadImage(file) {
  if (!file.type.startsWith("image/")) { alert("Please choose an image file."); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      masks = [];
      const maxSide = 1100;
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      fileName.textContent = file.name;
      dropzone.classList.add("hidden");
      previewWrap.classList.remove("hidden");
      emptyAnalysis.classList.add("hidden");
      analysisContent.classList.remove("hidden");
      reviewBadge.textContent = "MANUAL REVIEW";
      reviewBadge.title = "This prototype does not run automated AI detection.";
      document.getElementById("riskLevel").textContent = "Review required";
      document.getElementById("riskScore").textContent = "—";
      document.getElementById("riskMeter").style.width = "0%";
      renderCanvas();
      updateControls();
    };
    img.onerror = () => alert("This image could not be opened.");
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function renderCanvas() {
  if (!sourceImage) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
  masks.forEach(drawMask);
  if (currentMask) drawMask(currentMask);
}
function drawMask(mask) {
  const x = Math.min(mask.x1, mask.x2), y = Math.min(mask.y1, mask.y2);
  const w = Math.abs(mask.x2 - mask.x1), h = Math.abs(mask.y2 - mask.y1);
  if (w < 1 || h < 1) return;
  if (mask.tool === "solid") {
    ctx.fillStyle = "#17231c"; ctx.fillRect(x, y, w, h);
  } else if (mask.tool === "pixelate") {
    const sampleW = Math.max(1, Math.ceil(w / 12)), sampleH = Math.max(1, Math.ceil(h / 12));
    const temp = document.createElement("canvas");
    temp.width = sampleW; temp.height = sampleH;
    const tctx = temp.getContext("2d");
    tctx.drawImage(sourceImage, x / (canvas.width / sourceImage.naturalWidth), y / (canvas.height / sourceImage.naturalHeight),
      w / (canvas.width / sourceImage.naturalWidth), h / (canvas.height / sourceImage.naturalHeight), 0, 0, sampleW, sampleH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(temp, 0, 0, sampleW, sampleH, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = "rgba(30,45,35,.12)"; ctx.fillRect(x, y, w, h);
  } else {
    const scaleX = sourceImage.naturalWidth / canvas.width;
    const scaleY = sourceImage.naturalHeight / canvas.height;
    const pad = Math.max(5, Math.round(Math.min(w, h) * .08));
    const sx = Math.max(0, (x - pad) * scaleX), sy = Math.max(0, (y - pad) * scaleY);
    const sw = Math.min(sourceImage.naturalWidth - sx, (w + pad * 2) * scaleX);
    const sh = Math.min(sourceImage.naturalHeight - sy, (h + pad * 2) * scaleY);
    const blurCanvas = document.createElement("canvas");
    blurCanvas.width = Math.max(1, Math.round(sw)); blurCanvas.height = Math.max(1, Math.round(sh));
    const bctx = blurCanvas.getContext("2d");
    bctx.filter = "blur(12px)";
    bctx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, blurCanvas.width, blurCanvas.height);
    ctx.drawImage(blurCanvas, sx / scaleX, sy / scaleY, sw / scaleX, sh / scaleY);
  }
  ctx.save();
  ctx.strokeStyle = mask.tool === "solid" ? "rgba(255,255,255,.7)" : "rgba(119,157,76,.95)";
  ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.strokeRect(x, y, w, h); ctx.restore();
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * canvas.width / rect.width,
           y: (event.clientY - rect.top) * canvas.height / rect.height };
}
canvas.addEventListener("pointerdown", event => {
  if (!sourceImage) return;
  drawing = true; canvas.setPointerCapture(event.pointerId);
  startPoint = pointerPosition(event);
  currentMask = { x1: startPoint.x, y1: startPoint.y, x2: startPoint.x, y2: startPoint.y, tool: activeTool };
});
canvas.addEventListener("pointermove", event => {
  if (!drawing || !currentMask) return;
  const point = pointerPosition(event);
  currentMask.x2 = point.x; currentMask.y2 = point.y;
  renderCanvas();
});
function finishMask() {
  if (!drawing || !currentMask) return;
  drawing = false;
  const area = Math.abs(currentMask.x2 - currentMask.x1) * Math.abs(currentMask.y2 - currentMask.y1);
  if (area > 30) masks.push(currentMask);
  currentMask = null;
  renderCanvas(); updateControls();
}
canvas.addEventListener("pointerup", finishMask);
canvas.addEventListener("pointercancel", finishMask);

document.querySelectorAll(".tool").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".tool").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  activeTool = button.dataset.tool;
  const labels = { blur: "Blur selected areas by dragging over the image.", pixelate: "Pixelate selected areas by dragging over the image.", solid: "Cover selected areas with a solid mask by dragging." };
  toolHint.textContent = labels[activeTool];
}));
function updateControls() {
  undoBtn.disabled = masks.length === 0;
  downloadBtn.disabled = !sourceImage || masks.length === 0;
}
undoBtn.addEventListener("click", () => { masks.pop(); renderCanvas(); updateControls(); });
removeBtn.addEventListener("click", reset);
function reset() {
  sourceImage = null; masks = []; currentMask = null; drawing = false;
  imageInput.value = "";
  previewWrap.classList.add("hidden"); dropzone.classList.remove("hidden");
  analysisContent.classList.add("hidden"); emptyAnalysis.classList.remove("hidden");
  reviewBadge.textContent = "WAITING";
  updateControls();
}
downloadBtn.addEventListener("click", () => {
  if (!sourceImage || !masks.length) return;
  // Export the already-rendered canvas, including all visible masks.
  canvas.toBlob(blob => {
    if (!blob) { alert("Export failed. Please try another image."); return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "privylens-protected.png";
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
});
