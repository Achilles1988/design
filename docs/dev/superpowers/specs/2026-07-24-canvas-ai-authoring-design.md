## Canvas AI 创作设计

- 日期：2026-07-24
- 状态：设计对话已批准，待书面规格复核
- 实施范围：`apps/design`
- 运行范围：本地 `npm run dev`

## 背景

Design App 已有 Shell 级 AI 聊天抽屉、页面级会话、流式模型调用和
`design-fs` 本地文件 API。资产页面已经使用聊天工具改变页面筛选，但具体 Canvas
页面尚未注册 AI 能力，聊天也不能生成或更新 Canvas 源码。

现有 `/wn-design-prd` 是面向 IDE/Codex 的完整 Canvas 编排流程，包含需求包、审批、
工作树、实现和设计审查。它不是网页运行时可直接调用的函数。本设计复用其核心约束，
包括 Style 强制、Layout 优先、需求守恒和结果验证，但不在网页内启动该 Skill 或
Codex 子进程。

同时，当前新建 Canvas 会生成带标题的占位页面。新流程要求 Canvas 初始视觉为空，
用户再通过当前 Canvas 的聊天抽屉完成 UI 创作。

## 已确认决策

| 主题 | 决策 |
|---|---|
| 执行架构 | 新增本地 Vite 服务端 Canvas Assistant 模块，不新增独立常驻服务 |
| 运行环境 | 首版仅支持 `npm run dev` |
| AI 配置 | 继续使用现有浏览器设置；每次请求临时发送给同源本地服务，不在服务端持久化 |
| 操作范围 | 只创建或更新当前路由对应的 Canvas |
| 应用方式 | 先展示提案，用户点击确认后才写入 |
| Style | 当前 App 配置的 Style 是强制契约 |
| Layout | 优先选择合适的已安装 Layout |
| 资源 Layout | 显示推荐卡片；确认安装后加入 `app.json.layouts`，再用于生成 |
| AI 临时布局 | 只存在于当前 Canvas，不创建资产，不修改 `app.json.layouts` |
| 失败处理 | 最多两轮自动修复；仍失败则完整恢复写入前状态 |
| 用户组件 | 位于当前 App 的 `components/`，与 Shell 组件严格分离 |
| 组件复用 | 优先复用现有用户共享组件；可新建共享组件，但不修改现有共享组件 |
| 其他 Canvas | 不读取其实现、不修改、不跨 Canvas import，也不提示用户提取 |
| 图片输入 | 支持多张剪贴板图片和多个 URL 截图 |
| 图片持久化 | 使用 IndexedDB，按 Canvas 页面会话隔离 |
| URL 截图 | 使用 Playwright Chromium 的隔离无登录上下文 |
| 本地文件 | 首版不支持 `file:`、文件选择器、拖拽文件或本地 HTML 上传 |
| Shell 语言 | 所有内置 UI、状态、错误和无障碍文案使用英文 |
| 生成内容语言 | 服从用户诉求 |

## 目标

- 在具体 Canvas 页面复用现有右侧 AI 聊天抽屉。
- 让用户通过自然语言和多个视觉参考创建或更新当前 Canvas UI。
- 服务端固定 Style、Layout、文件权限和确认规则，用户消息不能覆盖这些约束。
- 在写入前展示结构化提案，保护 IDE 中的并行修改。
- 优先复用当前 App 的用户共享组件，并为后续组件目录保留稳定资产边界。
- 写入后自动验证和修复，最终失败时恢复全部文件。
- 新建 Canvas 初始视觉为空，但仍可打开聊天开始创作。

## 非目标

- 独立部署或生产环境后端。
- 直接运行 `/wn-design-prd`、Codex CLI、Shell 命令或任意代理进程。
- 创建、删除或修改当前 Canvas 之外的 Canvas。
- 从其他 Canvas 中提取组件或读取其实现。
- 修改或删除现有用户共享组件。
- 展示、预览或管理所有用户组件；该能力留给二期。
- 创建可复用的 AI Layout 资产。
- 实现数据库、鉴权、业务 API 或其他非 UI 功能。
- 安装 Canvas 代码依赖。
- 支持默认浏览器登录态、`file:`、文件上传或本地 HTML 页面。
- 未经用户确认直接写入源码。

## 方案选择

采用“现有聊天 UI + 本地服务端创作工作流”。

浏览器继续负责对话、附件、提案卡片和用户确认。新的 Vite middleware
负责读取可信磁盘状态、组装固定 Prompt、调用模型、暂存候选变更、应用、验证、
自动修复和回滚。

未选择的方案：

- 浏览器模型直接调用 `design-fs` 写入工具：改动较小，但固定规则、源码权限、
  自动修复和回滚会分散到前端，服务端无法独立保证安全边界。
- 网页启动 `/wn-design-prd` 或 Codex 子进程：能够复用 IDE 工作流，但其审批、
  工作树和审查生命周期与页面内即时聊天不匹配，状态和失败恢复成本过高。

## 资产与文件边界

### Shell 与用户资产

Shell 自有组件继续位于 `apps/design/framework/src/`。用户 App 资产位于
`design.project.json` 的 `contentRoot` 下：

```text
<designRoot>/<contentRoot>/<appId>/
├── components/
├── canvases/
├── app.json
└── canvases.json
```

Canvas Assistant 不得把用户组件写入 Shell，不得复制或依赖 Shell 私有 UI 组件。
二期组件目录只扫描当前 App 的 `components/`。

### 当前 Canvas 可写范围

一次提案可以：

- 修改 `canvases.json` 为当前 Canvas 指定的 TSX 文件；
- 修改该 TSX 通过相对路径直接导入、且与其位于同一 Canvas 目录的现有 CSS；
- 在当前 App 的 `components/` 中新建共享组件及其同目录 CSS；
- 从当前 App 的 `components/` 读取和引用现有共享组件。

一次提案不可以：

- 修改或删除现有共享组件；
- 修改其他 Canvas、共享全局 CSS、Shell 文件、配置文件或依赖；
- 新建 Canvas 辅助组件、Canvas CSS 或图片资源；
- 通过路径跳转访问允许目录之外的文件。

当前 Canvas 没有现有 CSS 时，页面专属样式必须留在 TSX 内。新建共享组件可以携带
自身 CSS，因为二者均属于本次新建的用户组件资产。

### 组件复用优先级

模型在实现 UI 前读取当前 App 的共享组件目录：

1. 已有组件的行为和 API 适合时，必须优先 import 和组合；
2. 现有共享组件在本工作流中是只读依赖；
3. 没有合适组件时，仅当新 UI 通用、props API 稳定且不包含页面专属文案或业务数据，
   才新建共享组件；
4. 页面专属组合与内容保留在当前 Canvas；
5. 不读取其他 Canvas 寻找代码，也不向用户展示组件提取或治理提示。

## 整体架构

### Canvas 聊天接入层

`CanvasPreview` 从路由取得唯一 `appId + canvasId`，注册 Canvas 创作能力和固定的服务端
运行模式。聊天能力位于 Shell，不写进用户 Canvas，因此返回 `null` 的空 Canvas 仍可使用。

聊天会话继续按 Canvas pathname 隔离。导航到其他 Canvas 时，旧生成、旧提案和旧工具调用
立即失去当前页面所有权。

### Canvas Assistant 服务端模块

新增与 `design-fs` 并列的 Vite middleware 模块，负责：

- 校验 App、Canvas、Layout 和所有路径；
- 从磁盘读取 `app.json`、`canvases.json`、当前 Canvas、允许的 CSS 和用户共享组件；
- 解析 `design.project.json` 并读取 Style、已安装 Layout 和 Layout 资源索引；
- 组装不可由用户覆盖的固定 Prompt；
- 使用请求中临时提供的 AI 配置调用模型；
- 流式返回聊天文本、Layout 推荐或 Canvas 提案；
- 在进程内存中暂存提案；
- 确认后执行写入、验证、修复和回滚。

浏览器提交的 App 配置、Canvas 路径、源码和共享组件列表均不可信，服务端必须自行解析。

### 本地 API

新增两个核心协议：

- `POST /__design_ai/canvas/chat`
  - 接收 `appId`、`canvasId`、聊天消息、附件引用和临时 AI 配置；
  - 重新读取可信上下文；
  - 流式返回普通消息、Layout 推荐工具调用或 Canvas 提案。
- `POST /__design_ai/canvas/proposals/:proposalId/apply`
  - 只接受当前进程创建、尚未使用、尚未过期且文件基线未变化的提案；
  - 执行多文件写入、验证、自动修复和回滚。

资源 Layout 安装继续使用现有 `design-fs` 资产安装 API。该 API 已负责验证资源目录，
并在确认后将 Layout ID 添加到当前 App 的 `app.json.layouts`。

新增和变更的公共协议必须同步记录到 `docs/dev/api/`。图片附件与页面状态协议的变化
同步更新 `docs/dev/api/assistant-ui-chat.md`。

## 固定 Prompt

服务端使用“固定规则 + 动态上下文”。以下规则不能被用户消息覆盖：

```md
You are the UI authoring assistant for the current Canvas. Create or update
previewable UI according to the user's request.

## Scope

- Operate only on the server-selected current Canvas.
- Creating UI means turning the current blank or placeholder Canvas into a
  complete page.
- Updating UI must start from the current source and preserve structures,
  content, and interactions the user did not ask to change.
- Never create, delete, inspect, import from, or modify another Canvas.
- Separate non-UI requirements and do not implement them.

## Style

- The current App Style is a mandatory design contract.
- Follow its colors, typography, spacing, components, motion, and anti-patterns.
- The user's request determines product intent; Style determines visual language.
- Never invent or ignore Style rules.

## Layout

1. Evaluate installed Layouts first and select one only when it genuinely fits.
2. If none fits, search the Layout library.
   - Present an install recommendation before using an uninstalled Layout.
   - Never claim an uninstalled Layout is installed.
   - Use it only after confirmed installation adds it to app.json.layouts.
3. If no library Layout fits, or the recommendation is rejected, create an
   AI temporary layout for this Canvas.
   - Do not create a Layout asset.
   - Do not modify app.json.layouts.
   - Continue to follow the mandatory Style.

Never force an unsuitable Layout.

## Component reuse

- Inspect the current App's user shared components before implementing UI.
- Reuse an existing shared component whenever its behavior and API fit.
- Existing shared components are read-only in this workflow.
- Never import implementation from another Canvas.
- Create a shared component only when it is general-purpose, has a stable props
  API, and contains no page-specific copy or business data.
- Keep page-specific composition inside the current Canvas.
- Do not interrupt the user with component extraction or governance advice.

## Code

- Match the current Canvas framework, language, and project conventions.
- Do not add dependencies.
- Produce a complete, compilable proposal for every changed or new file.
- Include responsive, accessible, loading, empty, and interaction states when
  they are relevant to the requested UI.
- Fake data must be obvious and stable and must not impersonate real data.
- Never write files directly. Produce a structured proposal.

## Proposal

Explain the interpreted request, UI changes, Style, Layout decision, reused
components, new shared components, preserved content, validation checks, and
complete candidate files. Files may be applied only after a valid confirmation
bound to this proposal.
```

每轮动态注入：

- 当前 App、Canvas 标识和最新允许文件；
- 当前文件集合哈希；
- Style ID 和完整规范；
- 已安装 Layout ID 和规范；
- 可查询的 Layout 资源索引；
- 当前 App 共享组件的路径、接口与相关源码；
- 用户文字、多张视觉参考及来源；
- 当前聊天历史；
- 最近一次精简验证错误和自动修复次数。

Layout 资源库的全部规范不一次性注入。先根据索引筛选少量候选，再读取候选规范。

## Layout 决策与确认

### 已安装 Layout

已有 Layout 适合时，模型直接选择并在 Canvas 提案中说明理由，不额外中断用户。

### 资源库 Layout

没有合适的已安装 Layout，但资源库存在合适项时，聊天先渲染英文推荐卡片：

- Layout 名称、简介、适用理由和预览入口；
- `Not installed` 状态；
- `Install and use` 与拒绝操作。

确认后调用现有安装 API。成功时 Layout ID 必须出现在 `app.json.layouts`，服务端重新读取
规范后继续生成 Canvas 提案。失败时不改变 Canvas，不声称安装成功，也不自动假装使用它。

### AI 临时布局

资源库无合适项或用户拒绝推荐时，模型可以为当前 Canvas 临时编排布局。提案明确显示
`AI temporary layout`。该选择不创建 Layout 资产，也不修改 `app.json.layouts`。

## 创作提案与确认

### 提案卡片

模型准备修改 UI 时返回结构化提案。内置英文卡片显示：

- `Create UI` 或 `Update UI`；
- 本次变更摘要；
- 当前 Style；
- Layout 决策和理由；
- `Reused components`；
- `New shared components`；
- `Canvas-only implementation`；
- 保留的现有内容；
- 预计验证项目；
- 可折叠的候选源码；
- `Apply changes` 和取消操作。

提案等待确认期间不修改磁盘和预览。普通聊天文字不能替代提案卡片中的确认操作。

### 提案生命周期

提案只暂存在 Vite 进程内存中，并绑定：

- `appId + canvasId`；
- 当前 Canvas 与允许修改 CSS 的内容哈希；
- 读取的现有共享组件只读依赖哈希；
- 本次新建共享文件的目标路径及“不存在”基线；
- 创建时间、过期时间和单次应用状态。

Vite 重启、页面所有权变化、提案过期、重复应用、任一基线文件变化或新建目标路径被占用，
都会使提案失效。前端不能在 apply 请求中提交任意候选源码。

提案从服务端创建起保留 30 分钟。创建同一 Canvas 的新提案时，客户端立即废弃旧提案；
服务端仍以有效期、基线和单次应用状态做最终校验。

## 写入、验证与恢复

用户确认后按以下顺序处理：

1. 重新解析当前 App、Canvas 和允许路径；
2. 重新读取所有读写基线并比对提案哈希；
3. 保存全部待修改文件的写入前内容；
4. 以安全的临时文件和替换方式应用候选文件；
5. 使用 Vite/TypeScript 转换能力验证当前 Canvas 及其导入；
6. 失败时将精简诊断、原始需求、设计契约和当前候选交给模型修复；
7. 最多执行两轮自动修复，每轮重新验证；
8. 最终失败或发生异常时恢复所有原文件，并删除本次新建的共享文件；
9. 只有验证成功才标记提案已应用，并通知当前 Canvas 预览重新加载。

执行期间提案按钮禁用，不能重复提交。状态卡片依次使用英文显示版本检查、写入、验证、
自动修复、成功刷新或失败回滚。

`New chat` 只清空当前 Canvas 的聊天与附件，不回滚已经成功应用的源码。

## 新建 Canvas 空白模板

`design-fs` 新建 Canvas 时不再输出标题。它写入最小、可编译且视觉为空的组件：

```tsx
export default function CanvasName() {
  return null
}
```

组件名仍按现有 Canvas 命名规则生成。空白 Canvas 的聊天入口由 Shell 提供，不依赖组件内容。

## 多模态输入

### Composer

现有聊天 Composer 增加图片引用区：

- 支持从剪贴板一次或多次粘贴 PNG、JPEG 和 WebP；
- 一条消息可以同时包含文字、多个 URL 和多张截图；
- 图片显示缩略图、来源、尺寸和移除操作；
- 所有内置标签、状态、错误和无障碍文案使用英文。

一期限制：

- 最多 8 张视觉引用；
- 其中最多 4 个 URL；
- 单张原始图片不超过 10 MB；
- 单条消息视觉数据总量不超过 30 MB。

超限时保留 Composer 文字和已接受附件，显示英文错误，不静默丢弃。

### URL 截图

Composer 识别消息中的 `http/https` URL，并在发送模型请求前交给本地服务端截图：

- 使用新增的 `playwright` 开发依赖及其 Chromium；
- 允许公开、localhost 和局域网 URL；
- 使用隔离、无登录状态的浏览器上下文；
- 禁止 `file:` 及其他协议；
- 使用 `1440 × 1000` 固定桌面视口，只截取当前视口；
- `DOMContentLoaded` 导航等待上限为 15 秒，单个 URL 总处理时间上限为 20 秒；
- 最多跟随 5 次跳转，每次跳转后的协议仍必须是 `http` 或 `https`；
- 禁止下载、新窗口和弹窗；
- 截图返回浏览器后进入与粘贴图片相同的附件流程；
- 服务端不持久化截图或浏览历史。

发送前显示截图缩略图。截图失败时暂停本次生成，并提示用户粘贴截图或移除失败引用。
截图结果不理想时，用户可以移除自动截图并粘贴自己的截图，再综合发送全部文字和图片。
需要登录的页面通常只能得到登录页，界面提示用户从已登录浏览器手动截图。

一期不复用默认浏览器登录态，不支持 `file:`、文件选择器、拖拽文件、本地图片文件或本地
HTML 上传。后续版本可增加用户明确选择的图片和 HTML 文件，但不能开放任意本地路径。

### 图片持久化

图片 Blob 存入浏览器 IndexedDB，不写入 `localStorage` 或用户 App 资产目录。每条记录包含：

- 附件 ID；
- 当前 Canvas 页面键；
- Blob、MIME、尺寸；
- `clipboard` 或 `url-capture` 来源；
- URL 来源时的原始 URL。

页面状态中的消息只保存附件 ID。恢复会话时从 IndexedDB 加载缩略图和模型输入。
`New chat` 删除当前 Canvas 会话关联的附件；删除消息后清理不再被任何消息引用的图片。
其他 Canvas 的附件不受影响。

现有纯文字会话必须继续恢复。存储不可用或容量不足时，当前内存会话继续工作并显示英文
持久化 warning，但不能声称图片已持久化。

### 模型视觉能力

服务端将用户文字、URL 来源说明、URL 截图、手动截图和设计上下文转换为模型的多模态消息。
如果当前配置模型拒绝视觉输入：

- 不假装读取图片；
- 不生成或应用 Canvas 提案；
- 返回英文错误，要求切换支持图片的模型或移除图片；
- 保留 Composer 和已持久化附件。

## 页面切换与并发

- 页面改变时取消旧聊天请求和 URL 截图请求；
- 页面 generation/owner 使旧工具和迟到结果失效；
- 面板只在当前 Canvas 上下文和设计契约成功加载后可用；
- pending hydration 时不暴露旧页面消息、附件或提案；
- 外部 IDE 修改任一读写或只读依赖文件后，旧提案不能应用；
- 同一提案只允许成功应用一次；
- Layout 安装完成后必须重新读取 App 配置，不能沿用安装前上下文。

## 安全与隐私

- Canvas Assistant API 仅接受同源本地请求；
- 聊天请求最多携带最近 40 条稳定消息；除图片 Blob 外的序列化请求体上限为 512 KB；
- 附件数量和体积使用多模态输入章节定义的限制；
- AI 配置和 API Key 只用于当前请求，不写磁盘、不缓存、不记录日志；
- 日志不包含完整 Prompt、Canvas 源码、图片内容或密钥；
- 所有 App、Canvas、Layout、组件和 CSS 路径均通过服务端白名单解析；
- 模型无权执行 Shell 命令或访问允许资产范围之外的文件；
- URL 截图只接受用户消息中明确提交的 `http/https` 地址；
- Playwright 使用隔离上下文，不读取默认浏览器 Profile、Cookie 或登录数据；
- 浏览器取消请求时同步中止模型生成和未完成截图。

## 错误处理

- Style 缺失或规范不可读：Canvas Assistant 不可用，显示英文配置错误。
- 当前 Canvas 或登记文件不存在：不生成提案，显示英文磁盘状态错误。
- 已安装 Layout 规范损坏：忽略该 Layout 作为候选并说明配置问题，不伪造规范。
- Layout 安装失败：不改变 Canvas，不继续使用该 Layout。
- URL 截图失败：暂停生成，保留其他输入，要求粘贴截图或移除引用。
- 模型不支持视觉输入：保留输入，要求更换模型或移除图片。
- 提案过期、重复或基线冲突：不写文件，要求重新生成。
- 自动修复仍未通过：恢复所有原文件并删除本次新建文件。
- IndexedDB 不可用或容量不足：保留当前内存附件并提示无法持久化。
- 页面切换或取消：中止工作并以页面 owner 拒绝迟到副作用。

## 测试策略

### Prompt 与上下文

- 固定规则不能被用户消息覆盖；
- 正确加载当前 Style、已安装 Layout 和资源索引；
- 只加载当前 Canvas、允许 CSS 和当前 App 用户组件；
- 不读取其他 Canvas 或 Shell 私有组件；
- 组件复用优先级和新建共享组件判断进入提案；
- 多模态消息保留文字、图片顺序和来源。

### 文件权限与提案

- 允许当前 Canvas、同目录已导入 CSS 和新建用户组件；
- 拒绝其他 Canvas、现有共享组件修改、全局 CSS、Shell 文件和路径逃逸；
- 提案过期、重复提交、跨 Canvas、基线变化和新建路径冲突均被拒绝；
- apply 请求不能替换服务端暂存的候选源码。

### Layout

- 合适的已安装 Layout 直接进入提案；
- 未安装 Layout 先展示推荐卡片；
- 确认安装后正确更新 `app.json.layouts` 并重新加载规范；
- 安装失败不继续生成；
- AI 临时布局不修改 `app.json.layouts`。

### 写入与恢复

- 单文件和多文件提案写入成功；
- 新建共享组件与 Canvas 变更一起验证；
- 第一轮或第二轮自动修复成功；
- 最终失败恢复全部修改文件并删除全部本次新建文件；
- IDE 并行修改导致安全冲突；
- 成功后当前 Canvas 预览重新加载。

### 聊天与图片

- 单张和多张剪贴板图片；
- 多个 URL 与手动截图混合；
- 附件数量、单张大小和总量限制；
- URL 截图成功、超时、重定向失败、登录页和用户取消；
- 禁止 `file:` 和非 HTTP 协议；
- 视觉模型成功与不支持视觉输入；
- IndexedDB 保存、恢复、容量失败、消息删除清理和 `New chat` 清理；
- 不同 Canvas 的聊天和附件不串联。

### 空白 Canvas 与 UI

- 新建 Canvas 返回最小 `null` 组件且不显示标题；
- 空 Canvas 仍能打开聊天；
- 提案和 Layout 卡片的确认、取消、禁用和键盘操作；
- 所有新增 Shell 文案、状态、错误与无障碍标签均为英文；
- 生成到 Canvas 的内容语言服从用户诉求。

### 验证

- 运行相关单元、组件和集成测试；
- 运行完整 `npm run test`；
- 运行 `npm run build`；
- 在桌面和窄屏下进行浏览器冒烟测试；
- 验证 URL 截图、多图 Composer、提案确认、自动修复、回滚和预览刷新；
- 检查新增及变更的 `docs/dev/api/` 文档与实现一致。

## 验收标准

- 新建 Canvas 视觉为空，不再自动显示标题，同时聊天入口可用。
- Canvas Assistant 仅在当前源码、Style 和 Layout 上下文成功加载后启用。
- 用户文字、多张剪贴板图片和多个 URL 截图可以共同参与一次生成。
- URL 截图失败或不理想时，用户可补充手动截图后综合生成。
- 已安装 Layout 合适时优先使用；未安装 Layout 必须确认安装后加入
  `app.json.layouts`；AI 临时布局不改变配置。
- AI 优先复用当前 App 的用户共享组件，必要时可新建共享组件，但不修改现有共享组件。
- 用户组件始终位于 App 资产目录，不写入 Shell。
- 提案明确列出变更文件、摘要、Style、Layout、复用组件和新建组件。
- 未点击 `Apply changes` 时，磁盘和预览保持不变。
- 外部文件变化使旧提案安全失效，不覆盖 IDE 修改。
- 合法提案应用后自动验证并刷新当前预览。
- 验证失败时最多自动修复两轮；最终失败完整恢复。
- 切换 Canvas 后，旧请求、提案和工具调用不能修改新页面。
- 图片随当前 Canvas 会话从 IndexedDB 恢复，`New chat` 只清理当前 Canvas 的聊天和图片。
- 内置 UI 和错误使用英文；用户生成的 Canvas 内容语言由用户需求决定。
- 自动化测试和构建通过，API 文档与实现一致。
