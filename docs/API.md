# dailywork HTTP API

本地开发默认由 `start-bg.sh` 启动 Web（**端口 3310**）与 **worker**（Telegram + 定时任务，无 HTTP 端口）。

- **Base URL（Web）**: `http://127.0.0.1:3310`
- **环境变量**: 见仓库根目录 `.env.example`；worker 需要 `TELEGRAM_BOT_TOKEN`、`TELEGRAM_ALLOWED_CHAT_ID`。

---

## 健康检查

### `GET /api/health`

用于 local-service `check` 与探活。

**响应** `200` JSON：

```json
{ "ok": true, "service": "dailywork", "role": "web" }
```

**示例**

```bash
curl -sf http://127.0.0.1:3310/api/health
```

---

## 任务（手动触发一次）

### `POST /api/tasks/:id/run`

对 `data/automation.db` 中已存在的任务执行 **单次** 运行：与 **cron 到时** 使用 **同一套** 配置（rednote 的 `triggerCommand`、shell 的 `command`），不修改 cron。与网页「Run Now」、Telegram `/run <id>` 等价。

**仅路径参数 `id`**，**无请求体**。

**路径参数**

| 参数 | 说明 |
|------|------|
| `id` | 任务主键（整数） |

**响应**

| 状态码 | 含义 |
|--------|------|
| `200` | `{ ok: true, taskId, mode: "once", note: "..." }` |
| `400` | `id` 非法 |
| `404` | 任务不存在 |
| `500` | 执行过程抛错 |

**说明**

- 长任务（rednote / shell）可能较久；路由已设置 `maxDuration = 3600`（秒）。
- 子进程环境会去掉 `HTTP_PROXY` / `HTTPS_PROXY` 等，避免本机 `localhost` 走系统代理。

**示例**

```bash
curl -sS -X POST "http://127.0.0.1:3310/api/tasks/1/run"
```

---

## 页面（非 REST API）

| 路径 | 说明 |
|------|------|
| `/` | 应用首页 |
| `/tasks` | 定时任务管理（增删、启用、Run Now） |

---

## 与 worker 的关系

| 能力 | 进程 |
|------|------|
| `GET /api/health`、`POST /api/tasks/...`、页面 | **Web**（`next dev`，端口 **3310**） |
| Cron 调度、Telegram Bot | **Worker**（`tsx src/automation/index.ts`） |

两者共享同一 `data/automation.db`；修改任务或 cron 后需 **重启 worker** 才能更新调度（Web 侧 API 触发不依赖 worker 是否运行）。
