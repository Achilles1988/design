## Assistant Page Sessions Final Review Wave 6 Implementation Plan

> Inline execution with strict RED → GREEN. Existing `apps/design/package-lock.json` changes are excluded.

Goal: 让 provisional ownership 只由真实消息快照变化认领，忽略 LocalRuntime mount 的 background
loading/capability 通知，同时保持首条真实用户消息即时持久化。

Architecture: session 在每次 hydration/reset 完成后记录当前 Runtime 的序列化消息 baseline。
订阅通知仍即时更新 `hasState`，但只有空闲消息快照相对 baseline 不同时才保存并 claim
provisional；路由稳定快照与 New Chat tombstone 的既有语义不变。

### Task 1：真实 LocalRuntime 回归

Files:

- Modify: `apps/design/framework/src/shell/assistant/pageSession.test.tsx`

- [x] 使用实际 `useLocalRuntime` 与可控 history adapter，验证 mount `__internal_load()` 产生
  loading true/false 且消息始终为空。
- [x] RED：provisional empty 初始 hydration 经上述通知后离开页面，不得覆盖原 durable 消息。
- [x] 保留正例：同一真实 Runtime 的首条用户消息在首次同步通知中持久化并替换旧 durable 消息。

### Task 2：消息 baseline 判定

Files:

- Modify: `apps/design/framework/src/shell/assistant/pageSession.tsx`

- [x] hydration/reset 完成后记录序列化消息 baseline。
- [x] 空闲订阅先比较序列化快照；相同则仅更新可见状态，不保存、不 claim provisional。
- [x] 不同则先推进 baseline，再复用 snapshot 写入并 claim provisional。
- [x] New Chat 清空 Runtime 后同步 baseline，避免随后 background 通知重写 tombstone。

### Task 3：验证、报告与提交

- [x] 运行新增聚焦、pageSession/pageState 及 assistant/filter 相关测试。
- [x] 运行完整 `npm run test`、`npm run build`、`git diff --check`。
- [x] 自审 baseline 初始化、路由切换、真实首消息、New Chat 与失败 overlay 生命周期。
- [x] 追加 `.superpowers/sdd/final-fix-report.md`，提交时排除 package-lock。

### 自检

- background loading/capability 通知不能提升 provisional ownership。
- 首条真实用户消息无需等待第二次通知即可写入。
- existing route snapshot、run idle、clear tombstone 与 warning 语义不回归。
