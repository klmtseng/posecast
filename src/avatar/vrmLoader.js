import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

// 載入 VRM(URL 或 File 物件),回傳 vrm 實例;支援 VRM0 與 VRM1
export async function loadVRM(source) {
  const url = source instanceof File ? URL.createObjectURL(source) : source;
  try {
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error('檔案不是有效的 VRM');

    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);

    // VRM0 模型轉向,使其與 VRM1 同向
    if (vrm.meta?.metaVersion === '0') VRMUtils.rotateVRM0(vrm);

    vrm.scene.traverse((obj) => { obj.frustumCulled = false; });
    return vrm;
  } finally {
    if (source instanceof File) URL.revokeObjectURL(url);
  }
}

export function disposeVRM(vrm) {
  vrm.scene.removeFromParent();
  VRMUtils.deepDispose(vrm.scene);
}
