# 暗棋可信連線服務部署紀錄

暗棋蓋牌排列只保存在 Cloudflare Durable Object；瀏覽器只能取得翻開後的公開棋面。此服務只處理暗棋，不取代 GitHub Pages 靜態前端或 Firebase 匿名配對。

## 前置條件

- 使用製作人自己的 Cloudflare 帳戶，維持 Workers Free；不需要購買網域或讓玩家登入該帳戶。
- `server/wrangler.toml` 使用 SQLite 型 Durable Object，符合免費方案的支援範圍。免費額度有限，超出時服務可能拒絕請求，不能宣稱無限量免費。
- 先確認 Firebase 的 `pairing/matches` 資料含 `gameId`、`hostUid`、`guestUid` 與 `expiresAt`，且正式規則只讓房間成員讀取。
- GitHub Pages 網址與 Firebase 專案設定應從已部署的正式設定核對，不從聊天截圖猜測。

## 部署步驟

1. 在專案目錄執行 `npx wrangler login --device --scopes user:read account:read workers_scripts:write`，由帳戶持有人在 Cloudflare 官方授權頁檢查權限後確認。預設登入會要求過多權限，不使用預設權限組；不要在聊天傳送密碼、長期 API Token 或授權後的憑證。
2. 首次使用 Cloudflare 的帳戶需先在主控台開啟「Workers & Pages」頁面，讓系統建立免費的 `workers.dev` 子網域；若跳過，正式部署會回報錯誤碼 10063。不需要購買網域或在網頁手動建立 Worker。
3. 執行 `npx wrangler deploy --config server/wrangler.toml --dry-run`，先驗證 Worker 打包與 Durable Object 綁定。
4. 用 `npx wrangler secret put FIREBASE_API_KEY --config server/wrangler.toml`、`FIREBASE_DATABASE_URL`、`ALLOWED_ORIGIN` 分別設定服務端環境值。`ALLOWED_ORIGIN` 必須是正式 GitHub Pages 的來源，不含路徑與結尾斜線。
5. 執行 `npx wrangler deploy --config server/wrangler.toml`，記錄 `workers.dev` 網址。正式 Pages 工作流程已直接設定公開的 `VITE_DARK_CHESS_WORKER_URL`，重新執行 Pages 部署即可。
6. 以兩個匿名 Firebase 玩家分別測試熟人與隨機配對、蓋牌遮蔽、翻牌與吃子、回合／版本衝突、重開、斷線重連及到期清除。只有完整通過才可將暗棋列為正式可用。

2026-09-24：本機打包、Cloudflare 最小權限授權及三個環境值設定已完成。首次部署遇到 10063，已依 Cloudflare 官方 API 建立 `kids-board-game-kingdom.workers.dev`，暗棋服務已部署至 `https://kids-board-dark-chess.kids-board-game-kingdom.workers.dev`，並關閉預覽網址。新子網域短暫 TLS 握手失敗後已可達；正式來源 CORS 預檢回 204，未登入與錯誤來源均回 403。`tests-live/dark-chess.live.ts` 以兩個新建匿名玩家通過蓋牌遮蔽、輪流翻牌、舊版本拒絕與雙端讀取，並刪除測試配對資料及匿名帳號。尚待兩支手機實機測試、其餘棋種的伺服端走法驗證、GitHub Pages 變數與版本封裝。不得因此文件推定六款遊戲已發布。
