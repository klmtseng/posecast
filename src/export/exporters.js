import * as THREE from 'three';

// ===== VRM humanoid 標準父子關係(BVH 骨架重建用) =====
const VRM_PARENT = {
  hips: null, spine: 'hips', chest: 'spine', upperChest: 'chest', neck: 'upperChest', head: 'neck',
  leftEye: 'head', rightEye: 'head', jaw: 'head',
  leftShoulder: 'upperChest', leftUpperArm: 'leftShoulder', leftLowerArm: 'leftUpperArm', leftHand: 'leftLowerArm',
  rightShoulder: 'upperChest', rightUpperArm: 'rightShoulder', rightLowerArm: 'rightUpperArm', rightHand: 'rightLowerArm',
  leftUpperLeg: 'hips', leftLowerLeg: 'leftUpperLeg', leftFoot: 'leftLowerLeg', leftToes: 'leftFoot',
  rightUpperLeg: 'hips', rightLowerLeg: 'rightUpperLeg', rightFoot: 'rightLowerLeg', rightToes: 'rightFoot',
  leftThumbMetacarpal: 'leftHand', leftThumbProximal: 'leftThumbMetacarpal', leftThumbDistal: 'leftThumbProximal',
  leftIndexProximal: 'leftHand', leftIndexIntermediate: 'leftIndexProximal', leftIndexDistal: 'leftIndexIntermediate',
  leftMiddleProximal: 'leftHand', leftMiddleIntermediate: 'leftMiddleProximal', leftMiddleDistal: 'leftMiddleIntermediate',
  leftRingProximal: 'leftHand', leftRingIntermediate: 'leftRingProximal', leftRingDistal: 'leftRingIntermediate',
  leftLittleProximal: 'leftHand', leftLittleIntermediate: 'leftLittleProximal', leftLittleDistal: 'leftLittleIntermediate',
  rightThumbMetacarpal: 'rightHand', rightThumbProximal: 'rightThumbMetacarpal', rightThumbDistal: 'rightThumbProximal',
  rightIndexProximal: 'rightHand', rightIndexIntermediate: 'rightIndexProximal', rightIndexDistal: 'rightIndexIntermediate',
  rightMiddleProximal: 'rightHand', rightMiddleIntermediate: 'rightMiddleProximal', rightMiddleDistal: 'rightMiddleIntermediate',
  rightRingProximal: 'rightHand', rightRingIntermediate: 'rightRingProximal', rightRingDistal: 'rightRingIntermediate',
  rightLittleProximal: 'rightHand', rightLittleIntermediate: 'rightLittleProximal', rightLittleDistal: 'rightLittleIntermediate',
};

// 模型缺骨時(如沒有 upperChest)沿規範鏈往上找最近的存在祖先
function effectiveParent(name, present) {
  let p = VRM_PARENT[name];
  while (p && !present.has(p)) p = VRM_PARENT[p];
  return p;
}

// ===== 動作 JSON(three.js / 自家遊戲直接重建 AnimationClip) =====
export function exportMotionJSON(recorder) {
  const d = recorder.resample(30, 'normalized');
  const tracks = d.boneNames.map((bone, i) => ({
    bone,
    type: 'quaternion',
    values: Array.from(d.quats[i], (v) => +v.toFixed(5)),
  }));
  tracks.push({ bone: 'hips', type: 'position', values: Array.from(d.hipsPos, (v) => +v.toFixed(5)) });
  const payload = {
    format: 'posecast-anim@1',
    space: 'vrm-normalized',
    fps: d.fps,
    duration: +d.duration.toFixed(3),
    times: Array.from(d.times, (v) => +v.toFixed(4)),
    tracks,
    usage: '對每條 track:new THREE.QuaternionKeyframeTrack(`${vrm.humanoid.getNormalizedBoneNode(bone).name}.quaternion`, times, values);position 同理用 VectorKeyframeTrack;組成 AnimationClip 後用 AnimationMixer 播放,每幀呼叫 vrm.update()',
  };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

// ===== BVH(Blender / Unity / Unreal / Godot 通用動捕格式;單位 cm、Y-up、ZXY) =====
export function exportBVH(recorder, vrm) {
  const d = recorder.resample(30, 'normalized');
  const present = new Set(d.boneNames);
  const idx = new Map(d.boneNames.map((n, i) => [n, i]));

  // 子節點表(依規範順序保持穩定輸出)
  const children = new Map(d.boneNames.map((n) => [n, []]));
  for (const n of Object.keys(VRM_PARENT)) {
    if (!present.has(n) || n === 'hips') continue;
    const p = effectiveParent(n, present);
    if (p) children.get(p).push(n);
  }

  // rest 世界位置:normalized 空間 rest 旋轉皆為 identity,沿 Object3D 鏈累加 local position 即可
  const restWorld = new Map();
  const rigRoots = new Set([vrm.scene]);
  for (const name of d.boneNames) {
    const node = vrm.humanoid.getNormalizedBoneNode(name);
    const acc = new THREE.Vector3();
    for (let cur = node; cur && !rigRoots.has(cur); cur = cur.parent) acc.add(cur.position);
    restWorld.set(name, acc);
  }

  const CM = 100;
  const jointOrder = []; // DFS 順序 = MOTION 欄位順序
  const lines = ['HIERARCHY'];
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();

  function writeJoint(name, depth) {
    const pad = '  '.repeat(depth);
    const parent = effectiveParent(name, present);
    const off = parent
      ? restWorld.get(name).clone().sub(restWorld.get(parent))
      : restWorld.get(name).clone();
    lines.push(`${pad}${depth === 0 ? 'ROOT' : 'JOINT'} ${name}`);
    lines.push(`${pad}{`);
    lines.push(`${pad}  OFFSET ${(off.x * CM).toFixed(4)} ${(off.y * CM).toFixed(4)} ${(off.z * CM).toFixed(4)}`);
    lines.push(`${pad}  CHANNELS ${depth === 0 ? '6 Xposition Yposition Zposition Zrotation Xrotation Yrotation' : '3 Zrotation Xrotation Yrotation'}`);
    jointOrder.push(name);
    const kids = children.get(name) || [];
    if (kids.length === 0) {
      lines.push(`${pad}  End Site`);
      lines.push(`${pad}  {`);
      lines.push(`${pad}    OFFSET 0.0000 ${(0.02 * CM).toFixed(4)} 0.0000`);
      lines.push(`${pad}  }`);
    } else {
      for (const k of kids) writeJoint(k, depth + 1);
    }
    lines.push(`${pad}}`);
  }
  writeJoint('hips', 0);

  const n = d.times.length;
  lines.push('MOTION');
  lines.push(`Frames: ${n}`);
  lines.push(`Frame Time: ${(1 / d.fps).toFixed(6)}`);
  const deg = 180 / Math.PI;
  for (let i = 0; i < n; i++) {
    const row = [];
    row.push(
      (d.hipsPos[i * 3] * CM).toFixed(3),
      (d.hipsPos[i * 3 + 1] * CM).toFixed(3),
      (d.hipsPos[i * 3 + 2] * CM).toFixed(3)
    );
    for (const name of jointOrder) {
      quat.fromArray(d.quats[idx.get(name)], i * 4);
      euler.setFromQuaternion(quat, 'ZXY');
      row.push((euler.z * deg).toFixed(3), (euler.x * deg).toFixed(3), (euler.y * deg).toFixed(3));
    }
    lines.push(row.join(' '));
  }
  return new Blob([lines.join('\n')], { type: 'text/plain' });
}

// ===== GLB(模型 + 動畫打包,所有引擎開箱即播) =====
export async function exportGLB(recorder, vrm) {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const d = recorder.resample(30, 'raw');
  const times = Array.from(d.times);

  const tracks = [];
  for (let i = 0; i < d.boneNames.length; i++) {
    const node = vrm.humanoid.getRawBoneNode(d.boneNames[i]);
    if (!node?.name) continue;
    tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, Array.from(d.quats[i])));
  }
  const hipsRaw = vrm.humanoid.getRawBoneNode('hips');
  if (hipsRaw?.name) {
    tracks.push(new THREE.VectorKeyframeTrack(`${hipsRaw.name}.position`, times, Array.from(d.hipsPos)));
  }
  const clip = new THREE.AnimationClip('PoseCastMocap', -1, tracks);

  const buffer = await new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      vrm.scene,
      (result) => resolve(result),
      (err) => reject(err),
      { binary: true, animations: [clip] }
    );
  });
  return new Blob([buffer], { type: 'model/gltf-binary' });
}
