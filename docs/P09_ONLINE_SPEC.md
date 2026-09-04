# P09-ONLINE 私人雙裝置直連規格

> 文件編號：`P09-ONLINE-r04`  
> 對應規劃：`v0.9.1`  
> 目前狀態：`WAITING_FOR_PRODUCER`  
> 更新日期：2026-09-04

## 1. 製作人已確認的方向

- 完成後只放在 GitHub／GitHub Pages，不建立本專案自己的雲端儲存、資料庫或伺服器。
- 不建立兒童帳號，不要求姓名、信箱、電話、位置、頭像、聊天或行為追蹤資料。
- 雙裝置連線採 WebRTC 點對點直連，使用「邀請連結／回覆連結」交換連線資料。
- 已確認的最簡化操作只有：乙按一次「一鍵回覆給甲」；甲點一次收到的回覆連結。雙方不再輸入長字串或按第二個連線按鈕。
- 第一個整合遊戲為跳棋；其他棋類不得因本規格自動宣稱已支援連線。

這是「不使用本專案伺服器」的折衷方案。它不等同於所有網路環境都能直連，也不提供伺服器保存棋局或伺服器驗證棋步。

## 2. 核准的使用流程

1. 甲在跳棋的「雙裝置連線」入口按「分享邀請連結」。瀏覽器使用系統分享功能；不支援時可複製連結。
2. 乙開啟邀請連結。乙的瀏覽器自動建立回覆連結，不需要乙輸入連線資料。
3. 乙只按一次「一鍵回覆給甲」，將回覆連結交給甲；可使用 LINE、簡訊、電子郵件或其他雙方原本使用的通訊方式傳送。通訊軟體本身的資料處理不屬於本專案控制範圍。
4. 甲點開收到的回覆連結。回覆頁會把回覆資料送回甲原本仍開啟的遊戲分頁。
5. 甲原本的遊戲分頁自動套用回覆，雙方資料通道開啟後直接進入跳棋，不再按其他連線按鍵。

甲在第 4 步前必須保持第 1 步建立的遊戲分頁開啟；瀏覽器沒有伺服器或其他裝置能找到已關閉的 `RTCPeerConnection`。若甲關閉原分頁，必須重新從甲建立邀請連結。

## 3. 架構與資料流

### 3.1 不建立的項目

- 不建立 Cloudflare、WSS、WebSocket、Firebase、Supabase、資料庫、房間服務或任何本專案後端。
- 不建立公開大廳、陌生人配對、帳號、聊天、兒童個人檔案或分析追蹤。
- 不把目前棋局上傳到 GitHub、GitHub Issues、雲端硬碟或任何公開檔案。

GitHub Pages 只提供靜態 HTML、CSS、JavaScript 與 PWA 資產；它不是房間伺服器。

### 3.2 WebRTC 交換

- 甲建立 `RTCPeerConnection` 與有序 `RTCDataChannel`，產生 offer。
- 乙開啟邀請連結後建立自己的連線、套用 offer、產生 answer。
- offer／answer 會以短期 URL 查詢資料攜帶，連線資料使用 Base64URL 編碼，不放入兒童身分或棋局內容。
- 回覆頁以同來源 `BroadcastChannel` 將 answer 傳給甲的原始分頁；沒有 `BroadcastChannel` 時以短期 `localStorage` 事件作瀏覽器分頁備援。這不是雲端儲存，資料只在甲自己的瀏覽器分頁之間傳送。
- URL 連線資料最長接受 15 分鐘；瀏覽器分頁備援資料也會在短期後清理。
- 目前不預設 STUN／TURN，連線設定為空的 ICE 伺服器清單，不使用任何第三方帳號或額度。連線成功後的遊戲資料走兩台裝置之間的加密 WebRTC data channel；WebRTC data channel 的傳輸保護由瀏覽器的 DTLS 提供。

## 4. 跳棋整合行為

- 甲固定為第一位玩家，乙固定為第二位玩家；下方第一位玩家先手的既有跳棋規則不變。
- 連線完成後，甲送出初始可序列化局面；乙可要求目前局面。雙方只在輪到自己的回合時解除棋盤操作。
- 每次合法走棋、連跳結束、自動換手、勝負或和局都傳送完整跳棋局面；接收端先以既有 `deserializeJumpChessState` 驗證格式，再更新畫面。
- 乙不能重設甲的棋局；甲可使用既有「再試一次」重新開始並同步給乙。
- 連線中斷不直接判負；畫面保留裝置目前最後局面並顯示「連線中斷，棋局先留在這裡」。本修訂尚未實作伺服器保存或自動重連，若資料通道失效，需重新建立一組邀請／回覆連結。
- 跳棋規則仍完全依 `docs/games/JUMP_CHESS_SPEC.md` 的 `JUMP-CHESS-SPEC-d05`，不新增回合上限、不改變勝負或和局。

## 5. 兒童介面契約

- 兒童入口顯示「雙裝置連線」；配對畫面只使用台灣繁體中文。
- 所有兒童文案仍由 `src/content/child-text.json` 管理，每個中文字右側直排自己的台灣注音，並保留 `speech_zh_tw` 與語音欄位。
- 乙的主要操作是「一鍵回覆給甲」；甲的主要操作是「分享邀請連結」。系統分享不支援時才顯示複製備援，不增加空白按鍵格。
- 甲原分頁等待回覆時必須清楚顯示狀態；回覆頁必須說明已送回甲的遊戲畫面；失敗時說明重新開啟連結或檢查兩台裝置網路。
- 配對成功後回到既有跳棋畫面，不新增另一套棋盤、按鍵配置或兒童文字方向。
- 配對頁在 390×844、844×390、768×1024、1024×768 均以實際視窗驗證；長操作名稱仍使用漢字與每字右側直排注音，不得溢出按鍵或頁面。844×390 使用緊湊橫向雙欄以保留必要資訊，不新增空白按鍵格。

## 6. 隱私、連線與安全邊界

- 本專案程式不讀取、不建立、不上傳兒童姓名、帳號、信箱、位置、聯絡人、聊天或行為歷史。
- 邀請／回覆 URL 本身包含 WebRTC SDP 與候選連線資訊；依瀏覽器與網路環境可能含有供連線使用的主機候選或 mDNS 名稱。因此連結應視為一次性邀請，只傳給對方，不要公開張貼。
- 連線資料 15 分鐘後失效；連線成功後不再需要 URL。棋步只在兩台已連線裝置之間傳送，不經本專案伺服器。
- 外部分享工具（例如簡訊或通訊軟體）可能依其自身政策處理連結；本專案不控制該工具的紀錄方式。
- 沒有伺服器時沒有真正的房間擁有權、登入驗證、權威棋步驗證或反作弊能力；這一版以兩位互相信任的玩家為使用前提。
- GitHub Pages 仍可能依 GitHub 自身網站基礎設施政策處理一般網站請求紀錄；本專案無法承諾第三方基礎設施完全不留網路服務紀錄。

## 7. 已知限制與下一個 Gate

### 7.1 網路成功率

沒有 STUN／TURN 時，若兩台裝置位於同一區域網路或網路允許主機候選直連，通常可建立連線；若兩邊都在不同 NAT、防火牆或行動網路限制後方，可能無法直連。這是 WebRTC 網路拓撲限制，不是分享連結格式可以消除的問題。

本修訂已用 Microsoft Edge 同一個瀏覽器的三個分頁完成：甲建立邀請、乙開啟邀請、乙一鍵回覆、甲開啟回覆、雙方自動連線，以及甲落子同步至乙。製作人另依相同流程實際互相走棋 5 步，確認本機三分頁可用；這不是完整對局，也不能替代兩支實體裝置、不同網路與 GitHub Pages HTTPS 的實測。

### 7.2 尚未宣稱完成的項目

- QR Code：本核准流程先使用系統分享／連結，不新增 QR Code 操作依賴。
- 跨 NAT 的 STUN／TURN：未使用；若未來需要提高跨網路成功率，必須另取得製作人對第三方服務、資料處理、費用與額度的明確授權。
- 自動重連：本版斷線保留本機畫面，但不承諾無需重新交換連線資料即可恢復。
- 伺服器驗證棋步：本版無伺服器，接收端只做局面格式與既有規則資料驗證，不提供防竄改的權威裁判。
- 其他棋類連線：尚未整合。

下一個真正的 Producer Gate 是在 GitHub Pages HTTPS 上，以兩支實體裝置、不同網路實測成功率、連線建立時間、落子往返時間與斷線後重新配對流程；未取得該證據前，不把「所有遠端網路都能連線」或「不易斷線」寫成保證。

GitHub Pages 部署前置檢查已完成：`.github/workflows/deploy-pages.yml` 可依儲存庫名稱設定子路徑；`VITE_BASE_PATH=/kids-board-game-kingdom/` 預建置的 HTML、Manifest、Service Worker 與資源路徑均通過，工作區 `npm.cmd run check` 為 35 個測試檔／184 項測試。工作區目前沒有 Git 遠端網址，尚未進行外部發布或宣稱 iPhone／不同網路測試通過。

## 8. Machine Gate

目前已加入：

- `src/online/webrtc.ts`：訊號編碼、有效期限、offer／answer、分頁回傳與通道管理。
- `src/online/WebRtcPairing.tsx`：分享邀請、乙一鍵回覆、甲開啟回覆後自動完成配對。
- `src/games/jump-chess/JumpChessGame.tsx`：跳棋雙裝置角色、局面同步、回合鎖定與斷線提示。
- `scripts/verify-jump-chess-webrtc-playwright.mjs`：可重跑的 Edge 三分頁實際流程與落子同步驗證。
- `scripts/verify-jump-chess-online-layout-playwright.mjs`：Edge DPR 1 四尺寸連線頁 1:1 截圖、頁面／按鍵邊界、注音比例與「暫停語音」不存在檢查。

以上 Machine Gate 已通過；v0.9.1 完整驗證 ZIP 已建立於 `releases/kids-board-game-kingdom-v0.9.1.zip`（241 個 ZIP 項目、MANIFEST 239 筆），外層 SHA-256 以同名 `.sha256` 檔為準；既有 v0.9.0 封存 ZIP／SHA-256 不修改。乾淨解壓的 `npm ci` 仍受 Windows npm `Exit handler never called` 阻擋；解壓出的完整來源使用已通過的依賴目錄重驗 `check`／`build` 均通過，未把 npm 安裝步驟宣稱為通過。連線範圍仍僅為跳棋；其他棋類尚未整合 WebRTC。

必要檢查：

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd run verify:jump-chess-webrtc
npm.cmd run verify:jump-chess-online-layout
```

## 9. 參考資料

- [GitHub Pages：What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [MDN：Signaling and video calling](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling)
- [MDN：Using data channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels)
- [MDN：Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API)
