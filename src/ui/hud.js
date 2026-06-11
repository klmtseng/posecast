// HUD:狀態列 + FPS + 偵測指示;控制列按鈕由 main.js 依模式註冊
export function createHUD() {
  const hudEl = document.getElementById('hud');
  const controlsEl = document.getElementById('controls');

  let status = '';
  let statusClass = 'ok';
  let frames = 0;
  let fps = 0;
  let lastT = performance.now();
  let detectOk = null;

  function render() {
    hudEl.innerHTML =
      `<div>FPS <b>${fps}</b>` +
      (detectOk === null ? '' : detectOk
        ? ' · 骨架 <span class="ok">●</span>'
        : ' · 骨架 <span class="warn">○ 未偵測到</span>') +
      `</div><div class="${statusClass}">${status}</div>`;
  }

  return {
    setStatus(text, cls = 'ok') { status = text; statusClass = cls; render(); },
    tickDetect(ok) { if (ok !== detectOk) { detectOk = ok; render(); } },
    tickFrame() {
      frames++;
      const now = performance.now();
      if (now - lastT >= 1000) {
        fps = Math.round((frames * 1000) / (now - lastT));
        frames = 0; lastT = now; render();
      }
    },
    setControls(buttons) {
      controlsEl.innerHTML = '';
      for (const b of buttons) {
        const el = document.createElement('button');
        el.className = 'ctl' + (b.primary ? ' primary' : '');
        el.textContent = b.label;
        el.onclick = b.onClick;
        controlsEl.appendChild(el);
      }
    },
  };
}

export function showLoading(text) {
  document.getElementById('loading').style.display = text ? 'flex' : 'none';
  if (text) document.getElementById('loading-text').textContent = text;
}
