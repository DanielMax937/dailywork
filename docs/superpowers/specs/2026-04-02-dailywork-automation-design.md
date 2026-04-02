# dailywork：本机自动化调度 + Telegram Bot — 设计说明

**状态：草案（待你确认后可进入实现）**  
**日期：2026-04-02**

## 1. 背景与目标

用户每日有多类任务（如发小红书、期货复盘等），已有独立脚本，需要：

- **按 cron 定时触发**（标准五段表达式，时区与本机系统一致）
- **根据进程退出码**（0=成功，非 0=失败）将结果通知到 **Telegram 私聊**
- **Telegram Bot 支持命令**：列出所有定时任务、**按 ID 手动触发一次**

与现有 **Next.js + SQLite Todo** 同仓库，但 **数据与进程分离**：Todo 仍用 `data/sqlite.db`；自动化用 **`data/automation.db`**。

## 2. 方案对比（2～3 种）

### 方案 A（推荐）：独立 Node Worker 进程

- **做法**：单独入口（如 `npm run worker`），常驻进程内同时跑 **cron 调度器 + Telegram Bot（长轮询）**；用 `child_process` 执行配置的 shell 命令；结果写入 `automation.db` 并推 Telegram。
- **优点**：与 Next 生命周期解耦；本机常驻稳定；易调试（单独终端看日志）；**符合你选的「两个终端分别启动」**。
- **缺点**：需自己处理进程信号（优雅退出）、单点（一个 worker 进程）。

### 方案 B：Next.js 内嵌 + `instrumentation` / 自定义 server

- **做法**：在 Next 启动时拉起调度（仅 `next start` 时可靠，`next dev` 热重载会反复初始化）。
- **优点**：单命令启动。
- **缺点**：与 **A（两终端）** 冲突；开发模式不稳定；**不推荐**。

### 方案 C：系统级 cron（launchd）+ 仅 Telegram 的极简脚本

- **做法**：每条任务用 `launchd`/crontab 调脚本，脚本结束再调 Telegram API。
- **优点**：不依赖 Node 常驻。
- **缺点**：**无法**在一个 Bot 里统一「列出任务、手动执行」；配置分散；**不满足** 本需求。

**推荐：方案 A**。

## 3. 推荐架构

### 3.1 进程与仓库

| 组件 | 说明 |
|------|------|
| **Next** | 现有 Todo 页面；**第一版可不改动**或仅加文档链接。 |
| **Worker** | `npm run worker`：调度 + Telegram；**与 Next 分开启动**。 |

### 3.2 数据（`data/automation.db`）

- **tasks**：`id`, `name`, `cron_expr`（五段）, `command`（完整 shell 字符串）, `enabled`（布尔）, `created_at`, …（可选：`timeout_sec` 后续再加）
- **run_logs**：`id`, `task_id`, `started_at`, `finished_at`, `exit_code`, `stdout`（截断存）, `stderr`（截断存）, `trigger`（`scheduled` \| `manual`）

使用 **Drizzle** 与现有技术栈一致；**单独** `src/automation/db/` 与 Drizzle config（或 `drizzle.automation.config.ts`）避免与 Todo 的 `schema` 混在一个文件里难以维护。

### 3.3 调度

- 使用支持 **标准五段 cron** 的库（如 `cron`），**timezone 使用系统默认**（不在第一版强制 `TZ` 环境变量，除非你以后改需求）。
- 启动时从 DB 读 `enabled=true` 的任务，注册 CronJob；**任务变更**第一版可要求 **重启 worker** 生效（简单可靠）；后续可加「热重载」或 Web 管理。

### 3.4 执行器

- 使用 `child_process.spawn` 或 `execa`：`shell: true` 或 `/bin/sh -c` 执行 `command`。
- **成功判定**：仅 **exit code === 0**。
- **超时**：默认全局超时（如 30～60 分钟可配置），**超时**记为失败并 kill 子进程（具体秒数实现时可定，写入 env）。
- **输出**：stdout/stderr 捕获并 **截断**（例如各 8KB）再写入 DB 与 Telegram，避免撑爆。

### 3.5 Telegram（私聊）

- **环境变量**：`TELEGRAM_BOT_TOKEN`（必填）、`TELEGRAM_ALLOWED_CHAT_ID`（必填，仅处理该 chat 的消息，防误用）。
- **通知**：每次任务结束向该 chat 发一条消息（成功/失败 + 简短摘要 + 可选 exit code）。
- **命令（示例）**：
  - `/help`：说明用法
  - `/list`：列出任务（id、名称、cron、是否启用）
  - `/run <id>`：手动执行一次（异步，完成后发通知，与定时触发一致）
- 库：**Telegraf**（或等价），长轮询即可。

### 3.6 安全与运维

- `.env` / `.env.local` **gitignore**；文档说明如何从 [@BotFather](https://t.me/BotFather) 取 token、`chat_id` 获取方式（如 @userinfobot）。
- Worker 日志：stdout 或 `data/logs/worker.log`（可选，实现时定）。

## 4. 错误处理

| 场景 | 行为 |
|------|------|
| 命令不存在 / spawn 失败 | 记失败，`exit_code` 可用特殊值或 `-1`，Telegram 说明原因 |
| 超时 | kill 子进程，记失败，通知 |
| Telegram 发送失败 | 打日志；可重试（可选） |
| DB 不可用 | Worker 启动失败并退出（fail-fast） |

## 5. 测试与验收

- **单元级**：cron 解析、命令解析（可选）
- **手工验收**：
  - 插入一条测试任务（短间隔或 `run` 手动）
  - 成功/失败脚本各跑一次，确认 Telegram 与 `run_logs`
  - `/list`、`/run` 在私聊可用

## 6. 非目标（第一版不做）

- 多用户、群组、多 chat
- Web 上配置任务（可后续迭代）
- 与 Todo 数据联动
- 分布式/多机执行

## 7. 开放问题（实现前可定默认值）

- 全局超时默认秒数、stdout/stderr 截断长度
- 任务初始数据：SQL seed 脚本 vs 小工具 `npm run automation:seed`

---

**若你认可本设计，下一步：按 `writing-plans` 产出分步实现清单（仍不改代码直至你确认）。**
