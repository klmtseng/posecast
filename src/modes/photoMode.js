import { createPoseDetector } from '../capture/detector.js';
import { solvePose } from '../avatar/retarget.js';
import { loadPhoto } from '../capture/sources.js';

// 照片模式:單張偵測 → 角色擺姿勢 → 可匯出截圖/姿勢 JSON
export async function createPhotoMode({ quality, retargeter, hud }) {
  hud.setStatus('載入姿態模型…');
  const detector = await createPoseDetector({ quality, mode: 'IMAGE' });
  let currentRig = null;
  let active = true;

  async function processFile(file) {
    hud.setStatus('偵測骨架中…');
    const photo = await loadPhoto(file);
    try {
      const result = detector.detect(photo.element);
      const rig = solvePose(result, photo.size);
      if (!rig) { hud.setStatus('⚠️ 照片裡偵測不到人物骨架', 'warn'); return false; }
      currentRig = rig;
      hud.setStatus(`✅ 偵測到 ${result.landmarks[0].length} 個骨架點,姿勢已套用`);
      return true;
    } finally {
      photo.stop();
    }
  }

  return {
    name: 'photo',
    processFile,
    // 每幀重複套用,讓骨骼 lerp 平滑收斂到目標姿勢
    onFrame() {
      if (active && currentRig) retargeter.applyPose(currentRig, { legs: true, hips: true });
    },
    exportPoseJSON() {
      if (!currentRig) return null;
      return new Blob([JSON.stringify(currentRig, null, 2)], { type: 'application/json' });
    },
    stop() { active = false; detector.close(); },
  };
}
