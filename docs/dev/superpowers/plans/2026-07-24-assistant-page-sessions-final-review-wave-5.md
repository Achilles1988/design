## Assistant Page Sessions Final Review Wave 5 Implementation Plan

> Inline execution with strict RED → GREEN. Existing `apps/design/package-lock.json` changes are excluded.

Goal: 防止 provisional empty hydration 被自动快照成真实空消息，同时让 persistence warning 只在
dirty 状态真正 durable 后清除。

Architecture: Store 新增带权威性元数据的读取结果；durable read/migration 成功为 authoritative，
volatile、读取失败和 migration 写失败为 provisional。session 跟踪当前 active page 是否仍为
provisional：路由自动保存跳过未发生真实 Runtime 变化的 provisional 页面；Runtime 真实变化会
提升为 owned snapshot，New Chat 继续依赖 tombstone。

### Task 1：Store 读取权威性

Files:

- Modify: `apps/design/framework/src/shell/assistant/pageState.ts`
- Test: `apps/design/framework/src/shell/assistant/pageState.test.ts`

- [x] RED：getter unavailable 与 migration setItem 失败返回 `authoritative:false`；durable
  migration 成功返回 `authoritative:true`。
- [x] 新增 `AssistantPageStateReadResult` 与 `readAssistantPageStateResult()`。
- [x] resolved storage 携带 durable authority；parse unavailable 强制 provisional。
- [x] `readAssistantPageState()` 委托新 API 并仅返回 state。

### Task 2：provisional empty 不自动覆盖 durable

Files:

- Modify: `apps/design/framework/src/shell/assistant/pageSession.tsx`
- Test: `apps/design/framework/src/shell/assistant/pageSession.test.tsx`

- [x] RED：B 有 durable messages；getter unavailable 进入 B 得到 provisional empty；离开 B、
  恢复 Storage 后 durable messages 仍在。
- [x] RED：同场景由 migration setItem 失败触发，恢复后 durable messages 仍在。
- [x] session 记录 provisional active page；路由自动 snapshot 跳过未被 Runtime 真实改变的页面。

### Task 3：outage 中真实更新与 clear

Files:

- Modify: `apps/design/framework/src/shell/assistant/pageSession.tsx`
- Test: `apps/design/framework/src/shell/assistant/pageSession.test.tsx`

- [x] RED/GREEN：provisional hydration 后真实新增消息，恢复后 messages overlay durable 生效。
- [x] RED/GREEN：provisional hydration 后 New Chat，恢复后 clear tombstone durable 生效。
- [x] Runtime 真实 change snapshot 清除 provisional 标记；filter-only update 不把 provisional
  messages 自动物化为空。

### Task 4：warning 正反生命周期

Files:

- Modify: `apps/design/framework/src/shell/assistant/pageSession.tsx`
- Test: `apps/design/framework/src/shell/assistant/pageSession.test.tsx`

- [x] RED：旧 persistence error 后进入 volatile/provisional 页面，warning 必须保留。
- [x] 保留既有正例：getter/写入恢复、dirty migration 成功且 hydration authoritative 后清除。
- [x] restore/clear 异常继续以当前操作结果更新 warning。

### Task 5：验证、报告与提交

- [x] 运行聚焦、pageState/session 全文件及 assistant/filter 相关测试。
- [x] 运行完整 `npm run test`、`npm run build`、`git diff --check`。
- [x] 自审 authority 传播、自动/真实 snapshot 区分、tombstone 与 warning 生命周期。
- [x] 追加 `.superpowers/sdd/final-fix-report.md`，提交时排除 package-lock。

### 自检

- 两种 provisional 故障路径均不能制造 destructive empty snapshot。
- 用户真实新增与 New Chat clear 仍能覆盖旧 durable 状态。
- warning 的清除条件与 Store authority 同源，不依赖猜测 getter 状态。
