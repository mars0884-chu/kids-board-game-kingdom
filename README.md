# 綜合兒童棋藝大冒險 v0.10.3

這是提供 7 歲兒童使用的離線優先 PWA 棋藝遊戲。v0.10.3 承接跳棋 v0.9.8 的 WebRTC 斷線操作鎖定，以及 v0.10.0／P09-ONLINE-r13 的 Firebase 匿名隨機配對試驗程式；本版修正各模式選擇棋類時頁面無法滑動、返回鍵與教學下方按鍵超出畫面，以及暗棋正式新局每次使用相同固定排列的問題。固定種子仍保留給教學、測試與回放，正式自由練習／雙人新局會使用新的隨機種子。

所有兒童文案維持台灣繁體中文、每個中文字右側直排台灣注音與語音欄位；不新增後端、帳號、聊天、姓名、位置或兒童個資。熟人雙裝置仍使用私人邀請／回覆連結；陌生人匿名隨機配對僅在 Firebase 專案與 GitHub Pages Variables 完成設定後啟用，尚未把外部 Firebase 實機配對宣稱為完成。

公開遊玩網址：[GitHub Pages](https://mars0884-chu.github.io/kids-board-game-kingdom/)。

## 開啟完整驗證

1. 要直接遊玩請開啟上方 GitHub Pages 網址；本機驗證時請在專案工作區或完整驗證封包中啟動伺服器，不要直接開啟 `index.html`。
2. 目前工作區先以 `npm.cmd run dev -- --host 127.0.0.1 --port 5173` 啟動 v0.10.3，或在首頁依序選「雙裝置連線」→「跳棋」。跳棋直接預覽可使用 `?preview=jump-chess-adventure`、`?preview=jump-chess`、`?preview=jump-chess-local`、`?preview=jump-chess-online`；完整驗證封包位於 `releases/kids-board-game-kingdom-v0.10.3.zip`。
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
