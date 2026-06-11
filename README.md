# PoseCast — 骨架辨識 × VRM 虛擬角色動捕

純前端的姿態捕捉 → VRM 角色重定向工具(類 VTuber)。所有運算在瀏覽器內完成,零伺服器成本,手機開網頁即可用。

## 三種模式(啟動時自選)

| 模式 | 說明 |
|---|---|
| 📷 照片姿勢 | 上傳/拍一張人物照,角色擺出相同姿勢;可匯出截圖與姿勢 JSON |
| 🎭 臉部+上半身 | 鏡頭即時同步表情、眨眼、嘴型與頭肩手(VTuber 直播形態) |
| 🏃 全身動捕 | 33 點全身骨架即時追蹤 |

## 技術棧

- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe)(WASM)— 骨架/臉部偵測
- [Kalidokit](https://github.com/yeemachine/kalidokit) — 偵測結果 → VRM 骨骼旋轉
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) + three.js — VRM 載入與渲染
- Vite + Vercel

## 開發

```bash
npm install
npm run dev          # http://localhost:5173
HTTPS=1 npm run dev  # 區網手機實測用(getUserMedia 需要 HTTPS)
```

煙霧測試:開 `/?smoke=1`,自動驗證 WebGL → VRM → MediaPipe → Kalidokit → 重定向 → 影片逐幀動捕,結果寫入 `document.title`(SMOKE_OK / SMOKE_FAIL)並 POST 到 `localhost:8787`。

## 自訂角色

用 [VRoid Studio](https://vroid.com/studio) 免費捏角色,匯出 `.vrm` 後拖放進頁面即可(支援 VRM 0.x / 1.0)。

## 備註

- 內建範例模型來自 [pixiv/three-vrm](https://github.com/pixiv/three-vrm) 範例資產
- 測試照片來自 MediaPipe 官方資產
- 手機請用系統瀏覽器開啟(需允許相機權限)
