import * as THREE from 'three';
import * as Kalidokit from 'kalidokit';

const { clamp } = Kalidokit.Utils;
const { lerp } = Kalidokit.Vector;

// Kalidokit 的旋轉值是針對 VRM0 朝向推導的;three-vrm v1+ 的 normalized bone
// 空間統一為 VRM1 朝向(繞 Y 差 180°),故 x/z 軸旋轉需反號。
const FLIP_X = -1;
const FLIP_Z = -1;

const tmpEuler = new THREE.Euler();
const tmpQuat = new THREE.Quaternion();

export class Retargeter {
  constructor(vrm) {
    this.vrm = vrm;
    this.lookTarget = new THREE.Euler();
  }

  // 單一骨骼旋轉(帶阻尼與插值);name 用 VRM1 humanoid 名稱
  rotateBone(name, rotation, dampener = 1, lerpAmount = 0.3) {
    if (!rotation) return;
    const node = this.vrm.humanoid?.getNormalizedBoneNode(name);
    if (!node) return;
    tmpEuler.set(
      rotation.x * dampener * FLIP_X,
      rotation.y * dampener,
      rotation.z * dampener * FLIP_Z,
      rotation.rotationOrder || 'XYZ'
    );
    tmpQuat.setFromEuler(tmpEuler);
    node.quaternion.slerp(tmpQuat, lerpAmount);
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
  applyPose(riggedPose, { legs = true, hips = true } = {}) {
    if (!riggedPose) return;
    if (hips) {
      this.rotateBone('hips', riggedPose.Hips.rotation, 0.7);
      this.positionHips(riggedPose.Hips.position, 1);
    }
    this.rotateBone('chest', riggedPose.Spine, 0.25, 0.3);
    this.rotateBone('spine', riggedPose.Spine, 0.45, 0.3);

    this.rotateBone('rightUpperArm', riggedPose.RightUpperArm, 1, 0.3);
    this.rotateBone('rightLowerArm', riggedPose.RightLowerArm, 1, 0.3);
    this.rotateBone('leftUpperArm', riggedPose.LeftUpperArm, 1, 0.3);
    this.rotateBone('leftLowerArm', riggedPose.LeftLowerArm, 1, 0.3);
    this.rotateBone('rightHand', riggedPose.RightHand, 1, 0.3);
    this.rotateBone('leftHand', riggedPose.LeftHand, 1, 0.3);

    if (legs) {
      this.rotateBone('rightUpperLeg', riggedPose.RightUpperLeg, 1, 0.3);
      this.rotateBone('rightLowerLeg', riggedPose.RightLowerLeg, 1, 0.3);
      this.rotateBone('leftUpperLeg', riggedPose.LeftUpperLeg, 1, 0.3);
      this.rotateBone('leftLowerLeg', riggedPose.LeftLowerLeg, 1, 0.3);
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

// MediaPipe Tasks Vision 結果 → Kalidokit 求解
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
