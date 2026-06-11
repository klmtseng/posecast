// 防抖三件套:One-Euro 自適應濾波 + 死區 + 角速度離群值剔除
// One-Euro (Casiez et al., CHI 2012):靜止時強力消抖、快動作時自動放寬以降低延遲

class LowPass {
  constructor() { this.y = 0; this.ready = false; }
  filter(x, alpha) {
    this.y = this.ready ? alpha * x + (1 - alpha) * this.y : ((this.ready = true), x);
    return this.y;
  }
}

export class OneEuro {
  constructor(minCutoff = 1.2, beta = 0.6, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xF = new LowPass();
    this.dxF = new LowPass();
    this.lastT = null;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x, t) {
    if (this.lastT === null) {
      this.lastT = t;
      this.dxF.filter(0, 1);
      return this.xF.filter(x, 1);
    }
    const dt = Math.max(t - this.lastT, 1e-3);
    this.lastT = t;
    const dx = (x - this.xF.y) / dt;
    const edx = this.dxF.filter(dx, OneEuro.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xF.filter(x, OneEuro.alpha(cutoff, dt));
  }
  reset() { this.xF = new LowPass(); this.dxF = new LowPass(); this.lastT = null; }
}

const DEAD_BAND = 0.006;  // ~0.35°,小於此變化視為雜訊不更新
const MAX_VEL = 25;       // rad/s,單幀角速度超過此值視為離群值(連續兩次則視為真實快動作)

// 一根骨骼的三軸 Euler 穩定器
export class BoneStabilizer {
  constructor() {
    this.fx = new OneEuro();
    this.fy = new OneEuro();
    this.fz = new OneEuro();
    this.last = null;
    this.lastT = null;
    this.rejects = 0;
  }
  process(rot, t) {
    if (this.last && this.lastT !== null) {
      const dt = Math.max(t - this.lastT, 1e-3);
      const jump = Math.max(
        Math.abs(rot.x - this.last.x),
        Math.abs(rot.y - this.last.y),
        Math.abs(rot.z - this.last.z)
      );
      if (jump / dt > MAX_VEL && this.rejects < 2) { this.rejects++; return this.last; }
      this.rejects = 0;
      if (jump < DEAD_BAND) return this.last;
    }
    const out = {
      x: this.fx.filter(rot.x, t),
      y: this.fy.filter(rot.y, t),
      z: this.fz.filter(rot.z, t),
      rotationOrder: rot.rotationOrder,
    };
    this.last = out;
    this.lastT = t;
    return out;
  }
  reset() { this.fx.reset(); this.fy.reset(); this.fz.reset(); this.last = null; this.lastT = null; this.rejects = 0; }
}
