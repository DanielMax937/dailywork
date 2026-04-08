# dailywork — 功能与测试用例

本文档基于当前源码梳理 **产品功能**，并给出可执行的 **测试用例**（手工 / E2E / 单测设计均可对照）。项目包含两条独立能力：

1. **Web 应用**：SQLite 持久化的 Todo 列表（`data/sqlite.db`）。
2. **Automation Worker**：独立进程，SQLite 任务与运行日志（`data/automation.db`）+ Telegram 私聊控制 + `cron` 定时执行 shell 命令。

---

## 前置条件

| 场景 | 条件 |
|------|------|
| Web Todo | `npm run db:push` 已执行，`data/` 可写；`npm run dev` 后访问根路径 |
| Worker | `.env` 含 `TELEGRAM_BOT_TOKEN`、`TELEGRAM_ALLOWED_CHAT_ID`；`npm run automation:db:push`；`npm run worker` |

---

## 一、Web — 布局与元数据

| ID | 功能 | 步骤 | 预期 |
|----|------|------|------|
| WEB-L-01 | 页面标题与描述 | 打开任意页面，查看 `<title>` 与 meta | `title` 为「Dailywork — Todo」；description 含 SQLite todo 说明（见 `layout.tsx`） |
| WEB-L-02 | 根字体与布局 | 打开首页 | 使用 Geist / Geist Mono；`body` 为 `min-h-full flex flex-col`；内容区有合理边距与最大宽度 |

---

## 二、Web — Todo 列表展示

| ID | 功能 | 步骤 | 预期 |
|----|------|------|------|
| TODO-R-01 | 空列表文案 | 数据库无 `todos` 行时打开 `/` | 显示「No tasks yet. Add one above.」 |
| TODO-R-02 | 排序 | 插入多条 todo 后刷新 | 列表按 `id` **降序**（最新 id 在上） |
| TODO-R-03 | 动态渲染 | 任意时刻访问 `/` | `export const dynamic = "force-dynamic"`，服务端读库，非静态缓存页 |

---

## 三、Web — 新增 Todo（Server Action `addTodo`）

| ID | 功能 | 步骤 | 预期 |
|----|------|------|------|
| TODO-A-01 | 正常新增 | 在输入框填写「买牛奶」，点 Add | 列表出现「买牛奶」，`done` 为未完成样式 |
| TODO-A-02 | 首尾空白 | 输入「  任务  」提交 | 存库为 `任务`（`trim()`） |
| TODO-A-03 | 空标题拒绝 | 仅空格或空（若可提交） | 不插入新行（`addTodo` 对空 `trim` 直接 return） |
| TODO-A-04 | 类型安全 | `title` 非 string | 不插入（`typeof title !== "string"`） |

---

## 四、Web — 切换完成状态（`toggleTodo`）

| ID | 功能 | 步骤 | 预期 |
|----|------|------|------|
| TODO-T-01 | 标记完成 | 点击某条 Done | 文案删除线、变淡；按钮变为 Undo |
| TODO-T-02 | 撤销完成 | 点击 Undo | 恢复普通样式与 Done 按钮 |
| TODO-T-03 | 非法 id | 篡改隐藏字段 `id` 为非数字 | 无更新或无副作用（`NaN` 时 return） |
| TODO-T-04 | 不存在 id | `id` 指向不存在的行 | 查询无行时 `return`，不抛错 |

---

## 五、Web — 删除（`deleteTodo`）

| ID | 功能 | 步骤 | 预期 |
|----|------|------|------|
| TODO-D-01 | 删除 | 点击 Remove | 该条从列表消失 |
| TODO-D-02 | 非法 id | `id` 非合法整数 | 不执行删除（early return） |

---

## 六、数据库 — Todo（`src/db`）

| ID | 功能 | 步骤 | 预期 |
|----|------|------|------|
| DB-T-01 | 路径与创建 | 首次连接 | `data/sqlite.db`；`data` 目录不存在时自动创建 |
| DB-T-02 | 外键 | 连接参数 | `PRAGMA foreign_keys = ON` |
| DB-T-03 | 表结构 | 迁移/inspect | `todos`：`id` 自增、`title` 非空、`done` 默认 false、`created_at` 毫秒时间戳 |

---

## 七、Cron 表达式工具（`cron-expr.ts`）

| ID | 功能 | 输入 | 预期 |
|----|------|------|------|
| CRON-01 | 5 段转 6 段 | `*/5 * * * *` | `toCronTime` 得到 `0 */5 * * * *`（前补秒字段 `0`） |
| CRON-02 | 已是 6 段 | `0 */5 * * * *` | 原样返回（trim 后按空格分段为 6） |
| CRON-03 | 段数错误 | `* * * *` 或 7 段 | 抛出「need 5 or 6 fields」 |
| CRON-04 | 校验失败 | 非法表达式 | `assertValidCron` 抛出含 `validateCronExpression` 错误信息 |

---

## 八、Automation — 环境与进程

| ID | 功能 | 步骤 | 预期 |
|----|------|------|------|
| AUTO-E-01 | 缺 Token | 未设置 `TELEGRAM_BOT_TOKEN` 启动 worker | 进程退出，报错 `Missing required env: TELEGRAM_BOT_TOKEN` |
| AUTO-E-02 | 缺 Chat ID | 未设置 `TELEGRAM_ALLOWED_CHAT_ID` | 报错 `Missing required env: TELEGRAM_ALLOWED_CHAT_ID` |
| AUTO-E-03 | 优雅退出 | 运行中发 `SIGINT` / `SIGTERM` | 日志打印 stopping；`stopScheduler()`；`bot.stop`；`process.exit(0)` |

---

## 九、Telegram — 访问控制与命令

| ID | 功能 | 步骤 | 预期 |
|----|------|------|------|
| TG-A-01 | 非白名单静默 | 用非 `TELEGRAM_ALLOWED_CHAT_ID` 的账号发消息 | 中间件不 `next()`，无回复 |
| TG-A-02 | `/help` | 白名单发 `/help` | 回复含 `/list`、`/run <id>`、`/help` 说明 |
| TG-A-03 | `/list` 无任务 | `tasks` 表为空 | 提示插入 `automation.db` 并重启 worker |
| TG-A-04 | `/list` 有任务 | 至少一行 task | 每行含 `id`、name、`[on|off]`、`cron`、`cmd`；多任务空行分隔 |
| TG-A-05 | `/list` 异常 | 模拟 `listTasksText` 抛错 | 回复 `Error: <message>` |
| TG-A-06 | `/run` 无参数 | `/run` 或 `/run ` | `Usage: /run <id> (use /list for ids)` |
| TG-A-07 | `/run` 非数字 | `/run abc` | 同上 Usage |
| TG-A-08 | `/run` 合法 id | `/run 1` | 先回复 `Running task 1…`，随后收到 runner 结果消息（见下节） |

---

## 十、Runner — 命令执行与通知（`runner.ts`）

| ID | 功能 | 步骤 | 预期 |
|----|------|------|------|
| RUN-01 | 任务不存在 | `runTask` 对不存在 id | Telegram：`Task id N not found.` |
| RUN-02 | 任务禁用 | `enabled = false` | Telegram：`Task "…" (id=N) is disabled.`（手动触发亦同） |
| RUN-03 | 命令成功 | `command` 为 `exit 0` 类 | 消息含 `OK:`、`exit=0`、`stdout`/`stderr` 有则附带 |
| RUN-04 | 命令失败 | 非零退出码 | 消息含 `FAIL:`、实际 `exit` 码 |
| RUN-05 | 超时 | `AUTOMATION_DEFAULT_TIMEOUT_SEC` 设小；命令 `sleep 999` | 受 `execa` 超时处理；`stderr` 可能含 execa 错误信息 |
| RUN-06 | 日志截断 | 输出超长 | stdout/stderr 经 `truncate`，尾部含 `… [truncated … chars]`；`AUTOMATION_LOG_MAX_CHARS` 小于 256 时回退 8192 |
| RUN-07 | 超时秒无效 | `AUTOMATION_DEFAULT_TIMEOUT_SEC` 非正或非有限数 | 使用 3600s |
| RUN-08 | Telegram 长消息 | 拼接后总长超过 4000 | 截断至约 3990 字符并加 `…` |
| RUN-09 | 运行记录入库 | 任意一次成功执行 | `run_logs` 新增行：`task_id`、`started_at`、`finished_at`、`exit_code`、`stdout`、`stderr`、`trigger` 为 `manual` 或 `scheduled` |

---

## 十一、Scheduler — 定时任务（`scheduler.ts`）

| ID | 功能 | 步骤 | 预期 |
|----|------|------|------|
| SCH-01 | 仅启用任务 | `enabled = false` 的行 | 不注册 CronJob |
| SCH-02 | 无效 cron | 某行 `cron_expr` 非法 | 控制台 `[cron] skip task …`，该条不注册 |
| SCH-03 | 有效 cron | 合法 5 或 6 字段 | 控制台 `[cron] registered task …` |
| SCH-04 | 重叠执行 | 同一 task 上次 onTick 未完成 | `running` Set 跳过本次 tick（不并发同 id） |
| SCH-05 | 停止 | `stopScheduler()` | 所有 job `stop`，数组清空 |
| SCH-06 | 重启加载 | 修改 DB 任务后 | 需 **重启 worker** 才重新 `startScheduler`（设计：启动时读库） |

---

## 十二、Automation 数据库（`src/automation/db`）

| ID | 功能 | 步骤 | 预期 |
|----|------|------|------|
| ADB-01 | 路径 | — | `data/automation.db` |
| ADB-02 | `tasks` | — | `name`、`cron_expr`、`command`、`enabled`、`created_at` |
| ADB-03 | `run_logs` 外键 | 删除 task | `onDelete: cascade` 清理对应日志 |

---

## 十三、与源码的对应关系（便于维护）

| 模块 | 路径 |
|------|------|
| 首页与 Todo UI | `src/app/page.tsx` |
| Server Actions | `src/actions/todo.ts` |
| Todo DB | `src/db/schema.ts`、`src/db/index.ts` |
| Worker 入口 | `src/automation/index.ts` |
| Telegram | `src/automation/telegram.ts` |
| 调度 | `src/automation/scheduler.ts` |
| 执行与日志 | `src/automation/runner.ts` |
| Cron 辅助 | `src/automation/cron-expr.ts` |
| Automation 表 | `src/automation/db/schema.ts` |

---

## 十四、建议的自动化方向（非必须）

- **Todo**：Playwright / Cypress 覆盖 WEB、TODO-* 用例；对 `addTodo`/`toggleTodo`/`deleteTodo` 可做集成测试（内存 SQLite 或临时文件）。
- **Worker**：Mock Telegraf `sendMessage`，对 `runner.runTask`、`cron-expr`、`startScheduler` 写单元测试；E2E 需真实 Bot 与测试 chat。

---

*文档生成依据：仓库内 `src/` 与 `README.md` 描述的行为。*
