import { createStage } from './scene/stage.js';
import { loadVRM, disposeVRM } from './avatar/vrmLoader.js';
import { Retargeter } from './avatar/retarget.js';
import { createPhotoMode } from './modes/photoMode.js';
import { createLiveMode } from './modes/liveMode.js';
import { createHUD, showLoading } from './ui/hud.js';

const menuEl = document.getElementById('menu');
const appEl = document.getElementById('app');
const videoEl = document.getElementById('preview');
const fileVrm = document.getElementById('file-vrm');
const filePhoto = document.getElementById('file-photo');
const fileVideo = document.getElementById('file-video');

let customVrmFile = null;
let session = null; // { stage, vrm, mode, hud }
let demoVideo = null; // ?demo=video 時自動用測試影片啟動全身模式

if (new URLSearchParams(location.search).get('demo') === 'video') {
  demoVideo = '/test-assets/pose-video.mp4';
  queueMicrotask(() => start('full'));
}

// ===== 模式選擇畫面 =====
document.querySelectorAll('.card').forEach((card) => {
  card.onclick = () => start(card.dataset.mode);
});
document.getElementById('pick-vrm').onclick = () => fileVrm.click();
fileVrm.onchange = () => {
  if (fileVrm.files[0]) setCustomVrm(fileVrm.files[0]);
};

function setCustomVrm(file) {
  customVrmFile = file;
  document.getElementById('vrm-status').textContent = `自訂角色:${file.name}`;
}

// 拖放 .vrm
const dropHint = document.getElementById('drop-hint');
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropHint.style.display = 'flex';
});
window.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) dropHint.style.display = 'none';
});
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropHint.style.display = 'none';
  const file = [...e.dataTransfer.files].find((f) => f.name.toLowerCase().endsWith('.vrm'));
  if (!file) return;
  setCustomVrm(file);
  if (session) {
    const old = session.vrm;
    const vrm = await loadVRM(file);
    session.stage.scene.add(vrm.scene);
    session.retargeter.vrm = vrm;
    session.vrm = vrm;
    disposeVRM(old);
  }
});

// ===== 啟動模式 =====
async function start(modeName) {
  const quality = document.getElementById('quality').value;
  menuEl.style.display = 'none';
  appEl.style.display = 'block';
  showLoading('準備場景與角色…');

  try {
    const stage = createStage(appEl);
    const hud = createHUD();
    const vrm = await loadVRM(customVrmFile || '/models/sample.vrm');
    stage.scene.add(vrm.scene);
    const retargeter = new Retargeter(vrm);

    showLoading('載入偵測模型…');
    let mode;
    if (modeName === 'photo') {
      mode = await createPhotoMode({ quality, retargeter, hud });
      hud.setControls([
        { label: '📷 選照片/拍照', primary: true, onClick: () => filePhoto.click() },
        { label: '💾 匯出截圖', onClick: () => download(stage.screenshot(), 'posecast.png') },
        { label: '📄 姿勢 JSON', onClick: () => {
            const blob = mode.exportPoseJSON();
            if (blob) download(URL.createObjectURL(blob), 'pose.json');
            else hud.setStatus('還沒有姿勢可匯出,先選一張照片', 'warn');
          } },
        { label: '← 返回', onClick: backToMenu },
      ]);
      hud.setStatus('選一張人物照片開始');
      filePhoto.onchange = async () => {
        if (filePhoto.files[0]) { await mode.processFile(filePhoto.files[0]); filePhoto.value = ''; }
      };
    } else {
      const overlayEl = document.getElementById('overlay');
      mode = await createLiveMode({ kind: modeName, quality, retargeter, hud, videoEl, overlayEl });
      hud.setControls([
        { label: '🔄 切換鏡頭', onClick: () => mode.useCamera(mode.facingMode === 'user' ? 'environment' : 'user') },
        { label: '🦴 骨架線', onClick: () => mode.toggleOverlay() },
        { label: '🎬 選擇影片', onClick: () => fileVideo.click() },
        { label: '📹 使用鏡頭', primary: true, onClick: () => mode.useCamera('user') },
        { label: '← 返回', onClick: backToMenu },
      ]);
      fileVideo.onchange = async () => {
        if (fileVideo.files[0]) { await mode.useVideo(fileVideo.files[0]); fileVideo.value = ''; }
      };
      if (demoVideo) {
        await mode.useVideo(demoVideo);   // ?demo=video:無鏡頭環境的演示/驗收路徑
        demoVideo = null;
      } else {
        // 預設嘗試開鏡頭;失敗會提示改用影片
        await mode.useCamera('user');
      }
    }

    session = { stage, vrm, mode, hud, retargeter };
    stage.onFrame = (delta) => {
      mode.onFrame(delta);
      vrm.update(delta);
      hud.tickFrame();
    };
  } catch (e) {
    console.error(e);
    alert(`啟動失敗:${e.message}`);
    backToMenu();
    return;
  } finally {
    showLoading(null);
  }
}

function backToMenu() {
  if (session) {
    session.mode.stop();
    disposeVRM(session.vrm);
    session.stage.dispose();
    session = null;
  }
  videoEl.style.display = 'none';
  appEl.style.display = 'none';
  menuEl.style.display = 'flex';
}

function download(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

// ===== 煙霧測試(?smoke=1):無頭瀏覽器驗收用 =====
if (new URLSearchParams(location.search).has('smoke')) {
  (async () => {
    const report = { steps: [], ok: false };
    const step = (name, ok, info = '') => report.steps.push({ name, ok, info });
    const beacon = (path, data) =>
      fetch(`http://localhost:8787/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).catch(() => {});
    await beacon('boot', { ua: navigator.userAgent });
    window.addEventListener('error', (e) => beacon('error', { msg: String(e.message), src: e.filename, line: e.lineno }));
    window.addEventListener('unhandledrejection', (e) => beacon('error', { msg: String(e.reason?.stack || e.reason) }));
    try {
      const stage = createStage(appEl);
      appEl.style.display = 'block';
      menuEl.style.display = 'none';
      step('three.js stage', true, stage.renderer.getContext() ? 'WebGL OK' : 'no ctx');

      const vrm = await loadVRM('/models/sample.vrm');
      stage.scene.add(vrm.scene);
      step('VRM 載入', !!vrm.humanoid, `metaVersion=${vrm.meta?.metaVersion}, hips=${!!vrm.humanoid?.getNormalizedBoneNode('hips')}`);

      const { createPoseDetector } = await import('./capture/detector.js');
      const { solvePose, Retargeter } = await import('./avatar/retarget.js');
      const { loadPhotoFromURL } = await import('./capture/sources.js');
      const detector = await createPoseDetector({ quality: 'lite', mode: 'IMAGE' });
      step('MediaPipe 初始化', true);

      const photo = await loadPhotoFromURL('/test-assets/pose.jpg');
      const result = detector.detect(photo.element);
      const n = result?.landmarks?.[0]?.length || 0;
      step('照片骨架偵測', n === 33, `${n} landmarks`);

      const rig = solvePose(result, photo.size);
      step('Kalidokit 求解', !!rig?.RightUpperArm, rig ? `hips.rot=${JSON.stringify(rig.Hips.rotation)}` : 'null');

      const rt = new Retargeter(vrm);
      for (let i = 0; i < 30; i++) rt.applyPose(rig);
      vrm.update(1 / 60);
      const arm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
      const moved = Math.abs(arm.quaternion.x) + Math.abs(arm.quaternion.y) + Math.abs(arm.quaternion.z) > 0.01;
      step('姿勢套用到 VRM', moved, `rightUpperArm quat=[${arm.quaternion.toArray().map((v) => v.toFixed(3)).join(',')}]`);

      // 持續套用讓渲染迴圈跑幾幀,再截圖供視覺比對
      stage.onFrame = (d) => { rt.applyPose(rig); vrm.update(d); };
      await new Promise((r) => setTimeout(r, 1200));
      await beacon('shot', { dataURL: stage.screenshot() });
      step('截圖回傳', true);

      // 影片路徑驗證(M3):逐幀 detectForVideo 5 秒,統計偵測率與 FPS
      const videoDetector = await createPoseDetector({ quality: 'lite', mode: 'VIDEO' });
      const { createOverlay } = await import('./ui/overlay.js');
      const v = document.getElementById('preview');
      const overlay = createOverlay(document.getElementById('overlay'), v);
      v.src = '/test-assets/pose-video.mp4';
      v.loop = true; v.muted = true;
      v.style.display = 'block';
      await v.play();
      let frames = 0, hits = 0, lastT = -1;
      const t0 = performance.now();
      stage.onFrame = (d) => {
        if (v.currentTime === lastT) return;
        lastT = v.currentTime;
        frames++;
        const r = videoDetector.detectForVideo(v, performance.now());
        const vrig = solvePose(r, { width: v.videoWidth, height: v.videoHeight });
        if (vrig) { hits++; rt.applyPose(vrig); }
        overlay.draw(r, null);
        vrm.update(d);
      };
      await new Promise((r) => setTimeout(r, 5000));
      stage.onFrame = null;
      const secs = (performance.now() - t0) / 1000;
      videoDetector.close();
      step('影片逐幀動捕', hits > 20 && hits / frames > 0.9,
        `${frames} frames, ${hits} detections, ${(frames / secs).toFixed(1)} det-fps`);

      // overlay 有真的畫出骨架像素
      const oc = document.getElementById('overlay');
      const px = oc.getContext('2d').getImageData(0, 0, oc.width, oc.height).data;
      let drawn = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 0) drawn++;
      step('骨架疊加層繪製', drawn > 100, `${drawn} px drawn on ${oc.width}x${oc.height}`);

      report.ok = report.steps.every((s) => s.ok);
    } catch (e) {
      step('exception', false, String(e?.stack || e));
    }
    document.title = report.ok ? 'SMOKE_OK' : 'SMOKE_FAIL';
    try {
      await fetch('http://localhost:8787/smoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
    } catch { /* beacon server 沒開也沒關係 */ }
    console.log('SMOKE_REPORT', JSON.stringify(report, null, 2));
  })();
}
