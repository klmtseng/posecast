import * as THREE from 'three';

// 動作錄製器:每幀同時記 normalized(給 BVH/JSON,humanoid 標準空間)
// 與 raw(給 GLB,模型實際骨骼)兩套四元數 + hips 位移
const MIN_DT = 1 / 60;
const SMOOTH_ALPHA = 0.55; // 離線零相位平滑(正反各一次,無延遲)

export function createRecorder(vrm) {
  const humanoid = vrm.humanoid;
  const boneNames = Object.keys(humanoid?.humanBones || {}).filter(
    (n) => humanoid.getNormalizedBoneNode(n) && humanoid.getRawBoneNode(n)
  );
  const nNodes = boneNames.map((n) => humanoid.getNormalizedBoneNode(n));
  const rNodes = boneNames.map((n) => humanoid.getRawBoneNode(n));
  const hipsN = humanoid.getNormalizedBoneNode('hips');
  const hipsR = humanoid.getRawBoneNode('hips');

  const frames = [];
  let t0 = null;
  let lastT = -Infinity;
  let recording = true;

  function capture() {
    if (!recording) return;
    const now = performance.now() / 1000;
    if (t0 === null) t0 = now;
    const t = now - t0;
    if (t - lastT < MIN_DT) return;
    lastT = t;
    const nq = new Float32Array(boneNames.length * 4);
    const rq = new Float32Array(boneNames.length * 4);
    for (let i = 0; i < boneNames.length; i++) {
      nNodes[i].quaternion.toArray(nq, i * 4);
      rNodes[i].quaternion.toArray(rq, i * 4);
    }
    frames.push({
      t, nq, rq,
      np: hipsN.position.toArray(),
      rp: hipsR.position.toArray(),
    });
  }

  // 重採樣到固定 fps + 離線零相位平滑
  function resample(fps = 30, space = 'normalized') {
    if (frames.length < 2) throw new Error('錄製太短,至少需要 2 幀');
    const dur = frames[frames.length - 1].t;
    const n = Math.max(2, Math.floor(dur * fps) + 1);
    const key = space === 'raw' ? 'rq' : 'nq';
    const posKey = space === 'raw' ? 'rp' : 'np';

    const times = new Float32Array(n);
    const quats = boneNames.map(() => new Float32Array(n * 4));
    const hipsPos = new Float32Array(n * 3);

    const qa = new THREE.Quaternion();
    const qb = new THREE.Quaternion();
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = i / fps;
      times[i] = t;
      while (j < frames.length - 2 && frames[j + 1].t < t) j++;
      const A = frames[j];
      const B = frames[Math.min(j + 1, frames.length - 1)];
      const a = Math.min(Math.max((t - A.t) / Math.max(B.t - A.t, 1e-6), 0), 1);
      for (let b = 0; b < boneNames.length; b++) {
        qa.fromArray(A[key], b * 4);
        qb.fromArray(B[key], b * 4);
        qa.slerp(qb, a).toArray(quats[b], i * 4);
      }
      for (let c = 0; c < 3; c++) hipsPos[i * 3 + c] = A[posKey][c] + (B[posKey][c] - A[posKey][c]) * a;
    }

    for (const q of quats) smoothQuatTrack(q, n);
    smoothVecTrack(hipsPos, n);
    return { times, boneNames: [...boneNames], quats, hipsPos, fps, duration: dur };
  }

  return {
    capture,
    resample,
    stop() { recording = false; },
    get recording() { return recording; },
    get frameCount() { return frames.length; },
    get duration() { return frames.length ? frames[frames.length - 1].t : 0; },
  };
}

// 零相位平滑:EMA 正掃一次、反掃一次,延遲互相抵消(離線匯出才能用的待遇)
function smoothQuatTrack(q, n) {
  // 先做半球對齊,避免 q 與 -q 之間插出翻轉
  for (let i = 1; i < n; i++) {
    let dot = 0;
    for (let c = 0; c < 4; c++) dot += q[i * 4 + c] * q[(i - 1) * 4 + c];
    if (dot < 0) for (let c = 0; c < 4; c++) q[i * 4 + c] *= -1;
  }
  emaPass(q, n, 4, false);
  emaPass(q, n, 4, true);
  for (let i = 0; i < n; i++) {
    let len = 0;
    for (let c = 0; c < 4; c++) len += q[i * 4 + c] ** 2;
    len = Math.sqrt(len) || 1;
    for (let c = 0; c < 4; c++) q[i * 4 + c] /= len;
  }
}

function smoothVecTrack(v, n) {
  emaPass(v, n, 3, false);
  emaPass(v, n, 3, true);
}

function emaPass(arr, n, stride, backward) {
  const start = backward ? n - 2 : 1;
  const end = backward ? -1 : n;
  const step = backward ? -1 : 1;
  for (let i = start; i !== end; i += step) {
    for (let c = 0; c < stride; c++) {
      arr[i * stride + c] =
        SMOOTH_ALPHA * arr[i * stride + c] + (1 - SMOOTH_ALPHA) * arr[(i - step) * stride + c];
    }
  }
}
