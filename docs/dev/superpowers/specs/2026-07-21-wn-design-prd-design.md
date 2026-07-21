# `/wn-design-prd` — PRD-to-Canvas Design Skill

Date: 2026-07-21
Status: Approved for implementation planning

## Goal

新增项目级 skill `wn-design-prd`：把一份 PRD / 设计需求，落成某个设计工程 App 内**真正的 Canvas 设计稿**（改代码 → 预览 → design review → 收尾），严格遵循该 App 已安装的 style/layout 契约；收尾后**可选**输出一段极简"交接 prompt"，供用户复制到真实产品仓去跑自己的开发工作流。

**定位**：本 skill 相当于"**产品 + 设计先过一轮，交出设计原型稿**"。用户提交的 PRD 常把 UI 与**非 UI 需求**（后端逻辑、数据规则、业务约束、权限、集成等）混在一起——本 skill 只消化其中的 UI 部分并落成 Canvas 原型稿，**但非 UI 需求不能被吞掉**：即使本 skill 后续步骤没用到它们，也必须**原样回吐给用户**（需求守恒），供后续真正开发承接。

## Context

- 该 skill 随安装脚本装到目标仓，**不绑定本仓**；所有路径口径以设计应用为准：
  - style 规则：`docs/design/<app>/rules/design.md`
  - layout 契约：`docs/design/<app>/layouts/<id>/LAYOUT.md`
  - （与仓库 `CODEBUDDY.md` 的权威口径一致）
- Canvas 概念见 `docs/dev/conventions/glossary.md`（"空白设计画布"，非浏览器/路由的 page）。
- design review agent 由 `temp/agents/ui-visual-validator.md` 改造而来，注入 style/layout 契约感知与 Playwright 截 Canvas 预览的能力。
- **不再引用/依赖 `wn-brainstorm`（将废弃）**：需求收集由本 skill 第 2 步的"拷问"自行完成。
- **本 skill 不打包 Superpowers（或任何外部开发工作流）的步骤**：只探测用户是否已安装，并在存在时调用之；skill 自身仅自带一个 `design-review` agent。
- **需求守恒**：PRD 中的非 UI 需求本 skill 不实现，但会被识别、分离并**无条件回吐**（见"非 UI 需求回执"），不因"用不到"而丢弃。

## Decisions

| Topic | Decision |
|-------|----------|
| 产物定位 | 真做 Canvas 设计稿 + **无条件**非 UI 需求回执 + **可选**交接 prompt（非"只产 prompt"） |
| 非 UI 需求处理 | 第 2 步拷问时**识别并分离** PRD 中的非 UI 需求；本 skill 不实现，但在收尾时**始终输出**一份"非 UI 需求回执"给用户（两条 runner 都输出）；若另出交接 prompt，则一并带上 |
| 是否打包外部工作流 | 否。只**探测 + 调用**用户已装的开发工作流；本 skill 只自带 `design-review` agent |
| runner 命名 | 两条：**detected**（探测到已装开发工作流）/ **plan**（没装 → 用 IDE 自带 plan 模式：先出计划 → 用户批准 → 再实现） |
| 控制模型 | **编排者模型**：`wn-design-prd` 全程当 driver，按步**调用**已装 skill 作为子技能，**不让渡主控、不依赖回调** |
| 实现能力归属 | 本 skill **自带实现能力**（由它驱动 AI 直接落 Canvas 稿）；外部实现类子技能（`executing-plans`/`subagent-driven-development`）为**可选增强**——装了就委托并叮嘱"不要自动收尾"，没装也能自兜底跑通 |
| 框架无关铁律 | 实现时**技术栈自适应**：以目标 App 的 `style/layout` 契约 + **既有 Canvas 代码的写法/技术栈**为唯一依据；skill 正文**严禁硬编码任何框架特定写法**（React/Vue 皆然），换框架时 skill 不改一字 |
| 第 1 步作用 | 探测用户已装了哪些开发工作流 skill；没装 → 走 plan 模式；装了 → 后续各步骤按映射**调用其对应子技能** |
| 路由 | 自动探测 + 不确定时问用户 + 用户可手动覆盖 |
| 需求收集 | 由第 2 步拷问自行完成，不外挂 brainstorming；detected 时**只调用实现/CR/收尾类子技能，绕过其自带的头脑风暴/需求收集入口**，避免二次澄清 |
| 缺 style/layout | 停下来，让用户先跑 `wn-design-spec`（不自造） |
| 无合适 layout | 让用户"新增 layout" 或选 "AI 自由发挥" |
| design review（#7） | 内置 `design-review` agent，**两条 runner 都跑**（skill 自身质量兜底） |
| detected 分支保序 | `wn-design-prd` 调用实现子技能时**明确指示"不要自动收尾"**；CR（#6）后**先跑 #7 design review + 修**，最后（#8）才调用对方 finish。全程主控在本 skill，无"交还控制权"回调 |
| plan 变体的 CR 与收尾 | **完全跳过**（无分支、无 code review、无 finish branch），仅保留 design review |
| 交接 prompt | **可选** + **极简**：仅需求摘要 + 关键注意事项 + 设计稿参考三块，不列已知 bug |

## Architecture

### 控制模型（编排者）

`wn-design-prd` **全程是唯一 driver**。detected 时它不把整个任务"交出去"，而是**按步把已装 skill 当子技能来调用**（类似 Superpowers 内部 `REQUIRED SUB-SKILL: use X` 的组合方式），主控权始终不离开本 skill，因此不存在"回调断裂"。这是本设计相对早期"整包 handoff + 交还控制权"方案的关键修正——后者依赖外部自终结流程主动回调，不可靠。

**关键保序约束**：调用实现类子技能（如 `executing-plans` / `subagent-driven-development`）时，必须**显式指示其"只实现、不要自动收尾/合并"**；收尾（finish）由 `wn-design-prd` 在 #6 design review 通过之后才调用，从而保证 `实现 → CR → design review + 修 → finish` 的顺序不被打乱、design review 永远落在合并之前。

### 实现能力与框架无关（铁律）

**实现能力自带**：写 Canvas 稿这步由本 skill 自己驱动 AI 完成；外部实现类子技能是**可选增强**，装了就委托（并叮嘱不要自动收尾），一个都没装（仅装了 worktree 等）时 detected 仍能靠本 skill 自兜底跑通。

**框架无关**：skill 是给 AI 的**指令文档**，真正写代码的是通用 AI，故实现必须**技术栈自适应**——

- 唯一依据是目标 App 的 `style/layout` 契约 + **该 App 既有 Canvas 代码的写法与技术栈**；实现前先读若干既有 Canvas 作为范例来源。
- skill 正文**严禁**出现任何框架特定的代码片段或写法（不假设 React、不假设 Vue）。
- design 工程今天是 React（`.tsx`）就写 React；将来换 Vue（`.vue`）就写 Vue——**skill 文本无需改动**。

> 对内（design 原型工程）**落真实原型**（框架自适应），是为了让 #7 design review 有可截图校验的对象；对外（真实产品仓）**给交接 prompt**（那边技术栈本 skill 不掌控）。二者是本 skill 的一体两面。

### 探测锚点与步骤映射

第 1 步探测 `.wn-ai/skills/` 下是否装有开发工作流类 skill。**识别锚点**：探测一组已知子技能是否存在，并按步骤做映射：

| 本 skill 步骤 | 期望的已装子技能（锚点） | 缺失时的降级 |
|---|---|---|
| #4 分支 | `using-git-worktrees` | 跳过分支，直接在当前工作树做（记一条提示） |
| #5 code review | `requesting-code-review` | 跳过 CR（design review 仍照跑） |
| #7 收尾 | `finishing-a-development-branch` | 跳过收尾，仅提示用户手动收尾 |

- **判定"装了开发工作流"**：上述任一锚点存在即视为 detected；全都不存在 → plan。
- **部分安装**：detected 下按上表逐步降级，有哪个用哪个，缺的按降级列处理，不因缺一步而整体失败。
- **不硬编码执行细节**：只认锚点 skill 名并调用其入口，不复制/包装其内部步骤。

### 路由

**自动探测优先；探测结果不确定时询问用户；用户可随时手动覆盖**（"我要走 detected/plan"）。

### 流水线

| 步骤 | detected（已装开发工作流） | plan（未装） |
|---|---|---|
| 1 探测 & 路由 | 按锚点探测已装子技能；不确定就问；可手动覆盖 | 探测到无任何锚点 → 走 plan 模式 |
| 2 拷问设计细节 & 分离需求 | 定清：改哪个 App、增/改/删哪些 Canvas、每个 Canvas 用哪个 layout、要填的假数据；**并把 PRD 中的非 UI 需求识别、分离、记下**（本 skill 不实现，仅登记以便回吐）；缺 style/layout → 停，让用户先跑 `wn-design-spec`；无合适 layout → 用户新增或选"AI 自由发挥" | 同左 |
| 3 汇总需求包 | 本 skill 自己打包为内部上下文（**不外发、不触发对方的头脑风暴入口**），含 UI 需求与已分离的非 UI 需求 | 本 skill 打包为计划输入 |
| 4 分支 | **调用** `using-git-worktrees`（缺则降级） | 不建分支 |
| 5 实现 | 在分支内实现 Canvas 稿（**本 skill 自带实现能力，按目标 App 契约+既有 Canvas 自适应技术栈**）；若装了 `executing-plans`/`subagent-driven-development` 则委托并**指示其不要自动收尾** | 用 IDE 自带 **plan 模式**：先产出实现计划 → 用户批准 → 退出 plan 模式后实现（同样自适应技术栈） |
| 6 code review + 修 | **调用** `requesting-code-review`（缺则跳过） | 跳过 |
| 7 design review + 修 | 内置 `design-review` agent（两条都跑） | 内置 `design-review` agent |
| 8 收尾 | **调用** `finishing-a-development-branch`（缺则提示手动） | 跳过 |
| 9 非 UI 需求回执 | **无条件输出**：把第 2 步分离出的非 UI 需求原样回吐给用户（未实现，供后续开发承接） | 同左 |
| 10 可选交接 prompt | 问是否输出极简开发 prompt；要则输出（含非 UI 需求） | 同左 |

> 顺序要点：design review（#7）在 code review（#6）之后、收尾（#8）之前，由本 skill 强制保序。非 UI 需求回执（#9）**两条 runner 都无条件执行**，不受"是否输出交接 prompt"影响。

### 拷问阶段（第 2 步）必须定清的字段

- 目标 App（`docs/design/<app>/` 存在，且有 `rules/design.md`）。
- 本次要**增 / 改 / 删**哪些 Canvas（逐个列出）。
- 每个 Canvas 采用哪个 layout（引用 `docs/design/<app>/layouts/<id>/LAYOUT.md`）。
- 每个 Canvas 需要的假数据（占位内容规则）。
- **非 UI 需求分离**：从 PRD 中挑出与 UI/Canvas 无关的需求（后端逻辑、数据/存储规则、业务约束、权限、第三方集成等），逐条登记。本 skill 不实现它们，仅保留原文以便第 9 步回吐；不确定某条是否属 UI 时向用户确认归类。
- 阻断条件：
  - App 缺 `rules/design.md` 或所需 layout 契约不存在 → **停**，提示先跑 `wn-design-spec`。
  - 需要的 layout 不存在也无合适可选 → 让用户"新增 layout"或明确选择"AI 自由发挥"。

### 非 UI 需求回执（第 9 步，无条件）

收尾后**始终**向用户输出一份回执，内容为第 2 步分离出的非 UI 需求原文（逐条列出），并注明"以上为本次设计原型未覆盖的非 UI 需求，供后续开发承接"。若 PRD 没有非 UI 需求，则明确说明"本次无未覆盖的非 UI 需求"，做到需求守恒可核对。此回执独立于可选交接 prompt，两条 runner 都执行。

### 交接 prompt 模板（极简）

```
实现需求：<一句话需求摘要>
关键注意事项：<拷问阶段定下的要点，如目标 App、所选 layout、关键交互/数据规则>
页面设计稿参考：<Canvas 源码文件路径，如 apps/design/apps/<app>/canvases/<id>.tsx；及 docs/design/<app>/rules|layouts 契约路径>
非 UI 需求（待实现）：<第 2 步分离出的非 UI 需求逐条；无则写"无">
```

设计稿部分只给需求/注意事项/参考三块，不列已知问题 / bug 清单，细节留给后续开发工作流去磨；末尾附上非 UI 需求，确保后续开发拿到完整上下文。使用场景：用户设计完直接**复制这段**去跑自己的开发流，无需重敲需求与注意事项。
**设计稿参考给稳定的文件路径，不给 `localhost` 预览 URL**——因为该 prompt 会被复制到另一个真实产品仓使用，临时 dev URL 换仓即失效。

### 内置 `design-review` agent

由 `temp/agents/ui-visual-validator.md` 改造为 `design-review`：

- 对照目标 App 的 `docs/design/<app>/rules/design.md`（style 契约）与所用 `layouts/<id>/LAYOUT.md`（layout 契约）。
- 用 Playwright 截 Canvas 预览，做视觉合规校验（是否遵循 style / layout、间距/层级/配色等）。
- 输出 PASS / 需修复项；两条 runner 都调用它。
- 不绑定任何外部工作流的目录结构。

**预览前置（必须先满足，否则 review 步骤会截不到图）**：调用 `design-review` 前，`wn-design-prd` 需确保：
- 目标设计工程的 dev server 正在运行（`npm run dev`）；detected 走 worktree 时须在**该 worktree 内**起服务，plan 走当前工作树。
- 解析出被 review 的每个 Canvas 的**预览 URL**（依当前路由约定，如 `/apps/<app>/canvases/<id>`），交给 agent 截图。
- 服务不可达或 URL 无法解析时，review 步骤应报错并提示如何启动预览，而非静默跳过。

### 文件结构

```
.wn-ai/skills/wn-design-prd/
├── SKILL.md              # 编排步骤（Agent 执行依据）：编排者模型 + 两条 runner 流水线
├── README.md             # 人读向说明 + 优化后的流水线表格
└── agents/
    └── design-review.md  # 由 ui-visual-validator 改造：style/layout 契约感知 + Playwright 截图
```

## Testing（按 writing-skills 的 TDD）

writing-skills 铁律：**先有失败基线场景再写 skill**。落地时用子代理跑以下压力场景，验证 Agent 是否遵循编排：

1. **路由-未装**：环境无任何锚点 skill → Agent 应走 plan（先出计划→批准→实现），跳过分支/CR/收尾，仍跑 design review + 询问交接 prompt。
2. **路由-全装**：三个锚点都在 → Agent 应走 detected，**按步调用**各子技能，自己保留主控，不把整包任务交出去。
3. **保序 & 不自动收尾**：detected 下 Agent 调用实现子技能时应**指示其不要自动收尾**，并保证顺序为 实现 → CR → **design review + 修** → finish（design review 落在合并之前）。
4. **部分安装降级**：只装了 `using-git-worktrees`、没装 `finishing-a-development-branch` → Agent 应用 worktree、跳过收尾并提示手动，不整体失败。
5. **路由-不确定**：探测结果模糊 → Agent 应**询问用户**而非擅自选择。
6. **手动覆盖**：用户明说"走 plan" → Agent 尊重覆盖。
7. **缺 style/layout 阻断**：目标 App 无 `rules/design.md` → Agent 应**停下**并提示先跑 `wn-design-spec`，不继续落地。
8. **无合适 layout**：所需 layout 不存在 → Agent 应让用户"新增"或选"AI 自由发挥"，不擅自编造。
9. **预览前置**：dev server 未启动 → design review 步骤应报错并提示启动预览，而非静默跳过或截空图。
10. **交接 prompt 极简 + 稳定引用**：用户选择输出 prompt → 含需求/注意事项/设计稿参考三块（设计稿参考为**文件路径**而非 localhost URL，不含 bug 清单）+ 末尾非 UI 需求块。
11. **design review 兜底**：两条 runner 都必须调用 `design-review`。
12. **不重复需求收集**：detected 下调用外部子技能时不触发其自带头脑风暴/需求澄清入口，不让用户二次澄清已锁定的需求。
13. **非 UI 需求守恒**：PRD 含非 UI 需求时 → Agent 第 2 步应分离登记，第 9 步**无条件回吐**给用户（两条 runner 都做，且不依赖是否输出交接 prompt）；PRD 无非 UI 需求时应明确声明"无未覆盖需求"。
14. **实现能力自兜底**：仅装了 `using-git-worktrees`、没有任何实现类子技能 → detected 下 Agent 应**自己实现** Canvas 稿并跑通全流程，不因缺实现类 skill 而卡住。
15. **框架自适应**：把范例 Canvas 换成非 React 写法（如 `.vue`）→ Agent 应**参照既有 Canvas 的技术栈实现**，不擅自套用 React；验证 skill 正文无框架特定硬编码。

## Success criteria

1. `/wn-design-prd` 在 IDE 内可调用，按两条 runner 正确路由（含"不确定就问 + 可覆盖"）。
2. skill **不打包**任何外部开发工作流步骤，只按锚点探测/调用；自带的唯一 agent 是 `design-review`。
3. detected 分支采用**编排者模型**：本 skill 全程主控，按步调用子技能，指示实现子技能不自动收尾，强制 `实现→CR→design review→finish` 保序，无回调断裂；部分安装时按映射表逐步降级。
4. plan 分支用 IDE 自带 plan 模式（先出计划→批准→实现），跳过分支/CR/收尾，仅保留 design review + 可选 prompt。
5. 缺 style/layout 时阻断并引导 `wn-design-spec`；无合适 layout 时给"新增 / 自由发挥"两条出路。
6. 交接 prompt 极简（三块 + 非 UI 需求块）、可选触发、设计稿参考用稳定文件路径，适配"复制即走"的场景。
7. `design-review` agent 在预览可达的前提下对照 style/layout 契约 + Playwright 截图做视觉校验，两条 runner 都调用。
8. **非 UI 需求守恒**：非 UI 需求被分离并在第 9 步无条件回吐，两条 runner 都执行，实现"产品+设计过一轮、需求不丢"的定位。
9. **实现能力自带 + 框架无关**：本 skill 能自兜底实现 Canvas 稿（外部实现类子技能仅为可选增强）；实现以目标 App 契约 + 既有 Canvas 技术栈为准，skill 正文无任何框架特定硬编码，换框架不改 skill。
10. 上述 15 个基线场景在实现完成后由子代理验证通过。

## Out of scope

- **API 调用入口**（被另一 skill 程序化驱动）：本期只做 IDE 内 `/wn-design-prd` 调用，SKILL 里预留"后续可被程序化驱动"的语义即可，不实现具体 API。
- `wn-design-spec` 本身的实现（本 skill 只在缺契约时引导用户去跑它）。
- 具体外部开发工作流（Superpowers 等）步骤的重实现/包装。
- 交接 prompt 里的详细 bug/约束清单（刻意从简）。

## Spec self-review notes

- 覆盖了用户澄清的全部修正：产物=A（真做+可选 prompt）、prompt=可选+极简+稳定文件路径、plain→plan 更名（用 IDE 自带 plan 模式）、本 skill 不打包外部工作流、第 1 步=按锚点探测已装工作流。
- **修正了早期方案的根本断点**：detected 由"整包 handoff + 交还控制权"改为**编排者模型**（本 skill 全程主控、按步调用子技能、指示实现子技能不自动收尾、强制 design review 落在 finish 之前），消除回调断裂与"review 落在合并之后无处可修"的问题。
- 补齐探测锚点与步骤映射表 + 部分安装降级规则，解决"什么算装了工作流 / 缺半套怎么办"。
- 补齐 design review 的**预览前置**（dev server + Canvas URL），避免截不到图的静默失败。
- 路由采用"自动探测 + 询问 + 可覆盖"，避免纯自动的失控与每次都问的啰嗦。
- **需求守恒**：明确本 skill 定位为"产品+设计先过一轮"，PRD 中的非 UI 需求被识别/分离，并在第 9 步**无条件回吐**给用户，不因本 skill 用不到而丢失。
- **实现能力自带 + 框架无关**：实现由本 skill 驱动 AI 完成、外部实现类子技能仅为可选增强；实现以目标 App 契约 + 既有 Canvas 技术栈为唯一依据，skill 正文禁止硬编码框架写法，换框架（React→Vue）时 skill 不改一字。
- 测试段落对齐 writing-skills 的 TDD 铁律，列出可由子代理执行的 15 个基线场景。
