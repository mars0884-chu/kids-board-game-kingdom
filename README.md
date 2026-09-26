# 綜合兒童棋藝大冒險 v0.14.1

v0.14.1 修正象棋雙指縮放：標題、棋盤、教學回饋與操作鍵會一起放大，放大後可滑動查看；教學第四段明確說明士／仕只能在九宮內斜走一格。原 GitHub Pages 網址不變：[GitHub Pages](https://mars0884-chu.github.io/kids-board-game-kingdom/)。

本版沿用 v0.14.0 的象棋六段互動教學與課程離線存檔，不更動連線程式。製作人先前回報兩支 iPhone 15 Pro Max 使用電信商網路以八碼熟人房號及隨機配對完成象棋雙方各五步；這是製作人實機回報，並非本版重新實測。象棋協會規則的完整長將／長捉裁判、正式美術及台灣口音語音驗收仍未完成。

完整原始碼封包不含 Firebase Web App 設定；兩支手機實機連線請使用上方公開網址。若在本機自行建置線上版本，需另外提供 `.env.example` 所列的 Firebase Web App 公開設定；不需要製作人的 Google／Firebase 登入帳密。

v0.13.3 曾只提供象棋技術測試入口；本版已改為一般遊戲選單可選。v0.13.2 為前一版的八碼房號整合驗證修訂。

v0.13.1：熟人房號縮為八位數（舊十二位數仍可加入）；數字寶石雙裝置採同題搶答，每題 90 秒，無人答對換題不計敗局，先得三分獲勝，畫面不顯示倒數；黑白棋提示改為「選能翻棋的格子」。六款既有線上棋局採 Firebase 版本通知加快對手棋步回饋，並保留輪詢備援。象棋美術與台灣口音語音仍在候選／驗收階段，未納入此公開版。

以下 v0.12.0 段落保留作歷史操作背景；當前操作以本段為準。

v0.12.0 將跳棋熟人邀請也改為 Firebase Realtime Database。兩人皆可從主畫面 PWA 操作：甲按「邀請朋友」取得十二位數房號，乙按「輸入房號」後「加入遊戲」。不必離開遊戲或交換回覆連結；分享一次連結仍為選用方式。雙方就緒後進入棋盤。玩家使用自己的匿名 UID，不需要製作人的管理帳號密碼；離線遊戲不受影響。

邀請十分鐘內有效、最多一位朋友加入；已使用或過期可重新邀請。沿用 Spark 免費方案，不啟用帳單；免費額度不是無限容量保證。關閉整個分頁後續局仍不支援。

完整熟人瀏覽器驗證（本機 Edge，僅模擬器）：

```powershell
npx.cmd firebase-tools@15.30.0 emulators:exec --only auth,database --project demo-kids-board "npm run verify:firebase-friend"
```

此驗證包含獨立匿名身分、單次分享、雙向走棋、第三人拒絕及六尺寸版面。舊 verify:jump-chess-webrtc 與 verify:jump-chess-online-layout 指令轉至同一完整驗證，需在模擬器中執行；不再測試已退役的回覆連結操作。

新版 Firebase 規則須先發布，才可更新前端。使用既有 Spark 免費方案，不啟用帳單。詳見 docs/P09_ONLINE_SPEC.md 的 v0.11.0 範圍、隱私與限制。完整棋規在兩端引擎驗證，伺服器規則負責權限、回合及序號；不是完整防作弊伺服器。

本機模擬器驗證（Node.js 24、Java 21 以上）：

```powershell
npx.cmd firebase-tools@latest emulators:exec --only auth,database --project demo-kids-board "npm run test:firebase"
```

以下為既有遊戲與熟人邀請的操作說明；舊版修訂敘述保留為歷史紀錄，不代表 v0.11.0 已完成實機或線上發布驗收。

2026-09-17：v0.11.0 已完成 Firebase 規則發布與 Pages 部署。正式服務的隔離雙端測試已通過匿名登入、雙方就緒、雙向棋步同步與測試資料清理；尚未取代兩支手機的實機驗收。

正式服務驗證工具：先在程序環境提供 VITE_FIREBASE_API_KEY、VITE_FIREBASE_AUTH_DOMAIN、VITE_FIREBASE_DATABASE_URL、VITE_FIREBASE_PROJECT_ID，明確設定 FIREBASE_LIVE_SMOKE=1，再執行 `npx vitest run --config firebase-live.config.ts`。工具僅使用自建棋局，不加入公開配對，結束後刪除測試棋局與臨時匿名帳號；一般 check 與模擬器測試不會執行它。完整離線封包不內嵌正式服務設定；手機連線驗收請使用公開網站。

這是提供 7 歲兒童使用的離線優先 PWA 棋藝遊戲。v0.10.6 承接跳棋 v0.9.8 的 WebRTC 斷線操作鎖定，以及 v0.10.0／P09-ONLINE-r13 的 Firebase 匿名隨機配對試驗程式；本版修正各模式選擇棋類時頁面無法滑動、返回鍵與教學下方按鍵超出畫面，以及暗棋正式新局每次使用相同固定排列的問題。固定種子仍保留給教學、測試與回放，正式自由練習／雙人新局會使用新的隨機種子。本版修正 Firebase 匿名配對 match 尚未建立時的等待讀取權限，避免乙端在甲端建立 match 前被規則拒絕。

所有兒童文案維持台灣繁體中文、每個中文字右側直排台灣注音與語音欄位；不新增後端、帳號、聊天、姓名、位置或兒童個資。熟人雙裝置仍使用私人邀請／回覆連結；陌生人匿名隨機配對僅在 Firebase 專案與 GitHub Pages Variables 完成設定後啟用，尚未把外部 Firebase 實機配對宣稱為完成。

公開遊玩網址：[GitHub Pages](https://mars0884-chu.github.io/kids-board-game-kingdom/)。

## 開啟完整驗證

1. 要直接遊玩請開啟上方 GitHub Pages 網址；本機驗證時請在專案工作區或完整驗證封包中啟動伺服器，不要直接開啟 `index.html`。
2. 目前工作區先以 `npm.cmd run dev -- --host 127.0.0.1 --port 5173` 啟動；一般流程為首頁選擇模式，再選棋類。象棋可在四種模式中選擇；自由練習有四階 NPC、雙人同樂由兩位玩家輪流、雙裝置連線可選熟人或隨機配對。直接預覽舊入口仍可使用 `?preview=jump-chess-adventure`、`?preview=jump-chess`、`?preview=jump-chess-local`、`?preview=jump-chess-online`。
3. 跳棋四個正式驗證尺寸為 390×844、844×390、768×1024、1024×768，另以 430×932／932×430 回歸 iPhone 15 Pro Max 比例。冒險教學提供六關互動課程；第二至第四關指定不同位置並以金色外圈提示起始棋子，第五關不顯示數字路徑；`jump-chess` 提供四階 NPC 難度；`jump-chess-local` 提供同機雙人。請確認標準 121 孔六角星、下方第一位玩家先手、雙方各 10 枚、一般移動／連跳與結束回合；棋盤不拉伸、不產生頁面溢位，棋孔命中區至少 48px，並實際點擊棋子中心確認不會被相鄰透明棋孔攔截。舊動物棋、暗棋、黑白棋與數字寶石連線入口仍可使用原有參數。
4. 啟動器會讀取封包內版本號，使用隨機暫時本機連接埠，並只接受屬於本封包版本的伺服器；實際網址會顯示在命令視窗中。請保持驗證伺服器視窗開啟。
5. 暗棋請查驗：冒險闖關六關可逐關操作並重玩；自由練習顯示入門、成長、挑戰、成人版四階，且挑戰是一層／八候選、成人版是兩層／六候選；雙人同樂不顯示 NPC 難度且雙方手動。四個指定 viewport 均應在視窗內完整顯示、不需頁面捲動、無水平溢出，返回／聽一聽同列、暫停下一列填滿，每個中文字與其右側直排注音保持不可拆配對、略小但清楚且不互疊。首頁一般流程仍是「選擇模式 → 選擇棋類」，其他遊戲可執行 `START_VERIFICATION.cmd gomoku` 或 `START_VERIFICATION.cmd tic-tac-toe`。

### 雙裝置連線驗證

1. 甲開啟 `?preview=jump-chess-online`，按「分享邀請連結」，並保持這個遊戲分頁開啟。
2. 乙點開邀請連結；畫面會自動準備回覆連結，乙只按一次「一鍵回覆給甲」並把連結傳給甲。
3. 甲點開回覆連結；回覆頁會自動把資料交回甲原本的遊戲分頁，雙方不需再按連線鍵。
4. 連線完成後，甲移動一個合法棋步，確認乙收到相同棋盤與回合切換。若要使用自動化瀏覽器驗證，執行 `npm.cmd run verify:jump-chess-webrtc`。

連線頁版面回歸可執行 `npm.cmd run verify:jump-chess-online-layout` 與 `npm.cmd run verify:game-picker-layout`；它會以 Edge DPR 1 實際檢查四個正式尺寸，以及 430×932／932×430 的手機比例頁面與按鍵內文邊界。

需要 Windows、Node.js 24 或更新版本，以及可開啟本機網址的瀏覽器。乙開啟邀請後，回覆連結交換與連線準備最多保留 5 分鐘；甲端若收到短暫 `disconnected`，會先保留 5 秒觀察是否恢復，不會立即顯示斷線。完整驗證封包與歷史封存不放在公開儲存庫；本機驗證請使用專案工作區、啟動器與測試指令。

## 開發與檢查

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run build
npm.cmd run verify:jump-chess-online-layout
npm.cmd run verify:game-picker-layout
```

GitHub Pages 子路徑建置時設定 `VITE_BASE_PATH='/kids-board-game-kingdom/'`。動物棋規則與學習循環見 `docs/games/ANIMAL_CHESS_SPEC.md`；數字寶石連線規則見 `docs/games/NUMBER_GEM_CONNECTION_SPEC.md`；WebRTC 連線限制見 `docs/P09_ONLINE_SPEC.md`。
