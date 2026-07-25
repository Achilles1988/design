## Core whole-branch review 修复报告

### 范围与提交

- 修复基线：`22e489bf`
- Finding 1：`5c3f2b21 fix(design): sandbox canvas preview execution`
- Finding 2：`bb92c3db fix(design): validate every canvas candidate`
- Finding 3：`466c9d8f fix(design): bind proposals to trusted context`
- Finding 4：`3a8be6ff fix(design): preserve concurrent canvas edits`
- 最终审查收口：`2134d21f fix(design): close canvas review security gaps`
- Context freshness 收口：`63841a29 fix(design): revalidate canvas apply context`
- 未增加依赖，未开展 multimodal 工作。

### 根因与决策

#### Finding 1：Canvas 运行时与 Shell 权限同域

根因是 `CanvasPreview` 在父 Shell realm 直接调用 `loadCanvasModule` 并渲染
AI 生成组件；静态源码规则不能阻止组件直接调用 `design-fs`。同时 proposal
card 丢弃了已批准设计要求中的候选源码审阅。

修复将 Canvas module 的加载和 React render 全部移入
`sandbox="allow-scripts"`、不含 `allow-same-origin` 的 `srcdoc` iframe。
iframe origin 为 opaque，父 Shell 不再 import 或执行 Canvas module。父页只接受
当前 iframe `contentWindow`、`origin === "null"`、精确 type/key/generation 的
`ready` / `error` 消息，消息通道不暴露 mutation capability。

`design-fs` 对所有 opaque/cross-site 请求返回 `403`，mutation 还要求精确
same-origin `Origin`。最终独立审查发现，单凭全局
`Access-Control-Allow-Origin: null` 仍会让所有 opaque origin 共享权限。最终方案
因此改成 preview-session capability：同源 Shell 只发送 `appId + canvasId`，服务端
从磁盘派生当前 Canvas、直接 CSS 和 realpath/symlink-safe 共享组件精确清单，签发
30 分钟不可猜 token。iframe import map 把 Vite module/HMR 请求改写到 token
namespace；middleware 只接受 `Origin:null + Sec-Fetch-Dest:script`、有效 token、
精确 allowlist 和安全 query。无 token、普通 fetch、`?raw/?url/?worker`、另一
Canvas/App、`/@fs` 与 privileged `__*` 均为 `403`。旧版 `getApp` 的读时落盘
migration 也被移除，GET/HEAD 不再产生磁盘副作用。

srcdoc bootstrap 自身包裹所有 runtime/frame dynamic import；任何导入失败都会发送
同一限长、严格 type/generation 的 `canvas-preview:error`，不再永久停在空白
`loading`。

第二轮独立复审又发现两个 capability 生命周期缺口：当前 Canvas entry 若是指向同目录
另一 Canvas 的 symlink，realpath containment 仍会放行；30 分钟 token 到期后，已打开
页面的 HMR/lazy import 会永久收到 `403`。目标 loader 现在要求当前 Canvas TSX 为
`lstat().isFile()` 且不是 symlink。preview-session 响应新增 ISO `expiresAt`，
`CanvasPreview` 在到期前 1 分钟重新申请 capability 并 remount iframe；这既保持长时间
打开页面的模块通道可用，也按既有 preview remount 语义清理 Canvas 本地状态。

复核上述修复时又定位到签发后替换窗口：session 原本只保存 URL 字符串 allowlist，
所以普通文件签发后被换成指向另一 Canvas 的 symlink，旧 token 在剩余 TTL 内仍会
放行。session 现在为每个 App module 保存签发时的 absolute/real path；每次 capability
GET 都异步重做 `lstat + realpath`，要求仍是普通非 symlink 文件且真实路径未变。
删除、symlink 或 parent path 重定向都 fail closed。授权检查与 Vite 实际读取之间仍只有
下文声明的微小无锁 TOCTOU，不再有整个 30 分钟 session 生命周期的复核缺口。

Proposal card 现在携带独立的只读 `candidateFiles` review copy，并以英文
`<details>` 渲染 path/source；apply body 仍只有 `proposalId + aiConfig`，
事务始终使用 server-side authoritative candidate。

#### Finding 2：Vite 只 transform Canvas entry

根因是生产 validator 只执行一次
`server.transformRequest('/@fs/<Canvas entry>')`。Vite entry transform 会解析
import specifier，却不会必然 transform 一个新建依赖的 TSX 内容，因此 invalid
dependency 可以被误报为 apply 成功。

事务现在构造稳定 relative-path 顺序的 validation targets：当前 Canvas entry
以及每个 candidate `.ts`、`.tsx`、`.css`。生产 validator 逐个 invalidate
module graph 并 transform，每个错误都带安全的 candidate relative path；repair
前的 dependency allowlist 仍保持强制执行。

#### Finding 3：proposal 未绑定设计 contract 与原始意图

根因是 StoredProposal 只有文件 hash。apply 无法发现 `app.json`、Style 或所选
installed Layout contract 在审批后变化；repair 只获得 diagnostic 与 candidate，
会丢失用户意图和审批时的设计/保留约束。

Context loader 从同一份 raw `app.json` 字节解析 App 并计算 SHA-256，加载的
Style/Layout contract 也携带 source hash。读取 `app.json` 后再次比较字节，
避免把不同时间点的 parsed config 与 hash 拼成一个 context。

Proposal store 保存私有 `trusted`：

- raw `app.json` hash；
- Style id/hash；
- 所选 installed Layout id/hash，temporary Layout 为 `null`；
- 最后一条 user message 的 text-only、凭据清洗、限长意图；
- 独立深拷贝的 Style id、Layout decision、preservation constraints。

Installed Layout 没有实际 contract 时不能 staging。apply 在任何写入前重新加载
context 并比较三类 fingerprint。每个 repair request 从 server-side proposal
和已验证 context 重建，包含原始意图、完整当前 Style contract、installed
Layout contract 或 temporary decision、保留约束、compact diagnostic 与完整
candidate set。API key 和无关聊天历史不进入 proposal。

最终 whole-branch 复审发现 apply-start snapshot 仍不足：Style/Layout/app config 或
reused read-only component 可在 Vite validation / repair pending 时变化，而旧事务仍用
初始 `repairContext` 返回成功。事务现在通过统一 `reloadAndVerifyContext` 在 apply
开始、每次 validation 前后、每次 repair 后以及 success return 前重新加载。每个
checkpoint 核对 App/Style/selected Layout fingerprint、当前 Canvas identity 与全部
read-only baseline；repair request 只从 validation 后最新且核验通过的 context 重建。
repair resolve/reject 后都会再次核验，未核验 candidate 不会进入下一次写入。

重复 context check 不比较 writable target 的 proposal 原始 hash；它们继续完全由
`expectedSource` / `lastWrittenSource` 状态机管理。Read-only baseline 则在初始 context
固定 absolute path + realpath + source，每个 checkpoint 核对 regular/non-symlink 身份并
直接 reread；fresh context 若仍枚举该文件，其 path/source 也必须一致。Reused component
必须继续出现在 fresh context，扫描遗漏也 fail closed；仅同 Canvas 目录的 CSS 可因
candidate 移除 import 而不再枚举，但绑定身份/source 仍须不变。每个 checkpoint 还以
fresh 文件覆盖 approval-time 授权文件后重跑 dependency / exact reused 校验；本事务
create-shared 路径从该混合集合排除，所以仍按 candidate 处理。这样既保留不再动态
发现的 approved Canvas CSS，又能发现新 `.ts` / `.tsx` 文件导致的 extensionless
import 歧义。

#### Finding 4：repair/rollback 无条件覆盖磁盘

根因是 baseline 只在事务开始检查一次。等待 validation/repair 期间的 IDE 修改
会被下一次 candidate write 覆盖；终态 rollback 也会无条件 restore/delete。

每个 writable target 现在追踪：

- `originalSource`；
- 当前 `expectedSource`，包括 expected absence；
- 本事务最后成功写入的 `lastWrittenSource`；
- 初始绑定的 `expectedRealPath`。

事务在每次 atomic write 前后检查 regular/non-symlink `lstat`、realpath 与
`expectedSource`，只有 writer 成功并通过身份复核后才推进。Rollback 对每个已写
target 重复身份/source 检查；只有当前身份仍绑定且内容等于 `lastWrittenSource`
才 restore/delete。发现外部修改（包括同源 symlink 替换）时保留该修改，继续
best-effort rollback 其他目标，并返回现有英文 manual-inspection error、
`rolledBack:false`。最终审查还补出 validation 成功时的终态缺口：现在每次异步
Vite validation resolve/reject 后都会重读全部已写 target，通过后才可返回成功、
进入 repair 或 terminal rollback。

#### 最终审查：repair prompt authority

最终独立审查发现 repair 把可信约束、diagnostic 与 candidate 串在同一 user prompt，
恶意注释/诊断可能把未重新 review 的 repair 引向不同语义。修复使用完全静态的 system
authority policy，并把所有动态值一次 `JSON.stringify` 成单一 envelope：
`trustedRequirements` 只提供 UI-domain 要求，`untrustedEvidence` 只提供诊断与源码
证据。固定规则明确任何动态 prose、注释、字符串或伪 delimiter 都不能改变角色、任务、
路径集合或输出协议；既有 schema/path/dependency/Vite/transaction 后置边界保持不变。

### RED 证据

#### Finding 1

初始聚焦回归分别证明：

- proposal protocol/card 的 `candidateFiles` 为 `undefined`；
- UI 找不到 `Review candidate source`；
- `CanvasPreview` 不存在 sandbox iframe，仍在父 realm 调用 loader；
- `Origin: null` 的 `design-fs` POST/DELETE 返回 `200`，预期 `403`。

真实 Chromium 首轮还发现 opaque iframe 被 Vite runtime 的
`/node_modules/vite/dist/client/env.mjs` CORS 拦截，frame 停在 `loading`。
增加 exact runtime path 回归后，测试先以缺少 ACAO 失败，再最小放行该路径。

最终独立审查新增三组 RED：

- 真实 Vite `Origin:null GET /apps/.gitkeep` 返回 `200 + ACAO:null`，证明全局
  null-origin allowlist 泄露其他 App 源码；capability 测试初始拿不到
  `preview-session.moduleBase`，direct opaque request 仍进入 Vite 并返回 `599`；
- `canvasPreviewDocument` 中 bootstrap imports 没有 `catch`，测试找不到
  `canvas-preview:error`，证明 import 失败会永久 loading；
- 恶意 diagnostic/candidate 测试对旧 repair prompt 执行 `JSON.parse` 直接以
  `Unexpected token 'R', "Repair the"... is not valid JSON` 失败，且没有静态
  system authority。

第二轮独立复审新增两个 RED：

- 将 `Home.tsx` symlink 到同目录 `Other.tsx` 后，旧 loader 仍 resolve target，
  未抛出预期的 `regular file` 错误；
- 签发即将到期的 capability 后，旧 `CanvasPreview` 只调用一次
  `createPreviewSession`，等待到期也没有获取第二个 token。

同轮协议/Store RED 还确认旧 preview-session 响应会拒绝或遗漏 `expiresAt`。

后续签发后替换 RED 使用真实临时文件先签发 token，再把 `Home.tsx` 换成
`Home.tsx -> Other.tsx`：旧 Store 仍返回 `true`，middleware 实际请求仍进入下游并
返回 `599`，而目标是 `false` / `403`。加入逐请求文件复核后，Store 与 HTTP 两层回归
分别转绿。

#### Finding 2

真实 Vite regression 创建合法 entry，entry import 一个新建但 TSX 语法错误的
`components/Select.tsx`。旧实现实际返回：

```text
expected { ok: true, ... } to match { ok: false, ... }
```

即旧 validator 只 transform entry 并误报成功。

#### Finding 3

Finding 3 初始聚焦运行结果为 `4 failed files / 8 failed tests / 299 passed`：

- context 没有 app/style/layout hash；
- model staging 没有第三个 original intent；
- proposal claim 没有 private `trusted`；
- app config、Style、selected Layout 变化后仍返回 `ok:true`；
- repair prompt 不含 intent/contracts/preservation。

最终 context-freshness RED 使用真实临时文件与 deferred Promise：

- reused `Button.tsx` 在 validation pending 时变化，旧实现仍返回
  `{ ok:true, repairAttempts:0 }`；
- Style contract 在 repair pending 时变化，旧实现仍返回
  `{ ok:true, repairAttempts:1 }`；
- reload dependency 已返回新 Style source，旧 repair request 仍携带初始
  `# Dashboard`；
- candidate Canvas 导致 fresh context 不再枚举原只读 CSS 时，第一版修复误报
  proposal conflict，证明 repeated check 不能依赖动态 discovery 集合；
- validation pending 时新增与 approved `Button.tsx` 同名的 `Button.ts`，旧实现仍
  返回成功，证明 checkpoint 必须重跑 fresh dependency resolution；
- reused component 从 fresh context 消失但旧 absolute path 仍可读同源时，旧实现仍
  返回成功，证明非 Canvas CSS 的 discovery omission 必须 fail closed；
- validation pending 时把本事务 create-shared target 换为同源 symlink，旧实现仍
  返回成功；新实现保留 symlink、回滚其他未变 target 并返回 `rolledBack:false`；
- validation pending 时把 read-only baseline 换为同源 symlink，旧实现仍返回成功；
  新实现返回 proposal conflict、回滚事务写入并保留外部 symlink；
- 合法 package CSS 与 candidate component CSS import 在首次 reload 被旧 loader
  错误转成 proposal conflict；真实 server integration 证明修复后 apply 成功。

最终实现对 context/dependency conflict 返回 proposal conflict 并条件回滚本事务
写入；外部 read-only 修改/新增保留。Canvas CSS discovery 用例通过初始
absolute/source 直接 reread 后正常成功。

#### Finding 4

两个真实临时文件并发回归在旧实现上均失败：

- repair pending 时写入 IDE source，旧实现继续写 repaired source 并返回
  `ok:true`；
- terminal rollback 前写入 IDE source，旧实现恢复 original 并返回
  `Canvas validation failed... / rolledBack:true`。

目标行为分别是保留 IDE source，并返回 manual-inspection error、
`rolledBack:false`。

最终 validation-boundary RED 在 validation pending 时写入 IDE source；旧实现收到
validation success 后仍返回 `{ ok:true, repairAttempts:0 }`。新实现检测到 source
变化，保留 IDE source、回滚其他未被外部修改的 target，并返回
`rolledBack:false` manual-inspection error。

### 实现与测试文件摘要

#### Preview 与权限边界

- `framework/src/preview/CanvasPreview.tsx`
- `framework/src/preview/canvasPreviewDocument.ts`
- `framework/src/preview/canvasPreviewFrame.tsx`
- `framework/vite-plugins/canvas-assistant/previewSessions.ts`
- `framework/vite-plugins/design-fs/plugin.ts`
- `framework/vite-plugins/design-fs/store.ts`
- `framework/vite-plugins/canvas-assistant/plugin.ts`
- `framework/src/preview/CanvasAssistantTools.tsx`
- `framework/src/lib/canvasAssistantProtocol.ts`

对应新增/扩展 preview、protocol、proposal、plugin、store 测试，并同步
`docs/dev/api/assistant-ui-chat.md`、`design-fs.md`、
`canvas-assistant.md`。

#### Validation、trusted proposal 与 transaction

- `framework/vite-plugins/canvas-assistant/context.ts`
- `framework/vite-plugins/canvas-assistant/model.ts`
- `framework/vite-plugins/canvas-assistant/proposals.ts`
- `framework/vite-plugins/canvas-assistant/transaction.ts`
- `framework/vite-plugins/canvas-assistant/authoring.integration.test.ts`
- `framework/vite-plugins/canvas-assistant/transaction.test.ts`

测试覆盖真实 Vite 新依赖、真实磁盘 app/style/layout stage→apply conflict、
installed/temporary repair context、凭据/路径 diagnostic redaction、repair pending
IDE edit、validation/repair pending context conflict、latest verified repair
context、read-only discovery 变化、fresh extensionless resolution ambiguity、
conditional rollback 和无外部修改的完整 success/rollback 路径。

### 运行态安全证明

Finding 1 首轮使用真实 Playwright/Chromium 打开临时恶意 Canvas：

- 父页 iframe：`sandbox="allow-scripts"`；
- `data-preview-state="ready"`，证明不是只安全但不可用；
- 父页读取 iframe origin 得到 `SecurityError`，证明没有 same-origin；
- Canvas 顶层 DELETE `victim` 与 POST `sandbox-intruder` 均在 null-origin
  CORS preflight 被拦截；
- 磁盘结果：`victim-preserved`、`intruder-not-created`。

正常 same-origin Shell `designApi` create/delete 由真实 HTTP plugin regression
验证仍成功。临时 App/Canvas 探针、Vite server 与 Chrome profile 已清理。

capability 最终收口后，当前环境没有可连接的 in-app/Chrome browser 实例，因此没有
伪称重跑 Chromium。改用实际 Vite 6.4.3 server 运行临时双 App 探针：

- preview session 返回 `200`、随机 token 和 server-derived `Home.tsx`；
- frame、loader、Vite client、prebundled dependency、当前 Canvas/CSS/component
  全部经 token namespace 返回 `200 + ACAO:null`；
- 另一 Canvas、另一 App、direct root、普通 fetch destination、`?raw` 和
  privileged path 全部返回 `403` 且无 ACAO；
- HMR `?t=123` 仍经 token namespace 返回 `200 + ACAO:null`。

bootstrap failure 由生成文档测试确定性验证 try/catch、严格 error type/generation
与 4,000 字符上限。最终临时双 App、Vite server 与空目录均已清理。

### 验证

在修复完成后从 `apps/design` 运行全新命令：

```text
npm run test: 47 files / 617 tests passed
./node_modules/.bin/tsc -b --force: exit 0
npm run build: 1007 modules transformed / built successfully
git diff --check: exit 0
```

阶段聚焦证据：

- Finding 1：`8 files / 122 tests passed`，另有真实 Chromium probe；
- Finding 2：`3 files / 240 tests passed`，含真实 Vite regression；
- Finding 3：`7 files / 340 tests passed`，含真实磁盘 conflict；
- Finding 4 收尾 suite：`8 files / 349 tests passed`。
- 最终审查修复：初始 capability/bootstrap/prompt RED 为
  `3 failed files / 4 failed tests / 242 passed`；validation-boundary RED 为
  `1 failed / 228 passed`；第一轮最终聚焦为 `7 files / 278 tests passed`。
- 第二轮 capability 生命周期 RED 精确命中 response expiry、Canvas entry symlink、
  前端 renewal 与签发后 symlink 替换；逐请求复核 GREEN 为 Store
  `1 file / 5 tests passed`、插件集成 `1 file / 15 tests passed`。最终聚焦、全量
  测试、TypeScript、build 与 diff-check 结果见上述最新数据。
- 最终 context-freshness 收口先得到 `3 failed / 230 skipped` 的精确旧误成功/旧
  repairContext RED；后续 CSS discovery、fresh extension ambiguity、fresh omission、
  writable/read-only 同源 symlink 与 package/candidate CSS false-conflict 都先得到
  精确 RED。最终 transaction 为 `1 file / 238 tests passed`，context + transaction
  为 `2 files / 254 tests passed`，context/transaction/model/plugin/server
  integration 聚焦为 `5 files / 289 tests passed`。
- 最新 7-file diff 经独立只读复核确认无 Critical、无 Important；独立聚焦验证为
  context + transaction `254/254`、authoring integration `10/10`，并通过
  `git diff --check 79d55a8e`。

### Security boundary 与残余风险

- 权限边界是浏览器 origin + server same-origin enforcement，不是源码 ban。
  Shell 保留 filesystem/API authority；opaque preview 没有 mutation channel。
- Preview 为开发态运行仍需执行 Vite runtime、当前 Canvas、直接 CSS、当前 App
  exact shared component 与 prebundled dependencies。普通 fetch destination 和
  Vite raw/url/worker transforms 被拒绝；生成代码仍可执行/组合已授权模块，并加载
  `/@vite/client` 共享 HMR WebSocket。HMR metadata 与开发服务器资源消耗不是此
  sandbox 的隔离保证。
- Sandbox 不授予 same-origin、popup 或父 DOM 能力，但生成代码仍能执行 CPU 工作
  及发起普通外部网络请求；本修复保证的是本地 privileged mutation 不被接受，
  不是通用不受信任代码执行容器。
- Candidate source 按产品要求显示在只读 review，并发送给 repair model；它不进入
  apply body 或 server logs。
- Source compare 与 atomic rename 之间仍存在极小 TOCTOU 窗口；没有 OS-level
  locking 时无法完全消除。所有已知 validation/repair 异步边界均重新比较。
- App/Style/Layout 与 read-only baseline 会在 validation/repair checkpoint 重载；
  checkpoint 结束到下一段同步逻辑之间仍有极小无锁窗口。Writable target 另有逐写
  guard；contract/read-only 文件没有 OS-level lock。
- Style/Layout、intent、diagnostic 与 candidate 都可能包含 prompt injection。
  最终边界仍由固定 candidate path schema、dependency allowlist、全 target Vite
  validation、compare-before-write 和 conditional rollback 提供。

### 自审与关注点

- 最终独立只读复核未发现剩余 Critical 或 Important。
- 已确认父 Shell 不再 import/call `loadCanvasModule`；该调用只存在于 iframe
  bootstrap module。
- 已确认 `Origin:null` 不再作为身份：只有 session token namespace 返回 ACAO，
  direct/guessed/expired/跨目标/危险 query/普通 fetch 均失败。
- 已确认 server 从 `appId + canvasId` 派生 component，精确扫描组件文件，不接受
  browser 提交 filename；当前 Canvas entry、组件 symlink 与 App 外 canvases
  directory 被拒绝。
- 已确认 preview session 返回严格 ISO `expiresAt`，页面会在到期前续签并 remount，
  长时间打开后的 HMR/lazy import 不会继续使用过期 token。
- 已确认签发后的普通文件被删除、替换为 symlink 或解析到不同 realpath 时，旧 token
  会在下一次 module GET 立即失效。
- 已确认浏览器 card mutation 不会改变 server candidate 或 trusted constraints。
- 已确认 temporary Layout 没有伪造 installed contract fingerprint/source。
- 已确认 validation/repair pending 期间 App/Style/Layout/read-only baseline 变化会
  返回 proposal conflict；每个 repair request 使用最新核验 context，writable 与
  create-shared 不会被重复 context check 误判。
- 已确认 checkpoint dependency 校验会发现 fresh extensionless import 歧义；reused
  component 从 fresh context 消失时 fail closed，只有 unchanged Canvas CSS 可因
  candidate discovery 变化被保留。
- 已确认 writable target 在写前后、checkpoint 与 rollback 都核验 regular-file
  identity/realpath/source；同源 symlink 替换不会成功或被 rollback 删除。
- 已确认 package CSS 与 candidate component CSS 不会被 fresh context 错归为 writable
  Canvas CSS；dependency allowlist 与 Vite validation 继续承担校验。
- 已确认所有失败、conflict、incomplete rollback 路径不发送
  `canvas-assistant:applied` HMR event。
- 需要关注的非阻塞项是共享 dev HMR、普通外部网络/CPU 能力、上述微小 TOCTOU，以及
  capability 最终版因浏览器实例不可用而只有实际 Vite HTTP、非第二次 Chromium
  证明；本次未引入新依赖或扩大 apply/browser mutation contract。
