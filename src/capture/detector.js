import { FilesetResolver, PoseLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';

let fileset = null;
async function getFileset() {
  if (!fileset) fileset = await FilesetResolver.forVisionTasks('/wasm');
  return fileset;
}

// delegate GPU 失敗時自動退回 CPU(本機 WebGL 環境不穩)
async function createWithFallback(factory, options) {
  try {
    return await factory({ ...options, delegate: 'GPU' });
  } catch (e) {
    console.warn('[detector] GPU delegate 失敗,改用 CPU:', e?.message || e);
    return await factory({ ...options, delegate: 'CPU' });
  }
}

export async function createPoseDetector({ quality = 'lite', mode = 'VIDEO' } = {}) {
  const fs = await getFileset();
  const modelAssetPath = `/models/pose_landmarker_${quality === 'full' ? 'full' : 'lite'}.task`;
  return createWithFallback(
    (base) => PoseLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath, delegate: base.delegate },
      runningMode: mode,
      numPoses: 1,
    }),
    {}
  );
}

export async function createFaceDetector({ mode = 'VIDEO' } = {}) {
  const fs = await getFileset();
  return createWithFallback(
    (base) => FaceLandmarker.createFromOptions(fs, {
      baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: base.delegate },
      runningMode: mode,
      numFaces: 1,
    }),
    {}
  );
}
