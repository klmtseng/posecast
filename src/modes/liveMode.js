import { createPoseDetector, createFaceDetector, createHandDetector } from '../capture/detector.js';
import { solvePose, solveFace, solveHands, computeGates } from '../avatar/retarget.js';
import { openWebcam, openVideoFile } from '../capture/sources.js';
import { createOverlay } from '../ui/overlay.js';

// 目標完全消失超過此偵測幀數後,整體緩慢回歸自然站姿
const LOST_FRAMES_BEFORE_DECAY = 20;

// 即時模式共用核心:upper(臉+上半身+手指)與 full(全身)只差在偵測器組合與套用範圍
export async function createLiveMode({ kind, quality, retargeter, hud, videoEl, overlayEl }) {
  const useFace = kind === 'upper';
  const useHands = kind === 'upper';
  const useLegs = kind === 'full';
  const overlay = overlayEl ? createOverlay(overlayEl, videoEl) : null;

  hud.setStatus('載入偵測模型…');
  const pose = await createPoseDetector({ quality, mode: 'VIDEO' });
  const face = useFace ? await createFaceDetector({ mode: 'VIDEO' }) : null;
  const hands = useHands ? await createHandDetector({ mode: 'VIDEO' }) : null;

  let source = null;
  let active = true;
  let lastVideoTime = -1;
  let lostFrames = 0;

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
      lostFrames = 0;
      // 信心度閘門:出鏡/被遮擋的肢段回歸自然垂放,而不是吃雜訊抖動
      const gates = computeGates(poseResult);
      retargeter.applyPose(rig, { legs: useLegs, hips: useLegs, gates });
      hud.tickDetect(true);
    } else {
      // 整個人消失:先凍結一小段,再整體回歸自然站姿
      if (++lostFrames > LOST_FRAMES_BEFORE_DECAY) retargeter.decayAll();
      hud.tickDetect(false);
    }

    let faceResult = null;
    if (face) {
      faceResult = face.detectForVideo(v, ts + 0.001);
      const faceRig = solveFace(faceResult, source.size);
      if (faceRig) retargeter.applyFace(faceRig);
    }

    let handResult = null;
    if (hands) {
      handResult = hands.detectForVideo(v, ts + 0.002);
      const handRigs = solveHands(handResult);
      retargeter.applyHand('Left', handRigs.Left, rig);
      retargeter.applyHand('Right', handRigs.Right, rig);
    }

    overlay?.draw(poseResult, faceResult, handResult);
  }

  return {
    name: kind,
    useCamera,
    useVideo,
    get facingMode() { return source?.facingMode; },
    toggleOverlay: () => overlay?.toggle(),
    onFrame,
    stop() {
      active = false;
      source?.stop();
      videoEl.style.display = 'none';
      overlay?.hide();
      pose.close();
      face?.close();
      hands?.close();
    },
  };
}
