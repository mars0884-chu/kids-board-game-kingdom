# 五款公開局面遊戲可信連線

`animal-chess`、`gomoku`、`number-gem`、`reversi` 與 `tic-tac-toe` 由 `server/turn-game-worker.ts` 共用 Cloudflare Workers／SQLite Durable Object。Firebase 只負責匿名身分、房號／隨機配對與在線狀態；遊戲局面以 Worker 的序號及規則核心重算結果為準。暗棋另由 `server/dark-chess-worker.ts` 保留未翻資訊，兩者不可合併為客戶端權威棋盤。

公開服務網址：`https://kids-board-turn-games.kids-board-game-kingdom.workers.dev`。GitHub Pages 工作流程已設為 `VITE_TURN_GAME_WORKER_URL`；暗棋網址設為 `VITE_DARK_CHESS_WORKER_URL`。兩個網址是可公開的服務入口，不是帳號密碼。Worker 的 `FIREBASE_API_KEY`、`FIREBASE_DATABASE_URL`、`ALLOWED_ORIGIN` 由 Cloudflare Secret 保存；不得放進 GitHub 儲存庫。免費方案有額度上限，不宣稱無限制服務量。

正式服務只接受 `https://mars0884-chu.github.io` 網頁來源。每次請求須附 Firebase 匿名 ID Token；Worker 核對 Firebase 配對房間成員、棋種及有效期。房間以 match ID 分隔，Durable Object 排隊處理同一房間的同時棋步。舊序號、非當回合玩家與不符合規則核心的局面都會被拒絕。

手動部署：`npx.cmd wrangler deploy --config server/wrangler-turn-games.toml`。部署前先以 `npx.cmd wrangler deploy --config server/wrangler-turn-games.toml --dry-run` 檢查打包；必要環境值使用 `npx.cmd wrangler secret put <名稱> --config server/wrangler-turn-games.toml` 設定，切勿在指令紀錄或文件記下值。

隔離正式服務測試須明確指定 `FIREBASE_LIVE_SMOKE=1`、Firebase Web 公開設定及 Worker 網址，再執行 `npx.cmd vitest run --config firebase-live.config.ts`；測試只建立自己產生的房間，結束時刪除臨時房間與匿名帳號。`scripts/verify-turn-games-browser.mjs` 可用兩個隔離 Edge 視窗驗證六款熟人房號及首步同步；它會將本機測試來源轉接至已核准來源，不能取代公開 GitHub Pages 的 CORS 驗證或兩支手機的不同網路驗收。
