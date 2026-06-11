import { createPoseDetector, createFaceDetector } from '../capture/detector.js';
import { solvePose, solveFace } from '../avatar/retarget.js';
import { openWebcam, openVideoFile } from '../capture/sources.js';

// 即時模式共用核心:upper(臉+上半身)與 full(全身)只差在偵測器組合與套用範圍
export async function createLiveMode({ kind, quality, retargeter, hud, videoEl }) {
  const useFace = kind === 'upper';
  const useLegs = kind === 'full';

  hud.setStatus('載入偵測模型…');
  const pose = await createPoseDetector({ quality, mode: 'VIDEO' });
  const face = useFace ? await createFaceDetector({ mode: 'VIDEO' }) : null;

  let source = null;
  let active = true;
  let lastVideoTime = -1;

  async function useCamera(facingMode = 'user') {
    source?.stop();
    hud.setStatus('開啟鏡頭…');
    try {
      source = await openWebcam(videoEl, facingMode);
      videoEl.style.display = 'block';
      videoEl.classList.toggle('rear', facingMode === 'environment');
      hud.setStatus(`✅ 鏡頭已開啟(${facingMode === 'user' ? '前' : '後'}鏡頭)`);
    } catch (e) {
      hud.setStatus(`⚠️ 無法開啟鏡頭:${e.message}。可改用「選擇影片」`, 'warn');
      source = null;
    }
    return source;
  }

  async function useVideo(file) {
    source?.stop();
    source = await openVideoFile(videoEl, file);
    videoEl.style.display = 'block';
    videoEl.classList.add('rear'); // 影片檔不鏡像
    hud.setStatus('✅ 影片播放中,開始動捕');
    return source;
  }

  function onFrame() {
    if (!active || !source) return;
    const v = source.element;
    if (v.readyState < 2 || v.currentTime === lastVideoTime) return;
    lastVideoTime = v.currentTime;
    const ts = performance.now();

    const poseResult = pose.detectForVideo(v, ts);
    const rig = solvePose(poseResult, source.size);
    if (rig) {
      retargeter.applyPose(rig, { legs: useLegs, hips: useLegs });
      hud.tickDetect(true);
    } else {
      hud.tickDetect(false);
    }

    if (face) {
      const faceResult = face.detectForVideo(v, ts + 0.001);
      const faceRig = solveFace(faceResult, source.size);
      if (faceRig) retargeter.applyFace(faceRig);
    }
  }

  return {
    name: kind,
    useCamera,
    useVideo,
    get facingMode() { return source?.facingMode; },
    onFrame,
    stop() {
      active = false;
      source?.stop();
      videoEl.style.display = 'none';
      pose.close();
      face?.close();
    },
  };
}
