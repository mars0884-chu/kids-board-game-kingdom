# P09-ONLINE 私人雙裝置直連規格

> 文件編號：`P09-ONLINE-r13`
> 對應規劃：`v0.10.0`
> 目前狀態：`BLOCKED`（等待 Firebase 試驗專案與 Pages Variables 設定）
> 更新日期：2026-09-11

v0.10.4 實作修訂：甲端套用乙的回覆後，資料通道建立等待採 45 秒專用逾時；手動交換回覆連結前仍保留原本 5 分鐘寬限。失敗頁提供重新開始連線，並修正甲端等待文案的角色標示。此修訂不新增 TURN、Cloudflare、後端、帳號或兒童個資；雙電信網路在 CGNAT／嚴格 NAT 下仍不保證 STUN-only 直連。v0.10.4 完整封存 ZIP 為 `releases/kids-board-game-kingdom-v0.10.4.zip`，SHA-256：`B264C96A5CAD1D6D4FF6078091898DDE12A79E0EEF19ABEFB9394B2755CD9FB0`。

## 1. 製作人已確認的方向

- 熟人保留 GitHub Pages 上的私人邀請／回覆連結流程；陌生人隨機配對新增 Firebase 免費方案小規模試驗，只處理短期配對與信令資料。
- 不建立兒童帳號，不要求姓名、信箱、電話、位置、頭像、聊天或行為追蹤資料。
- 雙裝置連線採 WebRTC 點對點直連，使用「邀請連結／回覆連結」交換連線資料。
- 已確認的最簡化操作只有：乙按一次「一鍵回覆給甲」；甲點一次收到的回覆連結。雙方不再輸入長字串或按第二個連線按鈕。
- 第一個整合遊戲為跳棋；其他棋類不得因本規格自動宣稱已支援連線。

熟人流程仍是不使用本專案伺服器的 WebRTC 直連；陌生人流程只在已設定 Firebase 試驗專案時啟用配對佇列。兩種流程都不保證所有網路環境都能直連，也不由伺服器保存棋局或驗證棋步。

## 2. 核准的使用流程

1. 甲在跳棋的「雙裝置連線」入口按「分享邀請連結」。瀏覽器使用系統分享功能；不支援時可複製連結。
2. 乙開啟邀請連結。乙的瀏覽器自動建立回覆連結，不需要乙輸入連線資料。
3. 乙只按一次「一鍵回覆給甲」，將回覆連結交給甲；可使用 LINE、簡訊、電子郵件或其他雙方原本使用的通訊方式傳送。通訊軟體本身的資料處理不屬於本專案控制範圍。
4. 甲點開收到的回覆連結。回覆頁會把回覆資料送回甲原本仍開啟的遊戲分頁。
5. 甲原本的遊戲分頁自動套用回覆；兩端資料通道開啟後，會先互相送出同一連線的「已準備好」確認。只有甲、乙都收到對方的確認，兩端才同時進入跳棋，不再按其他連線按鍵。

甲在第 4 步前必須保持第 1 步建立的遊戲分頁開啟，且回覆連結要在甲原本的瀏覽器／PWA 儲存分區開啟；LINE 內嵌瀏覽器與 Safari、Safari 與主畫面 PWA 可能互相隔離，這時不會收到自動分頁回傳。瀏覽器沒有伺服器或其他裝置能找到已關閉的 `RTCPeerConnection`。若甲關閉原分頁或使用不同瀏覽器分區，必須重新從甲建立邀請連結。

## 3. 架構與資料流

### 3.1 不建立的項目

- 熟人私人邀請流程不建立 Cloudflare Workers、WSS、WebSocket、TURN、房間伺服器或棋局伺服器；只使用公開 STUN 探索連線候選。
- 陌生人隨機配對試驗可使用 Firebase Anonymous Authentication 與 Realtime Database 的短期佇列、認領、offer／answer 信令及匿名檢舉資料；不使用 Google 登入，不建立兒童帳號或個人檔案。
- 不建立公開大廳、公開玩家名單、帳號、聊天、兒童個人檔案或分析追蹤；陌生人匿名配對只在 Firebase 試驗佇列中短期配對。
- 不把目前棋局上傳到 GitHub、GitHub Issues、雲端硬碟或任何公開檔案。

GitHub Pages 只提供靜態 HTML、CSS、JavaScript 與 PWA 資產；熟人流程不需要房間伺服器，Firebase 試驗只作陌生人配對的短期信令中介。

### 3.2 WebRTC 交換

- 甲建立 `RTCPeerConnection` 與有序 `RTCDataChannel`，產生 offer。
- 乙開啟邀請連結後建立自己的連線、套用 offer、產生 answer。
- offer／answer 會以短期 URL 查詢資料攜帶，連線資料使用 Base64URL 編碼，不放入兒童身分或棋局內容。
- 回覆頁若由甲原始分頁開啟，會先以同源 `window.opener.postMessage` 傳送 answer；同時保留同來源 `BroadcastChannel`，沒有 `BroadcastChannel` 時再以短期 `localStorage` 事件作瀏覽器分頁備援。這不是雲端儲存，資料只在可互通的瀏覽器分頁之間傳送。
- URL 連線資料最長接受 15 分鐘；瀏覽器分頁備援資料也會在短期後清理。
- 乙開啟邀請後，資料通道等待時間延長至 5 分鐘，涵蓋透過 LINE 或其他通訊方式交回覆連結的手動操作時間；這不會延長 URL 的 15 分鐘有效期限。
- 資料通道開啟不等於雙方連線完成；甲、乙都必須送出並收到同一 `sessionId` 的對方就緒訊息。兩端在等待期間每 250 毫秒重送同一個冪等確認，收到對方確認後停止重送；任何一端尚未完成就緒、逾時或關閉時，兩端都不得進入棋盤；甲端不得因自己的通道先開啟而單方面顯示已連線。

### 3.3 在無後端條件下的最簡化方式

- 遠端兩台裝置仍需要把甲的邀請資料送到乙，再把乙的回覆資料送回甲；這是沒有信令伺服器時不可省略的資料交換。
- 目前保留的最少操作是甲分享一次、乙按一次「一鍵回覆給甲」、甲開啟一次回覆連結。系統分享優先，複製連結是瀏覽器不支援系統分享時的備援。
- 單一 QR Code、單一短網址或只分享一次連結，若不增加能代為轉交回覆的伺服器或第三方服務，無法讓遠端乙端的回覆自動抵達甲端；因此本版不增加 QR Code、短網址服務或其他帳號／額度依賴。
- 連線使用公開 STUN `stun:stun.l.google.com:19302` 協助探索跨 NAT 的 ICE 候選；不使用 TURN，中繼服務不會代傳棋步或保存棋局，也不需要帳號或本專案額度。連線成功後的遊戲資料仍只走兩台裝置之間的加密 WebRTC data channel；WebRTC data channel 的傳輸保護由瀏覽器的 DTLS 提供。STUN 服務可能看到連線所需的暫時性公開 IP，這是本版新增的明確隱私邊界。

### 3.4 陌生人匿名隨機配對試驗

- 玩家先看到家長同意提示，再按一次「家長已了解並同意」進入匿名等待佇列；不提供姓名、聊天、位置、Google 登入或其他個人資料欄位。
- Firebase Anonymous Authentication 只建立隨機 UID；Realtime Database 以建立時間排序，避免同一 UID 自己配到自己，並跳過本機已封鎖的匿名 UID。
- 等待佇列逾時為 2 分鐘；配對完成後信令與配對資料最多等待 5 分鐘。玩家按「離開配對」、關閉頁面或取消流程時清理可清理資料。
- 配對成功後仍使用同一套 WebRTC offer／answer、公開 STUN 與雙方同一 `sessionId` 的 250 毫秒就緒重送；Firebase 不轉送棋步。
- 「檢舉玩家」只送出匿名 UID、短期局號與時間，禁止輸入檢舉文字；「封鎖玩家」寫入本機封鎖清單並離開對局，之後本機配對會跳過該 UID。
- Firebase 免費方案是小規模驗證邊界，不是容量或可用性保證；未設定 Variables 時功能顯示未設定並停在安全畫面，不自動建立服務。

## 4. 跳棋整合行為

- 甲固定為第一位玩家，乙固定為第二位玩家；下方第一位玩家先手的既有跳棋規則不變。
- 雙方就緒前若任一端失敗、逾時或離開，兩端維持連線準備畫面，不得進入棋盤，也不得把未完成配對誤顯示成遊戲中的連線中斷。
- 連線完成後，甲送出初始可序列化局面；乙可要求目前局面。雙方只在輪到自己的回合時解除棋盤操作。
- 每次合法走棋、連跳結束、自動換手、勝負或和局都傳送完整跳棋局面；接收端先以既有 `deserializeJumpChessState` 驗證格式，再更新畫面。
- 乙不能重設甲的棋局；甲可使用既有「再試一次」重新開始並同步給乙。
- 隨機配對對局額外顯示「檢舉玩家」與「封鎖玩家」；封鎖會先清除配對資料再離開，熟人私人連線不顯示這兩個控制。
- 雙方就緒後的連線中斷不直接判負；畫面保留裝置目前最後局面並顯示「連線中斷，棋局先留在這裡」。`disconnected` 狀態先觀察 5 秒，只有仍未恢復才顯示斷線；本修訂尚未實作伺服器保存或自動重連，若資料通道失效，需重新建立一組邀請／回覆連結。
- 斷線、對手回合或暫停時，121 個棋孔按鈕使用原生 `disabled` 鎖定；這只限制兒童操作，不改變棋盤局面、回合規則或重新配對流程。
- 跳棋規則仍完全依 `docs/games/JUMP_CHESS_SPEC.md` 的 `JUMP-CHESS-SPEC-d05`，不新增回合上限、不改變勝負或和局。

## 5. 兒童介面契約

- 兒童入口顯示「雙裝置連線」；配對畫面只使用台灣繁體中文。
- 隨機配對先顯示「與另一位玩家隨機對戰」及家長同意提示；等待頁顯示會自動離開，並提供「離開配對」。
- 所有兒童文案仍由 `src/content/child-text.json` 管理，每個中文字右側直排自己的台灣注音，並保留 `speech_zh_tw` 與語音欄位。
- 乙的主要操作是「一鍵回覆給甲」；甲的主要操作是「分享邀請連結」。系統分享不支援時才顯示複製備援，不增加空白按鍵格。
- 甲原分頁等待回覆時必須清楚顯示狀態；回覆頁必須說明已送回甲的遊戲畫面；失敗時說明重新開啟連結或檢查兩台裝置網路。
- 資料通道先開啟但尚未完成雙方確認時，顯示等待雙方確認，不顯示已連線，也不顯示棋盤。
- 配對成功後回到既有跳棋畫面，不新增另一套棋盤、按鍵配置或兒童文字方向。
- 配對頁在 390×844、844×390、768×1024、1024×768 均以實際視窗驗證；另以 430×932／932×430 回歸 iPhone 15 Pro Max 比例。長操作名稱仍使用漢字與每字右側直排注音，不得溢出按鍵或頁面。844×390 使用緊湊橫向雙欄以保留必要資訊，不新增空白按鍵格。
- 逐字注音配對改由自有 CSS Grid 直排結構呈現，不依賴 iOS Safari 對原生 `<ruby>` 的排版實作；每個配對仍保留語意化的 `aria-label` 與不可拆分的中文字／注音單位。

## 6. 隱私、連線與安全邊界

- 本專案程式不讀取、不建立、不上傳兒童姓名、帳號、信箱、位置、聯絡人、聊天或行為歷史。
- 邀請／回覆 URL 本身包含 WebRTC SDP 與候選連線資訊；依瀏覽器與網路環境可能含有供連線使用的主機候選或 mDNS 名稱。因此連結應視為一次性邀請，只傳給對方，不要公開張貼。
- 熟人連線資料 15 分鐘後失效；連線成功後不再需要 URL。熟人棋步只在兩台已連線裝置之間傳送，不經本專案伺服器；匿名配對的 Firebase 只承接短期 offer／answer 信令，不轉送棋步。
- 外部分享工具（例如簡訊或通訊軟體）可能依其自身政策處理連結；本專案不控制該工具的紀錄方式。
- 沒有伺服器時沒有真正的房間擁有權、登入驗證、權威棋步驗證或反作弊能力；這一版以兩位互相信任的玩家為使用前提。
- Firebase 試驗會產生不可顯示給玩家的匿名 UID、配對佇列與短期信令資料；Realtime Database 規則限制玩家只能以自己的匿名 UID 建立／修改配對資料，檢舉資料不可由玩家讀取。Firebase 或 GitHub 的基礎設施可能依其政策處理網路請求紀錄，本專案不宣稱第三方完全不留紀錄。

## 7. 已知限制與下一個 Gate

### 7.1 網路成功率

加入 STUN 後，瀏覽器可額外探索部分跨 NAT 的候選，預期比只有主機候選更容易連線；若兩邊受到嚴格 NAT、防火牆、行動網路或瀏覽器政策限制，仍可能無法直連。這是 WebRTC 網路拓撲限制，不是分享連結格式可以完全消除的問題。本版未加入 TURN，因此不保證所有遠端網路都能連線。

P09-ONLINE-r11 已用 Microsoft Edge 同一個瀏覽器的三個分頁完成：甲建立邀請、乙開啟邀請、乙一鍵回覆、甲開啟回覆、雙方就緒確認後自動連線，以及甲落子同步至乙；自動測試另確認只收到單端訊息時不完成配對，且對方監聽器延後建立時會重送就緒訊息。製作人另確認兩支實體 iPhone 使用一般 Safari 完成公開 Pages HTTPS 連線，雙方各試走 5 步且對端均有顯示；這確認一般 Safari 實機的雙方就緒與棋步同步可用，但未延伸宣稱不同網路、主畫面 PWA、斷線後重新配對或所有遠端網路。

### 7.2 尚未宣稱完成的項目

- QR Code：本核准流程先使用系統分享／連結，不新增 QR Code 操作依賴。
- 跨 NAT 的 STUN：已依製作人授權使用公開 `stun:stun.l.google.com:19302`；TURN 未使用，因此不提供中繼保證。STUN 只取得候選，不保存棋局或棋步，但服務可能看到暫時性公開 IP。
- 自動重連：本版斷線保留本機畫面，但不承諾無需重新交換連線資料即可恢復。
- 伺服器驗證棋步：Firebase 試驗只作配對與信令中介，棋步仍由 WebRTC 傳送；接收端只做局面格式與既有規則資料驗證，不提供防竄改的權威裁判。
- 其他棋類連線：尚未整合。

下一個外部阻擋是建立 Firebase 免費試驗專案、啟用 Anonymous、套用 Realtime Database 規則並設定 GitHub Pages Variables；完成後才可進行兩支 iPhone Safari 的陌生人隨機配對實測。不同網路、主畫面 PWA、斷線後重新配對與所有遠端 NAT 仍不宣稱保證。

GitHub Pages 部署已完成：`.github/workflows/deploy-pages.yml` 依儲存庫名稱設定子路徑；`VITE_BASE_PATH=/kids-board-game-kingdom/` 建置的 HTML、Manifest、Service Worker 與資源路徑均通過，GitHub Actions `build`／`deploy` 均成功。公開網址為 `https://mars0884-chu.github.io/kids-board-game-kingdom/`；首頁、`?preview=jump-chess-online`、Manifest 與 Service Worker 均以 HTTP 200 回應。製作人已補充確認兩支 iPhone 一般 Safari 的連線與各 5 步棋步同步；不同網路、主畫面 PWA 與斷線後重新配對仍待 Producer Gate。

## 8. Machine Gate

目前已加入：

- `src/online/webrtc.ts`：訊號編碼、有效期限、offer／answer、分頁回傳、通道管理與可重送的雙方就緒握手。
- `src/online/WebRtcPairing.tsx`：分享邀請、乙一鍵回覆、甲開啟回覆後等待雙方就緒再完成配對。
- `src/games/jump-chess/JumpChessGame.tsx`：跳棋雙裝置角色、局面同步、回合鎖定與斷線提示。
- `scripts/verify-jump-chess-webrtc-playwright.mjs`：可重跑的 Edge 三分頁實際流程與落子同步驗證。
- `scripts/verify-jump-chess-online-layout-playwright.mjs`：Edge DPR 1 六尺寸連線頁 1:1 截圖、頁面／按鍵邊界、注音比例與「暫停語音」不存在檢查。


P09-ONLINE-r13 本機 Machine Gate 已通過：
pm.cmd run check` 為 36 個測試檔／191 項測試，內容 367 筆，
pm.cmd run build` 成功；匿名配對入口、家長同意、等待逾時、離開、檢舉、封鎖及 WebRTC session cleanup 已加入。尚未通過的外部 Gate 是 Firebase 專案建立、匿名登入／Realtime Database 實際規則部署、GitHub Pages Variables、兩台 iPhone Safari 公開網址隨機配對、不同網路與斷線回歸；在此之前不宣稱陌生人配對已上線。
v0.9.8 Machine Gate 已通過：工作區 check（36 個測試檔／190 項測試）、build、斷線 UI 回歸、Edge／公開 Pages 六尺寸版面、公開 Pages WebRTC 三分頁配對／棋步同步與 GitHub Actions build／deploy 均通過；完整驗證 ZIP 為 `releases/kids-board-game-kingdom-v0.9.8.zip`，共 248 個 ZIP 項目、封包內 `MANIFEST.sha256` 246 筆，外層 SHA-256 為 `233CE31843A995B1C461CBC2FD38387AC4935FFA2C29200D816A3D0D7BF4B1F6`，乾淨解壓逐項重算與
pm ci`、check、build 均通過。v0.9.7／v0.9.6／v0.9.5／v0.9.4／v0.9.3／v0.9.2／v0.9.1／v0.9.0 封存 ZIP／SHA-256 均承接且不修改。連線範圍仍僅為跳棋；其他棋類尚未整合 WebRTC。

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
- [Firebase Pricing](https://firebase.google.com/pricing)
- [Firebase Realtime Database Security Rules](https://firebase.google.com/docs/database/security)

