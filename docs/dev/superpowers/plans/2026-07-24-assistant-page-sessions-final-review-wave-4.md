## Assistant Page Sessions Final Review Wave 4 Implementation Plan

> Inline execution with strict RED → GREEN. Existing `apps/design/package-lock.json` changes are excluded.

Goal: 保证浏览器 Storage 能力/身份切换期间的当前会话内存连续性，修正成功写入返回快照，并在
正常 hydration/migration 后清除旧持久化错误。

Architecture: 隐式浏览器存储路径使用单一进程级 logical overlay；显式注入 Storage 继续使用
WeakMap 按实例隔离。persist 接收本次逻辑 overlay 并返回实际写入的 merged envelope。session
在无异常 hydration 完成后将旧 persistence error 置空。

### Task 1：进程级 logical overlay

Files:

- Modify: `apps/design/framework/src/shell/assistant/pageState.ts`
- Test: `apps/design/framework/src/shell/assistant/pageSession.test.tsx`

- [x] RED：durable filter 写失败后 getter unavailable，在 volatile 路径保存同页 messages；
  A→B→A 的 outage hydration 必须同时恢复 filter 与 messages。
- [x] 隐式浏览器读写统一选择 `browserMemoryPages`；显式 Storage 仍选择实例 overlay。
- [x] repair、persist、migration 均显式接收所选 overlay，成功后按 wrapper identity 清理。
- [x] 保留 clear tombstone、getter 恢复迁移和跨页面 dirty retry 语义。

### Task 2：成功写入返回 merged snapshot

Files:

- Modify: `apps/design/framework/src/shell/assistant/pageState.ts`
- Test: `apps/design/framework/src/shell/assistant/pageState.test.ts`

- [x] RED：前两次读取成功、`setItem` 成功、紧随回读抛错时，patch 返回 `ok:true` 且 state
  仍包含刚写入消息。
- [x] `persistEnvelopeWithOverlays` / `persistDirtyPages` 成功结果携带实际写入 envelope。
- [x] patch 成功直接从 merged envelope 取目标页 state，不进行第二次 Storage 读取。

### Task 3：hydration 成功清除旧 persistenceError

Files:

- Modify: `apps/design/framework/src/shell/assistant/pageSession.tsx`
- Test: `apps/design/framework/src/shell/assistant/pageSession.test.tsx`

- [x] RED：写入失败产生 warning；outage 导航 pending；getter/写入恢复后完成 migration 与
  destination hydration，warning 必须清除。
- [x] hydration 成功分支清除旧错误；restore/clear 异常分支继续保留当前真实结果。

### Task 4：验证、报告与提交

- [x] 运行新增聚焦测试、pageState/session 全文件、assistant/filter 相关测试。
- [x] 运行完整 `npm run test`、`npm run build`、`git diff --check`。
- [x] 自审 logical overlay 隔离、tombstone、repair、migration 与错误生命周期。
- [x] 追加 `.superpowers/sdd/final-fix-report.md`，提交时排除 package-lock。

### 自检

- 每项 finding 有独立 RED，失败原因直接对应现有根因。
- 浏览器能力切换不再等同于逻辑会话切换；显式 Storage 测试隔离不变。
- 成功返回值来自实际写入 envelope，而非易失败的回读。
- persistence warning 在失败期间保留，在健康 hydration/migration 后终止。
