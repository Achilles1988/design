## Assistant Page Sessions Final Review Wave 2 Implementation Plan

> For agentic workers: execute inline with `executing-plans`; every production change requires a witnessed RED test first.

Goal: 修复同页 generation/ABA 迟到工具、已知工具缓存 payload、Storage I/O/repair、reset 异常恢复与 volatile 迁移问题。

Architecture: 页面筛选 owner 从字符串升级为 `{ pageKey, generation }`，generation 与 session/adapter
共享 epoch 同步推进；Store 解析使用 `valid/invalid/unavailable` 判别结果，repair 和 migration 统一通过
dirty overlay 合并写入。已知 `apply_filter` tool-call 在 Store 边界按共享 Zod schema 深校验。

Tech Stack: React 19、TypeScript、Vitest、Testing Library、Zod、assistant-ui LocalRuntime。

### 全局约束

- 严格执行 RED → GREEN；先看到聚焦测试按预期失败，再改生产代码。
- 不增加依赖，不修改或提交既有 `apps/design/package-lock.json`。
- 公共 API/协议先更新 `docs/dev/api/assistant-ui-chat.md`，再更新代码和所有内部调用方。
- 完成后运行聚焦、相关、全量测试、构建与 `git diff --check`。

### Task 1：页面 owner generation 与迟到工具防护

Files:

- Modify: `docs/dev/api/assistant-ui-chat.md`
- Modify: `apps/design/framework/src/shell/assistant/pageSession.tsx`
- Modify: `apps/design/framework/src/features/assets/usePersistentAssetFilter.ts`
- Modify: `apps/design/framework/src/features/assets/assistantFilterTool.tsx`
- Modify: `apps/design/framework/src/features/assets/AssetBrowserPage.tsx`
- Test: `apps/design/framework/src/shell/assistant/pageSession.test.tsx`
- Test: `apps/design/framework/src/features/assets/usePersistentAssetFilter.test.tsx`
- Test: `apps/design/framework/src/features/assets/assistantFilterTool.test.tsx`
- Test: `apps/design/framework/src/features/assets/assistantFiltering.integration.test.tsx`

Interface:

```ts
export type AssistantPageOwner = {
  pageKey: string
  generation: number
}

setPageFilter(owner: AssistantPageOwner, filter: Filter): PageFilterWriteResult
```

- [ ] 先更新 API 文档，说明 mutation 必须同时匹配 pageKey 与 generation。
- [ ] 增加 session RED：同页 New chat 后旧 owner 被拒绝；A→B→A 后旧 A owner 被拒绝。
- [ ] 增加 hook/tool RED：setter 与注册时 execute 携带完整 owner，而非只携带 pageKey。
- [ ] 增加真实 LocalRuntime RED：忽略 abort 的旧工具在同页 New chat 后、A→B→A 后均不能复活筛选。
- [ ] 实现 `AssistantPageOwner`，在 route hydration 和 New chat 时推进 generation，并在 session mutation
  边界同时校验 pageKey/generation。
- [ ] 更新 hook/tool/资产页调用链，旧 setter 在 generation 变化、换页或卸载后返回 `false`。
- [ ] 运行上述聚焦测试确认 GREEN。

### Task 2：已知 apply_filter payload 深校验

Files:

- Modify: `docs/dev/api/assistant-ui-chat.md`
- Modify: `apps/design/framework/src/lib/ai/schema.ts`
- Modify: `apps/design/framework/src/shell/assistant/pageState.ts`
- Test: `apps/design/framework/src/shell/assistant/pageState.test.ts`

Interface:

```ts
export const ApplyFilterArgsSchema = z.object({
  add: z.array(FilterDeltaAddSchema).default([]),
  remove: z.array(z.string()).default([]),
})
```

- [ ] 先更新 API 文档，说明已知工具 payload 按工具 schema 校验，坏页面缓存会被丢弃。
- [ ] 增加 RED：缓存 `apply_filter` 的 `args.add={}`、错误 result 形态时读取不得保留该页面。
- [ ] 抽取共享 `ApplyFilterArgsSchema`，让 runtime tool 与 Store 校验使用同一 schema。
- [ ] 对 `apply_filter` args/result 执行深校验；其他工具继续使用通用 JSON-safe 校验。
- [ ] 运行 pageState 聚焦测试确认 GREEN。

### Task 3：Storage unavailable、repair 与 volatile migration

Files:

- Modify: `docs/dev/api/assistant-ui-chat.md`
- Modify: `apps/design/framework/src/shell/assistant/pageState.ts`
- Test: `apps/design/framework/src/shell/assistant/pageState.test.ts`

Interface:

```ts
type ParseEnvelopeResult =
  | { status: 'valid'; envelope: AssistantPageStateEnvelopeV1; needsRepair: boolean }
  | { status: 'unavailable'; error: string }
```

- [ ] 先更新 API 文档，区分内容 invalid 与 Storage I/O unavailable。
- [ ] 增加 RED：`getItem` 瞬时失败时 read/persist 不得调用 `setItem`，健康 envelope 不得被空值覆盖。
- [ ] 增加 RED：真实 invalid repair 必须合并既有 dirty overlay 与 clear tombstone。
- [ ] 增加 RED：localStorage getter 临时失败时写入 volatile，getter 恢复后自动把 patch/tombstone 合并进
  durable envelope，保留 durable 其他页面。
- [ ] 将读取和 JSON/shape 校验分离；unavailable 直接返回失败/内存视图，不 repair。
- [ ] 提取带 overlay identity 清理的 envelope 合并写入；repair、正常 persist、volatile migration 共用。
- [ ] volatile 写入保留 dirty overlay/tombstone，durable 恢复后重试迁移。
- [ ] 运行 pageState 聚焦测试确认 GREEN。

### Task 4：reset handler 异常后的 session 恢复

Files:

- Modify: `docs/dev/api/assistant-ui-chat.md`
- Modify: `apps/design/framework/src/shell/assistant/pageSession.tsx`
- Test: `apps/design/framework/src/shell/assistant/pageSession.test.tsx`

- [ ] 先更新 API 文档，说明页面 reset handler 失败不阻塞 session ready/clearing 清理。
- [ ] 增加 RED：reset handler 抛错后 session 最终 ready、Store 已清空，且后续导航快照不再跳过该页。
- [ ] 用 `try/finally` 包围当前页 Runtime/page reset 流程；finally 必须恢复 state/ready 并删除
  `clearingPageKeysRef`，避免异常逃逸造成永久 Loading。
- [ ] 运行 pageSession 聚焦测试确认 GREEN。

### Task 5：最终验证、报告与提交

- [ ] 运行所有新增聚焦测试并记录结果。
- [ ] 运行 assistant/session/filter 相关测试。
- [ ] 运行完整 `npm run test` 与 `npm run build`。
- [ ] 运行 `git diff --check`，确认提交不含 `apps/design/package-lock.json`。
- [ ] 追加 `.superpowers/sdd/final-fix-report.md`，逐项记录 RED/GREEN 命令、结果、文件与自审。
- [ ] 提交 1–3 个逻辑提交，并记录提交哈希。

### 自检

- 5 项 finding 均有独立任务与 RED/GREEN 验收；generation 同时覆盖同页和 ABA。
- 公共签名、共享 schema、Storage 判别语义均先文档后实现。
- 未包含占位内容；接口名称在 session、hook、tool 和测试中一致。
