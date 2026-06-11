// 輸入源抽象:webcam / 影片檔 / 照片,統一回傳可餵給 MediaPipe 的元素

export async function openWebcam(videoEl, facingMode = 'user') {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  return {
    type: 'webcam',
    element: videoEl,
    facingMode,
    get size() { return { width: videoEl.videoWidth, height: videoEl.videoHeight }; },
    stop() { stream.getTracks().forEach((t) => t.stop()); videoEl.srcObject = null; },
  };
}

export async function openVideoFile(videoEl, file) {
  const url = URL.createObjectURL(file);
  videoEl.srcObject = null;
  videoEl.src = url;
  videoEl.loop = true;
  videoEl.muted = true;
  await videoEl.play();
  return {
    type: 'video',
    element: videoEl,
    get size() { return { width: videoEl.videoWidth, height: videoEl.videoHeight }; },
    stop() { videoEl.pause(); videoEl.removeAttribute('src'); URL.revokeObjectURL(url); },
  };
}

export function loadPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({
      type: 'photo',
      element: img,
      size: { width: img.naturalWidth, height: img.naturalHeight },
      stop() { URL.revokeObjectURL(url); },
    });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取照片')); };
    img.src = url;
  });
}

export async function loadPhotoFromURL(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  return {
    type: 'photo',
    element: img,
    size: { width: img.naturalWidth, height: img.naturalHeight },
    stop() {},
  };
}
