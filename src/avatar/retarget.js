import * as THREE from 'three';
import * as Kalidokit from 'kalidokit';
import { BoneStabilizer } from '../capture/smoothing.js';

const { clamp } = Kalidokit.Utils;
const { lerp } = Kalidokit.Vector;

// Kalidokit 的旋轉值是針對 VRM0 朝向推導的;three-vrm v1+ 的 normalized bone
// 空間統一為 VRM1 朝向(繞 Y 差 180°),故 x/z 軸旋轉需反號。
const FLIP_X = -1;
const FLIP_Z = -1;

const tmpEuler = new THREE.Euler();
const tmpQuat = new THREE.Quaternion();
const IDENTITY = new THREE.Quaternion();

// 信心度閘門失效時要回歸自然姿勢的肢段 → 骨骼對應
const LIMB_BONES = {
  leftArm: ['leftUpperArm', 'leftLowerArm', 'leftHand'],
  rightArm: ['rightUpperArm', 'rightLowerArm', 'rightHand'],
  leftLeg: ['leftUpperLeg', 'leftLowerLeg'],
  rightLeg: ['rightUpperLeg', 'rightLowerLeg'],
};

// Kalidokit 手指鍵名(VRM0 命名)→ VRM1 humanoid 骨骼名
const FINGER_MAP = [
  ['ThumbProximal', 'ThumbMetacarpal'], ['ThumbIntermediate', 'ThumbProximal'], ['ThumbDistal', 'ThumbDistal'],
  ['IndexProximal', 'IndexProximal'], ['IndexIntermediate', 'IndexIntermediate'], ['IndexDistal', 'IndexDistal'],
  ['MiddleProximal', 'MiddleProximal'], ['MiddleIntermediate', 'MiddleIntermediate'], ['MiddleDistal', 'MiddleDistal'],
  ['RingProximal', 'RingProximal'], ['RingIntermediate', 'RingIntermediate'], ['RingDistal', 'RingDistal'],
  ['LittleProximal', 'LittleProximal'], ['LittleIntermediate', 'LittleIntermediate'], ['LittleDistal', 'LittleDistal'],
];

export class Retargeter {
  constructor(vrm) {
    this.vrm = vrm;
    this.lookTarget = new THREE.Euler();
    this.stabilizers = new Map(); // 骨骼名 → BoneStabilizer
    const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
    this.hipsRest = hips ? hips.position.clone() : new THREE.Vector3(0, 1, 0);
  }

  _stab(name) {
    let s = this.stabilizers.get(name);
    if (!s) { s = new BoneStabilizer(); this.stabilizers.set(name, s); }
    return s;
  }

  // 單一骨骼旋轉:死區+離群剔除+One-Euro 穩定後,以阻尼與插值套用
  rotateBone(name, rotation, dampener = 1, lerpAmount = 0.3) {
    if (!rotation) return;
    const node = this.vrm.humanoid?.getNormalizedBoneNode(name);
    if (!node) return;
    const r = this._stab(name).process(rotation, performance.now() / 1000);
    tmpEuler.set(
      r.x * dampener * FLIP_X,
      r.y * dampener,
      r.z * dampener * FLIP_Z,
      r.rotationOrder || 'XYZ'
    );
    tmpQuat.setFromEuler(tmpEuler);
    node.quaternion.slerp(tmpQuat, lerpAmount);
  }

  // 閘門失效/目標消失時:緩慢回歸自然姿勢,並重置濾波器避免重新捕捉時殘留舊狀態
  decayBone(name, amount = 0.07) {
    const node = this.vrm.humanoid?.getNormalizedBoneNode(name);
    if (!node) return;
    node.quaternion.slerp(IDENTITY, amount);
    this.stabilizers.get(name)?.reset();
  }

  decayAll(amount = 0.05) {
    for (const name of Object.keys(this.vrm.humanoid?.humanBones || {})) {
      this.decayBone(name, amount);
    }
    const hips = this.vrm.humanoid?.getNormalizedBoneNode('hips');
    if (hips) hips.position.lerp(this.hipsRest, amount);
  }

  positionHips(position, dampener = 1, lerpAmount = 0.07) {
    const node = this.vrm.humanoid?.getNormalizedBoneNode('hips');
    if (!node || !position) return;
    // VRM0→VRM1 座標翻轉:x/z 反號
    const v = new THREE.Vector3(
      position.x * FLIP_X * dampener,
      position.y * dampener + 1,
      position.z * FLIP_Z * dampener
    );
    node.position.lerp(v, lerpAmount);
  }

  // riggedPose: Kalidokit.Pose.solve 結果
  // gates: 各肢段信心度閘門 {leftArm, rightArm, leftLeg, rightLeg},false = 該肢段回歸自然垂放
  applyPose(riggedPose, { legs = true, hips = true, gates = {} } = {}) {
    if (!riggedPose) return;
    if (hips) {
      this.rotateBone('hips', riggedPose.Hips.rotation, 0.7);
      this.positionHips(riggedPose.Hips.position, 1);
    }
    this.rotateBone('chest', riggedPose.Spine, 0.25, 0.3);
    this.rotateBone('spine', riggedPose.Spine, 0.45, 0.3);

    const limb = (key, apply) => {
      if (gates[key] === false) LIMB_BONES[key].forEach((b) => this.decayBone(b));
      else apply();
    };
    limb('rightArm', () => {
      this.rotateBone('rightUpperArm', riggedPose.RightUpperArm, 1, 0.3);
      this.rotateBone('rightLowerArm', riggedPose.RightLowerArm, 1, 0.3);
      this.rotateBone('rightHand', riggedPose.RightHand, 1, 0.3);
    });
    limb('leftArm', () => {
      this.rotateBone('leftUpperArm', riggedPose.LeftUpperArm, 1, 0.3);
      this.rotateBone('leftLowerArm', riggedPose.LeftLowerArm, 1, 0.3);
      this.rotateBone('leftHand', riggedPose.LeftHand, 1, 0.3);
    });
    if (legs) {
      limb('rightLeg', () => {
        this.rotateBone('rightUpperLeg', riggedPose.RightUpperLeg, 1, 0.3);
        this.rotateBone('rightLowerLeg', riggedPose.RightLowerLeg, 1, 0.3);
      });
      limb('leftLeg', () => {
        this.rotateBone('leftUpperLeg', riggedPose.LeftUpperLeg, 1, 0.3);
        this.rotateBone('leftLowerLeg', riggedPose.LeftLowerLeg, 1, 0.3);
      });
    }
  }

  // riggedHand: Kalidokit.Hand.solve 結果;side: 'Left' | 'Right'
  // poseRig 提供手腕 z 軸(來自全身姿態),與手部偵測的 x/y 合成(Kalidokit 官方建議作法)
  applyHand(side, riggedHand, poseRig = null) {
    const lc = side.toLowerCase();
    if (!riggedHand) {
      for (const [, vrmSuffix] of FINGER_MAP) this.decayBone(lc + vrmSuffix, 0.1);
      return;
    }
    const wrist = riggedHand[`${side}Wrist`];
    const poseHand = poseRig?.[`${side}Hand`];
    this.rotateBone(`${lc}Hand`, { x: wrist.x, y: wrist.y, z: poseHand?.z ?? wrist.z }, 1, 0.4);
    for (const [kSuffix, vrmSuffix] of FINGER_MAP) {
      this.rotateBone(lc + vrmSuffix, riggedHand[side + kSuffix], 1, 0.4);
    }
  }

  // riggedFace: Kalidokit.Face.solve 結果
  applyFace(riggedFace) {
    if (!riggedFace) return;
    this.rotateBone('neck', riggedFace.head, 0.55, 0.4);
    this.rotateBone('head', riggedFace.head, 0.35, 0.4);

    const em = this.vrm.expressionManager;
    if (!em) return;
    const set = (name, value) => {
      if (em.getExpression?.(name)) em.setValue(name, clamp(value, 0, 1));
    };
    const get = (name) => (em.getExpression?.(name) ? em.getValue(name) : 0);

    // 眨眼(穩定化:頭部俯仰大時抑制誤判)
    const eye = Kalidokit.Face.stabilizeBlink(
      {
        l: lerp(clamp(1 - riggedFace.eye.l, 0, 1), get('blink'), 0.5),
        r: lerp(clamp(1 - riggedFace.eye.r, 0, 1), get('blink'), 0.5),
      },
      riggedFace.head.y
    );
    set('blink', eye.l);

    // 嘴型 A/I/U/E/O → VRM1 aa/ih/ou/ee/oh
    set('aa', lerp(riggedFace.mouth.shape.A, get('aa'), 0.4));
    set('ih', lerp(riggedFace.mouth.shape.I, get('ih'), 0.4));
    set('ou', lerp(riggedFace.mouth.shape.U, get('ou'), 0.4));
    set('ee', lerp(riggedFace.mouth.shape.E, get('ee'), 0.4));
    set('oh', lerp(riggedFace.mouth.shape.O, get('oh'), 0.4));

    // 視線
    if (this.vrm.lookAt?.applier?.applyYawPitch) {
      this.lookTarget.x = lerp(riggedFace.pupil.y, this.lookTarget.x, 0.6);
      this.lookTarget.y = lerp(riggedFace.pupil.x, this.lookTarget.y, 0.6);
      this.vrm.lookAt.applier.applyYawPitch(
        this.lookTarget.y * 20,
        this.lookTarget.x * 20
      );
    }
  }
}

// ===== MediaPipe Tasks Vision 結果 → Kalidokit 求解 =====

export function solvePose(poseResult, sourceSize) {
  const lm = poseResult?.landmarks?.[0];
  const world = poseResult?.worldLandmarks?.[0];
  if (!lm || !world) return null;
  return Kalidokit.Pose.solve(world, lm, {
    runtime: 'mediapipe',
    imageSize: sourceSize,
    enableLegs: true,
  });
}

export function solveFace(faceResult, sourceSize) {
  const lm = faceResult?.faceLandmarks?.[0];
  if (!lm) return null;
  return Kalidokit.Face.solve(lm, {
    runtime: 'mediapipe',
    imageSize: sourceSize,
    smoothBlink: false,
  });
}

// 回傳 { Left: rig|null, Right: rig|null }
export function solveHands(handResult) {
  const out = { Left: null, Right: null };
  const lms = handResult?.landmarks || [];
  for (let i = 0; i < lms.length; i++) {
    const side = handResult.handedness?.[i]?.[0]?.categoryName;
    if (side !== 'Left' && side !== 'Right') continue;
    out[side] = Kalidokit.Hand.solve(lms[i], side);
  }
  return out;
}

// 各肢段平均 visibility → 閘門(MediaPipe 索引:肩11/12 肘13/14 腕15/16 髖23/24 膝25/26 踝27/28)
const LIMB_LANDMARKS = {
  leftArm: [11, 13, 15],
  rightArm: [12, 14, 16],
  leftLeg: [23, 25, 27],
  rightLeg: [24, 26, 28],
};
const GATE_THRESHOLD = 0.55;

export function computeGates(poseResult) {
  const lm = poseResult?.landmarks?.[0];
  const gates = {};
  if (!lm) return gates;
  for (const [limbName, idxs] of Object.entries(LIMB_LANDMARKS)) {
    const avg = idxs.reduce((s, i) => s + (lm[i]?.visibility ?? 0), 0) / idxs.length;
    gates[limbName] = avg >= GATE_THRESHOLD;
  }
  return gates;
}
