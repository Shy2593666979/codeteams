# CodeTeams

> **Your agents. Your team. Your workflow.**  
> Local-first · ACP-native · Cross-platform Desktop Workbench

CodeTeams 是一个开源、本地优先的 AI Coding Agent 协作桌面工作台。它通过标准的 **Agent Client Protocol（ACP v1 / stdio）** 连接你本机已有的 Coding Agent，提供极简对话工作台、纯 Coding Agent 线性串行工作流画布、自动上下文交接（Context Handoff）、本地 SQLite 持久化与断点恢复能力。

---

## 核心特性

- **极简 Codex 风格主工作台**：打开即对话，无统计仪表盘或虚假 KPI；支持单 Agent 对话模式与多 Agent 工作流模式。
- **Coding Agent 专用全屏画布**：仅编排 Coding Agent 节点（无 Start/End、条件、脚本、变量或输入输出表单节点），支持拖拽排序、重复 Agent、撤销/重做、缩放与适应画布。
- **串行执行与自动上下文交接（Context Handoff）**：用户只需输入一次需求；每个节点正常结束并原子提交检查点与交接摘要后才调度下一位 Agent，自动传递原始目标、项目规则、记忆、真实代码改动与产物，不伪造测试结果。
- **本地持久化与断点恢复**：独立 Bun Core 单写入者管理 `bun:sqlite`（WAL + 外键 + `synchronous=FULL` + 迁移 + 在线 `VACUUM INTO` 备份）；异常中断重启后自动对账标记 `interrupted`，恢复时跳过已提交节点，支持原生 `session/load` 或透明上下文重建。
- **20 个内置 Coding Agent 预设 + 官方 Logo 资产**：随应用附带 20 个预设配置（已核验官方 ACP Registry v1 快照），全站统一 `AgentLogo` 组件渲染经净化的官方 SVG 资产，未实测项如实标注“待验证”。
- **安全与合规优先**：Electron 开启 `contextIsolation`、`sandbox`、关闭 `nodeIntegration`、实施 CSP 与受限类型化 IPC；文件回调拦截路径遍历与符号链接逃逸；默认权限按需审批；严格区分各 Agent 自动化授权策略（如 Antigravity 消费者 OAuth 后台编排限制）。

---

## 工程结构

```text
codeteams/
├── apps/
│   ├── desktop/              # Electron Main / Preload / React 19 + Vite + React Flow Renderer
│   └── core/                 # 独立 Bun App Server（JSON-RPC 2.0 over stdio）
├── packages/
│   ├── shared/               # 共享类型、Zod schemas、RPC 合同、20 个 Agent 预设
│   ├── acp/                  # ACP v1 stdio Client、路径守卫、进程管理与探测
│   ├── engine/               # 串行工作流调度器、Context Engine、权限代理、Git 工作区管理
│   └── storage/              # bun:sqlite + Drizzle ORM schema、事务迁移、在线备份
├── resources/
│   ├── agents/               # 官方 SVG Logo、manifest.json 与 ACP Registry 快照
│   └── templates/            # 默认工作流模板
├── scripts/                  # Core 单文件编译与官方资产同步脚本
├── tests/                    # Mock ACP Server、单元、集成与 Electron Playwright E2E
└── docs/                     # 产品技术规格与实施状态记录
```

---

## 开发与构建命令

前置依赖：**Bun >= 1.4**、**Node.js >= 22**、**Git**。

```bash
# 1. 安装依赖（Windows/国内网络如需加速 Electron 下载可设置 ELECTRON_MIRROR）
bun install

# 2. 启动桌面开发环境（Electron Forge + Vite + Bun Core）
bun run dev

# 3. 仅启动独立 Bun Core（JSON-RPC stdio）
bun run dev:core

# 4. 全仓库 TypeScript 严格类型检查
bun run typecheck

# 5. 运行单元测试与集成测试（基于真实 stdio Mock ACP Server 与 bun:sqlite）
bun test

# 6. 构建核心单文件二进制（bun build --compile）与桌面端产物
bun run build

# 7. 运行真实 Electron 端到端测试（启动 Electron + 编译版 codeteams-core）
bun run test:e2e

# 8. 打包当前平台桌面应用（输出到 apps/desktop/out/）
bun run package
```

---

## 接入与认证说明

1. 打开应用左侧 **Agents** 页面查看 20 个内置预设与本地检测状态。
2. 点击任意 Agent 可修改启动命令/参数、输入当前会话内存持有的 API Key（不明文写入 SQLite），并点击 **测试 ACP 连接** 执行真实 `initialize` 握手。
3. 也可点击 **添加自定义 ACP Agent** 注册任意本地 ACP v1 stdio 服务。
4. **合规提示**：ACP 仅是传输协议。对于受厂商服务条款限制的账户类型（例如 Antigravity 消费者 OAuth 账户不得用于无人值守后台工作流编排），CodeTeams 默认在自动工作流中阻止并提示，仅建议用于人工直接交互或已授权的自动化凭据。

---

## 兼容矩阵与已知限制

详见 [docs/implementation-status.md](docs/implementation-status.md) 中记录的真实测试版本、20 个预设状态矩阵、官方 Logo 资产清单与当前平台限制：

- 已在 **Windows 11 x64** 上完成完整构建、打包、单元/集成/Electron E2E 与真实 `agy acp` 握手验证；macOS（arm64/x64）与 Linux x64 尚未实机打包验证。
- 17/20 个 Agent 已从官方 ACP Registry 同步并净化官方 SVG Logo；`deepseek-harness`、`trae-cli`、`iflow-cli` 尚未收录于当前 ACP Registry 快照，暂使用中性占位图标并列入待补充清单。
- 当前默认提供浅色极简主题与简体中文/英文双语界面；工作区隔离默认使用用户选定的本地目录互斥锁，可选 Git Worktree / 暗色主题 / 签名公证将在后续版本补齐。

---

## License

MIT
