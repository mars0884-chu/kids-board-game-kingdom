# P09 匿名配對 Firebase 零費用試驗設定

本文件只適用於 P09-ONLINE-r13 的小規模匿名配對試驗。熟人私人邀請連結仍沿用既有 WebRTC 流程；Firebase 只負責陌生人配對佇列、短期信令與檢舉資料，不保存棋局。

## 服務與資料邊界

- 使用 Firebase Anonymous Authentication 取得不可顯示給玩家的暫時匿名 UID；不提供 Google 登入。
- 使用 Realtime Database 的 `pairing/queue`、`pairing/claims`、`pairing/matches` 與 `pairing/reports`。
- 不建立姓名、帳號、聊天、位置、聯絡人、兒童個資或行為檔案。
- 棋步仍走兩端之間的 WebRTC data channel；只使用既有公開 STUN，不使用 TURN、Cloudflare、房間伺服器或付費中繼。
- 等待配對逾時為 2 分鐘；配對完成後信令資料最多保留 5 分鐘，離開或斷線會清除可清除的暫存資料。
- 封鎖清單只存在玩家自己的瀏覽器；檢舉只送出匿名 UID、短期局號與時間，不接受文字理由或其他個資。

## Firebase 主控台一次性設定

1. 以製作人自己的 Google 帳號開啟 Firebase Console，建立專案；不要啟用 Google Analytics。
2. 專案維持 Spark 免費方案，不連結 Cloud Billing。這是零費用試驗的必要保護；Firebase 服務與免費額度仍以官方目前公告為準。
3. 在 Authentication → Sign-in method 啟用 Anonymous。
4. 在 Realtime Database 建立資料庫，先選鎖定模式，再套用專案根目錄的 `firebase.database.rules.json`。
   規則中的 pairing/queue 會允許已匿名登入玩家查詢短期匿名票券，這是客戶端尋找配對候選所需；不包含姓名、位置、聊天、棋局或兒童個資。
5. 將 Web App 設定中的七個值填入本機 `.env.local`；可從 `.env.example` 複製欄位名稱。
6. 在 GitHub 儲存庫的 Settings → Secrets and variables → Actions → Variables 新增同名的七個 `VITE_FIREBASE_*` Variables。Firebase Web config 不是私密金鑰，但仍只填入自己的試驗專案。
7. 觸發 GitHub Actions 的 Pages workflow。若 Variables 尚未設定，公開網站仍可建置，但隨機配對會明確顯示「隨機配對尚未設定」，不會偷偷使用未設定服務。

## 本機驗證

```powershell
Copy-Item .env.example .env.local
# 以文字編輯器填入 Firebase Web config
npm.cmd run check
npm.cmd run build
npm.cmd run dev -- --host 0.0.0.0
```

用兩台裝置開啟同一個本機 HTTPS 或已部署的 Pages 網址，分別選擇跳棋 → 雙裝置連線 → 隨機配對。兩端先閱讀家長同意畫面，再測試等待、配對、雙方就緒、棋步同步、離開、檢舉與封鎖。

## 停用與費用保護

小規模試驗結束後，先在 GitHub Actions 移除七個 Variables，再在 Firebase 主控台停用 Anonymous Authentication 與 Realtime Database；不要把 Firebase 設定或 `.env.local` 加入 Git。若要繼續擴大玩家量，必須重新檢視 Firebase 配額、濫用防護、家長同意與是否仍能維持零費用。

官方參考：[Firebase Pricing](https://firebase.google.com/pricing)、[Authentication](https://firebase.google.com/docs/auth)、[Realtime Database Security Rules](https://firebase.google.com/docs/database/security)。
