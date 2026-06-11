// 相機預覽上的即時骨架疊加層:畫 33 點姿態骨架 + 臉部關鍵點
const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],          // 肩臂
  [11, 23], [12, 24], [23, 24],                              // 軀幹
  [23, 25], [25, 27], [24, 26], [26, 28],                    // 腿
  [27, 29], [29, 31], [28, 30], [30, 32],                    // 腳
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10], // 頭
];

export function createOverlay(canvasEl, videoEl) {
  const ctx = canvasEl.getContext('2d');
  let visible = true;

  function syncSize() {
    if (canvasEl.width !== videoEl.videoWidth || canvasEl.height !== videoEl.videoHeight) {
      canvasEl.width = videoEl.videoWidth || 320;
      canvasEl.height = videoEl.videoHeight || 240;
    }
    // 跟著預覽視窗的位置與鏡像狀態
    canvasEl.style.display = (visible && videoEl.style.display !== 'none') ? 'block' : 'none';
    canvasEl.className = videoEl.className;
  }

  function draw(poseResult, faceResult) {
    syncSize();
    const { width: w, height: h } = canvasEl;
    ctx.clearRect(0, 0, w, h);
    if (!visible) return;

    const lm = poseResult?.landmarks?.[0];
    if (lm) {
      ctx.strokeStyle = 'rgba(91,140,255,0.95)';
      ctx.lineWidth = Math.max(2, w / 240);
      ctx.beginPath();
      for (const [a, b] of POSE_CONNECTIONS) {
        if ((lm[a].visibility ?? 1) < 0.4 || (lm[b].visibility ?? 1) < 0.4) continue;
        ctx.moveTo(lm[a].x * w, lm[a].y * h);
        ctx.lineTo(lm[b].x * w, lm[b].y * h);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(111,194,138,0.95)';
      const r = Math.max(2.5, w / 200);
      for (const p of lm) {
        if ((p.visibility ?? 1) < 0.4) continue;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const face = faceResult?.faceLandmarks?.[0];
    if (face) {
      ctx.fillStyle = 'rgba(232,179,90,0.8)';
      for (let i = 0; i < face.length; i += 6) {
        ctx.fillRect(face[i].x * w - 0.5, face[i].y * h - 0.5, 1.5, 1.5);
      }
    }
  }

  return {
    draw,
    clear() { ctx.clearRect(0, 0, canvasEl.width, canvasEl.height); },
    toggle() { visible = !visible; syncSize(); return visible; },
    hide() { canvasEl.style.display = 'none'; },
  };
}
