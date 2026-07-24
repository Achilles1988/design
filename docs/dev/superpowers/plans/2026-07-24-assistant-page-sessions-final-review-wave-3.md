## Assistant Page Sessions Final Review Wave 3 Implementation Plan

> For agentic workers: execute inline with `executing-plans`; every production change requires a witnessed RED test first.

Goal: 修复 partial patch 字段覆盖、durable/volatile overlay 跨 Storage 合并，以及 New Chat 确认
owner 越权问题，并统一 durable clear 的文档能力边界。

Architecture: 内存 overlay 保存字段级 patch 与 clear 基线语义，不再保存由不完整读取物化出的整页
state；persist/repair/migration 在 durable base 上按顺序合并字段。New Chat 命令接收并校验
`{ pageKey, generation }`，Panel 在确认前后检查同一 owner。

Tech Stack: React 19、TypeScript、Vitest、Testing Library、assistant-ui LocalRuntime。

### 全局约束

- 严格执行 RED → GREEN；不增加依赖。
- 不修改或提交既有 `apps/design/package-lock.json`。
- 公共协议先更新 `docs/dev/api/assistant-ui-chat.md`，再更新代码与内部调用方。
- 完成后运行聚焦、相关、全量测试、构建与 `git diff --check`。

### Task 1：字段级 partial overlay

Files:

- Modify: `docs/dev/api/assistant-ui-chat.md`
- Modify: `apps/design/framework/src/shell/assistant/pageState.ts`
- Test: `apps/design/framework/src/shell/assistant/pageState.test.ts`

Interface:

```ts
type MemoryPageOverlay = {
  cleared: boolean
  patch: AssistantPageStatePatch
  updatedAt: string
}
```

- [x] 增加 RED：首次 `getItem` 瞬断、同次 persist 恢复时，filter partial patch 不得删除健康 messages。
- [x] 将 overlay 改为字段 patch；读取不可用时返回可用视图，但不把未知字段写入 overlay。
- [x] persist/repair 在最新 durable base 上物化 patch，成功后按 identity 清理。
- [x] 运行 pageState 聚焦测试确认 GREEN。

### Task 2：durable/volatile 同页字段合并

Files:

- Modify: `docs/dev/api/assistant-ui-chat.md`
- Modify: `apps/design/framework/src/shell/assistant/pageState.ts`
- Test: `apps/design/framework/src/shell/assistant/pageState.test.ts`

- [x] 增加 RED：durable filter patch 写失败 → getter unavailable → volatile 同页 messages patch →
  getter 恢复，最终 messages/filter 均保留。
- [x] migration 先应用 durable 字段 patch，再应用 volatile 字段 patch；同字段由后者覆盖，未触及字段保留。
- [x] 验证 patch、clear tombstone、repair 和 migration 共用字段级物化逻辑。
- [x] 运行 pageState 全文件确认 GREEN。

### Task 3：New Chat 确认 owner

Files:

- Modify: `docs/dev/api/assistant-ui-chat.md`
- Modify: `apps/design/framework/src/shell/assistant/pageSession.tsx`
- Modify: `apps/design/framework/src/shell/assistant/AssistantPanel.tsx`
- Test: `apps/design/framework/src/shell/assistant/pageSession.test.tsx`
- Test: `apps/design/framework/src/shell/assistant/AssistantPanel.test.tsx`

Interface:

```ts
startNewChat(owner: AssistantPageOwner): boolean
```

- [x] 增加 session RED：旧 owner 或 pending hydration 调用返回 `false`，不清当前页面。
- [x] 增加 Panel RED：A 打开确认，rerender 为 B 后确认；不得调用 start；`ready=false` 按钮禁用。
- [x] Panel 捕获确认发起 owner，并用 latest owner ref 在 await 后复核；session 在命令边界再次校验。
- [x] 所有内部调用传当前 owner；接受时返回 `true`，拒绝时无状态变化。
- [x] 运行 Panel/session 聚焦测试确认 GREEN。

### Task 4：durable clear 文档边界

Files:

- Modify: `docs/dev/superpowers/specs/2026-07-24-assistant-page-sessions-design.md`

- [x] 将“任何失败都不能让刷新后恢复”的绝对措辞改为：durable clear 成功才保证跨刷新为空；
  写失败时只保证当前 JS 会话 tombstone 与 warning，刷新后可能看到旧 durable 状态。
- [x] 检查验收段落无相互冲突的绝对承诺。

### Task 5：验证、报告与提交

- [x] 运行新增聚焦测试、assistant/session/filter 相关测试、完整 `npm run test`、`npm run build`。
- [x] 运行 `git diff --check`，确认 staged 文件不含 package-lock。
- [x] 追加 `.superpowers/sdd/final-fix-report.md`，记录每项 RED/GREEN 与能力边界。
- [x] 自审后提交并记录哈希。

### 自检

- 三个 Important 均有独立行为测试；字段级 overlay 同时覆盖单 Storage 与跨 Storage。
- 确认 owner 在 UI await 前后和 session mutation 边界双重校验。
- 设计规范与 API 文档对 durable clear 失败后的刷新行为一致。
