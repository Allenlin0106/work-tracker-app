# Work Tracker App 程式碼品質評估

> 版本：對應 git branch `claude/verify-content-ZxftO`（commit `8eefb2e`，docs v1.1 同步後）
> 評估日：2026-05-15
> 範圍：應用層原始碼 — 可讀性、可維護性、可測試性、DRY、命名、a11y、靜態工具鏈

---

## 1. 範圍與方法

- **評估對象**：`src/` 與 `server/` 全部源碼（不含 `dist/`、`node_modules/`）
- **方法**：grep / wc 量化指標 + 白箱閱讀識別反模式
- **評分尺度**：每維度以 A–F 評分；F 表示「未實作」、A 表示「已達主流標準」
- **不評估**：商業需求對錯、效能 benchmark、安全（屬 SECURITY-AUDIT）、架構分層（屬 ARCHITECTURE）

---

## 2. 量化指標一覽

### 2.1 後端（commit `045d24b` 拆分後）

| 檔 | 行數 | 註解率 | 觀察 |
|---|---|---|---|
| `server/index.js` | 45 | 8.8% | 純 wire-up |
| `server/routes/auth.js` | 65 | 1.5% | route handler 結構整齊；註解偏少 |
| `server/routes/crud.js` | 81 | 6.1% | `COLLECTIONS.forEach` 動態註冊 + `ownerFilter` |
| `server/routes/users.js` | 143 | 4.8% | 邏輯密度高；含「保留最後 admin」保護 |
| `server/middleware/auth.js` | 20 | 0% | 短小、可讀 |
| `server/middleware/rateLimit.js` | 19 | 0% | 短小 |
| `server/lib/audit.js` | 11 | 9.0% | 純函式 |
| `server/lib/sanitize.js` | 27 | 3.7% | 純函式 |
| `server/lib/security.js` | 29 | 10.3% | 純函式 |
| `server/db.js` | 54 | 1.8% | schema + `ensureFirstAdmin` |
| `server/config.js` | 16 | 6.2% | env 驗證 |
| `server/sockets.js` | 67 | 5.9% | 房間分流 |

### 2.2 前端

| 指標 | 值 | 評語 |
|---|---|---|
| `src/App.jsx` 行數 | 1865 | god component |
| useState | 49 | 過量；組合性差 |
| useMemo | 13 | 多含複雜業務邏輯 |
| useEffect | 2 | OK |
| useCallback / useRef | 0 / 0 | 缺；潛在 re-render 浪費 |
| `handleX` 函式 | 17 | 全集中於 `App()` |
| `apiPatch/Post/Delete` 呼叫 | 25 | 大多為 `apiPatch('tasks', ...)` |
| `className` > 80 字元 | 102 行 | Tailwind soup |
| JSX 最深縮排 | 41 spaces (~10 層) | 難讀 |
| try/catch | 25 | 錯誤處理不一致 |
| 註解率 | 2.1% | 偏低 |
| 已抽 `src/lib/` | 3 檔（api / security / socket） | 起步 |
| 已抽 `src/pages/` | 2 檔（AccountsPage / LogsQueryPage） | 起步 |

### 2.3 工具鏈

| 項目 | 狀態 | 影響 |
|---|---|---|
| TypeScript | ❌ 無 `tsconfig.json` | 49 useState 缺型別保護 |
| ESLint | ❌ 無設定檔 | 無 unused import / unreachable code 偵測 |
| Prettier | ❌ 無設定檔 | 格式分歧 |
| 測試 | ❌ 0 件（`*.test.* *.spec.*`） | 重構風險高 |
| `package.json` scripts | 僅 `dev` / `build` / `preview` | 缺 `lint` / `test` / `format` |

---

## 3. 發現一：前端 god component

**`src/App.jsx` 內 5–7 處應抽出為獨立 component：**

| 區段 | 約略行範圍 | 規模 / 痛點 |
|---|---|---|
| 任務列表 view | 1088–1400 | 312 行；含排序 header、行展開、狀態 badge |
| Gantt view | 1140–1248 | 108 行；axis / 時間單位 / 任務條 / 進度條 / checklist 條 |
| 週/月報區塊 | 1250–1350 | 含日期區間 + 過濾 + 報表 grid，三元條件多 |
| 任務詳情面板 | 1403–1595 | 192 行；附件 / 連結 / 循環 / checklist / log |
| 任務表單 modal | 1537–1738 | 200+ 行；建立/編輯共用 |
| Tag 管理 modal | 1740–1792 | 與 Group 結構完全相同 |
| Group 管理 modal | 1794–1846 | 與 Tag 結構完全相同 |

**影響**：閱讀 / grep / diff review 成本高；多人協作 merge conflict 機率高；無法針對單一 view 寫測試。

---

## 4. 發現二：業務邏輯應抽離至 `src/lib/` 或 `src/hooks/`

| 邏輯 | 行範圍 | 建議去處 |
|---|---|---|
| `formatDate` / `formatFullDateTime` / `toLocalMidnight` | 67–84 | `src/lib/dateUtils.js` |
| `getTaskStatus` | 91–106 | `src/lib/taskStatus.js` |
| `compressImage` | 119–149 | `src/lib/imageUtils.js` |
| `reportData` useMemo | 501–523 | `src/lib/reportData.js` |
| `ganttConfig` useMemo（83 行） | 531–613 | `src/lib/ganttConfig.js` |
| `getGanttPos` / `getGanttWidth` | 615–649 | `src/lib/ganttCalculations.js` |
| `executeRecurrence` | 837–860 | `src/lib/recurrence.js` |

**影響**：以上純函式或 stateless 計算與 React 生命週期無關，卻被綁在 `App.jsx` 內，難以單獨測試與重用。

---

## 5. 發現三：DRY 違反

| 反覆出現的 pattern | 出現位置 | 處理建議 |
|---|---|---|
| Modal 容器/header markup（`fixed inset-0 z-... flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm`） | 1742, 1796, 1850, 1856 (7+ 次) | 抽 `<ModalShell>` 通用 component |
| Tag / Group 管理 modal | 1740–1792 vs 1794–1846 | 幾乎雙胞胎，應參數化為 `<EntityManager>` |
| 色彩 grid picker（`grid grid-cols-9` / `flex flex-wrap`） | 1773–1776, 1827–1830 | 抽 `<ColorPicker>` |
| 輸入欄位 Tailwind class（`w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl ...`） | 1589, 1651, 1772, 1826 (8+ 次) | 抽 `<TextField>` |
| `apiPatch('tasks', id, ...)` | 690, 710, 727, 734, 749, 775, 792, 811, 828, 840, 1427, 1532, 1550 (10+ 次) | 抽 `useTask()` hook |
| `<Loader2 className="... animate-spin" />` | 13 處 | 抽 `<Spinner>` |

---

## 6. 發現四：state 管理 smell

49 個 useState 中，下列群組應**合併為 `useReducer` 或 Context**：

| 群組 | 涉及 state | 合理結構 |
|---|---|---|
| 任務編輯子狀態 | `taskForm`, `newChecklistItem`, `newChecklistStartDate`, `newChecklistEndDate`, `editingChecklistId`, `newLogText`, `editingLogId`, `detailLinkName`, `detailLinkUrl`, `previewImage` | 單一 `useReducer` 管理任務編輯 |
| Group 編輯 | `newGroupName`, `newGroupColor`, `editingGroupId` | 一個 reducer |
| Tag 編輯 | `newTagName`, `newTagColor`, `editingTagId` | 一個 reducer |
| 循環確認 | `showRecurConfirm`, `isRecurProcessing` | 一個 reducer |
| Modal 生命週期 | `isTaskModalOpen`, `isManagingGroups`, `isManagingTags`, `selectedTaskId`, `taskToDelete` | 單一 modal manager（Context 或 reducer） |

**命名不一致**：`isSubmittingTask` / `isSavingGroup` / `isSavingTag` / `isRecurProcessing` 動詞混用（Submit / Save / Process）。

---

## 7. 發現五：JSX 深度與 Tailwind soup

**深度熱點（縮排 ~41 spaces / 10 層）**

1. 任務列表的展開列（`1114–1245`）：`.map(task)` → `isExpanded` ternary → 巢狀 Gantt 條 → 巢狀 checklist `.map()` → 巢狀進度計算
2. 報表渲染（`1300–1330`）：報表迭代 → 任務群組 → 依類型分組的 logs/checklist → 條件 status badge
3. 任務詳情附件（`1462–1490`）：條件渲染 → `.filter()` → `.map()` → 圖片 vs 連結條件 → hover overlay → 刪除按鈕巢狀 onClick（8 層深）

**Tailwind soup**

- 102 行 `className` 超過 80 字元；部分超過 90 字元（1022, 1080, 1081, 1608, 1687, 1743）
- 按鈕 base class（`bg-slate-900 text-white rounded-2xl shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:bg-slate-300`）重複多次
- 建議：以常數抽出共用 class 字串，或評估 `@apply`

---

## 8. 發現六：錯誤處理 / Loading UX

| 議題 | 證據 | 影響 |
|---|---|---|
| 25 個 try/catch 但 UI 表現不一致 | `setFormError` 759、`setChecklistError`、直接顯示 `err.message` 759 | 使用者體驗不統一 |
| 部分錯誤未顯示給使用者 | group/tag delete 失敗 789–800, 825–833 | 操作失敗無回饋 |
| 直接顯示後端 `err.message` | 759（form save 路徑） | **可能洩漏內部訊息**（後端已加全域 handler，但前端 fallback 仍可能直連） |
| 通用網路錯誤訊息 | 332, 360 | OK |
| 無 toast / 通知系統 | – | 錯誤訊息易被使用者錯過 |
| 多個 loading flag 各自管理 | `isSubmittingTask` 205、`isSavingGroup` 206、`isSavingTag` 207、`isRecurProcessing` 208、`isLoggingIn` 202 | 缺集中 pattern |

---

## 9. 發現七：a11y 紅旗

| 問題 | 證據 |
|---|---|
| Modal 無 `role="dialog"` / `aria-modal="true"` / focus trap | 1403、1741、1795（鍵盤焦點會逃出） |
| icon-only button 缺 `aria-label` | 1022–1023, 1754, 1757（僅有 `title=`，screen reader 支援差） |
| 顏色為唯一狀態指示 | 進度條 1229–1230（rose vs indigo，無文字替代） |
| `<label>` 與 `<input>` 未以 `htmlFor` + `id` 關聯 | 1564–1565, 1698–1699 |
| modal close 鍵 `<X />` 無 `aria-label="close"` | 1744, 1798, 1859 |

---

## 10. 發現八：dead / 未使用程式

| 來源 | 觀察 |
|---|---|
| `HardDrive` 圖示（`lucide-react` import） | 已 import 但未渲染 |
| `Upload` 圖示 | 已 import 但未渲染 |
| `Image as ImageIcon` alias | alias 從未被使用（程式內直接用 `<Image>`） |

**附註**：在無 ESLint 環境下，這類 dead code 累積無人察覺；引入 lint 即可在 CI 攔下。

---

## 11. 發現九：工具鏈缺口（最高 ROI 補強點）

| 缺項 | 影響 | 引入成本 |
|---|---|---|
| ESLint（含 `eslint-plugin-react` / `eslint-plugin-react-hooks`） | 無 unused import / hooks rules 偵測 | < 0.5 天 |
| Prettier | 風格分歧（單/雙引號、行尾空白） | < 0.25 天 |
| TypeScript（增量 .ts / .tsx） | 49 useState 缺型別保護；資料 schema 與 UI 易脫鉤 | 中長期 |
| 單元測試（vitest + supertest） | 重構與升級風險高 | 中期 |
| `package.json` 補 `lint` / `test` / `format` script | 缺 npm-script 入口 | < 0.1 天 |

---

## 12. 後端品質觀察

| 維度 | 表現 |
|---|---|
| 模組劃分 | ✅ Phase 1 拆 12 檔，邊界清晰 |
| 函式長度 | ✅ 多數 < 30 行 |
| 防呆 | ✅ `routes/users.js` 保留最後 admin、不可停用/刪除自己 |
| 註解率 | ⚠️ 多檔 < 5%（與本身可讀性偏好有關，不一定要補） |
| `COLLECTIONS.forEach` 動態註冊（`routes/crud.js`） | ⚠️ 簡潔但靜態分析不友善；未來加 domain endpoints 時建議改具名 router |
| 缺 service / repository 層 | ⚠️ route handler 直呼 Mongoose（見 `ARCHITECTURE.md` 第 5.2 節） |
| 錯誤處理一致性 | ✅ 全域 error handler；route 內統一 `next(err)` |

---

## 13. 整體評分

| 維度 | 評分 | 理由 |
|---|---|---|
| 後端模組化 | **B+** | 12 檔邊界清晰；缺 service 層 |
| 前端組件化 | **D** | 1865 行 god component 仍佔主導 |
| 命名一致性 | **C** | 中英混用、loading flag 動詞不一 |
| DRY | **C** | Modal / 色彩 picker / form field 重複 |
| 錯誤處理 | **C** | 後端佳、前端不統一 |
| 註解 | **D** | 註解率多數 < 5% |
| 型別 | **F** | 無 TypeScript |
| Lint | **F** | 無 ESLint |
| 測試 | **F** | 0 件 |
| a11y | **D** | modal 無 focus trap、icon-only 缺 aria-label |
| 工具鏈 / npm scripts | **F** | 僅 `dev` / `build` / `preview` |

---

## 14. 改善路線圖

### 短期（< 1 週，幾乎無風險）

1. 引入 ESLint + Prettier，補 `npm run lint` / `npm run format` script
2. 跑一次 `npm run lint --fix` 處理基本問題；刪除 `HardDrive` / `Upload` / `ImageIcon` 等未使用 import
3. 為 `package.json` 加 `test` placeholder script（指向 vitest）
4. README 補一段「開發者規範」說明 lint / format 用法

### 中期（1–2 月，需 PR review）

1. 從 `src/App.jsx` 抽出 `src/lib/{dateUtils,gantt,recurrence,reportData,imageUtils,taskStatus}.js`
2. 抽 `<ModalShell>` / `<ColorPicker>` / `<TextField>` / `<Spinner>` 通用 component
3. 任務編輯 state 改 `useReducer`；建立 `useTask()` hook 封裝 `apiPatch('tasks', ...)`
4. 加 vitest（前端純函式）+ supertest（後端 routes 煙霧測試），先求覆蓋率 ≥ 30%
5. 補 a11y：modal `role="dialog"` + focus trap + icon-only button `aria-label`

### 長期（3+ 月，視成長決定）

1. 分批拆 `App.jsx` 為 `src/pages/{TaskListView,GanttView,ReportView,TaskDetail,TaskForm,GroupManager,TagManager}.jsx`
2. 增量導入 TypeScript（新檔 .ts/.tsx；舊檔 `// @ts-check`）
3. 評估 Tailwind class 抽離為 `@apply` 或 CSS Module

---

## 15. 與其他文件的對映

| 本文件章節 | 對映 |
|---|---|
| §3–§4（前端 god component / lib 抽離）| `ARCHITECTURE.md` §7.1 短期、§7.2 中期「前端 App.jsx 大幅拆分」 |
| §11（ESLint / Prettier / TypeScript / 測試）| `SECURITY-AUDIT.md` Phase 3 L1（CI 含 `npm audit`） — 同一波導入時可順勢進 CI |
| §12（後端缺 service 層）| `ARCHITECTURE.md` §5.2、`DB-EVALUATION.md` §6（與「Schema 強型別」呼應） |
| §6 state 管理 smell | `ARCHITECTURE.md` §5.1（業務邏輯前端化） |

---

## 16. 變更紀錄

| 日期 | 版本 | 摘要 |
|---|---|---|
| 2026-05-15 | 1.0 | 首版程式碼品質評估；對映 docs/ 其他三份文件 |
