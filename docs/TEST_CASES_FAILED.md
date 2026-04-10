# 未通过的测试用例（Playwright）

生成时间：2026-04-09T01:54:10.462Z

来源：根据 `npm run test:e2e` 的 JSON 报告汇总；用例 ID 见各条 `title` 前缀（与 `docs/TEST_CASES.md` 对应）。

| # | 状态 | 用例（Playwright title） | 错误摘要 |
|---|------|---------------------------|----------|
| 1 | failed | Web — layout & Todo UI › WEB-L-01: page title and meta description | Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:3000/<br>Call log:<br>[2m  - navigating to "http://127.0.0.1:3000/", waiting until "load"[22m<br> |

## 跳过的用例（不计入失败）

1. AUTO-E — worker env › AUTO-E-03: SIGINT/SIGTERM shutdown (needs running bot — manual)
2. TG-A — Telegram (not automated) › TG-A-01 — TG-A-08: require real Telegram bot + chat
3. SCH — scheduler.ts › SCH-04: overlap guard (timing-heavy — manual)
4. SCH — scheduler.ts › SCH-06: reload after DB change (design — manual)
5. Web — layout & Todo UI › WEB-L-02: body layout classes
6. Web — layout & Todo UI › TODO-R-01: empty list message
7. Web — layout & Todo UI › TODO-R-02: newest todo appears first (id desc)
8. Web — layout & Todo UI › TODO-R-03: response not long-lived cached as static
9. Web — layout & Todo UI › TODO-A-01: add todo 买牛奶
10. Web — layout & Todo UI › TODO-A-02: trim whitespace in title
11. Web — layout & Todo UI › TODO-A-03: whitespace-only does not add row
12. Web — layout & Todo UI › TODO-T-01 / TODO-T-02: toggle done and undo
13. Web — layout & Todo UI › TODO-T-03: invalid toggle id is ignored
14. Web — layout & Todo UI › TODO-T-04: toggle non-existent id does not crash
15. Web — layout & Todo UI › TODO-D-01: remove todo
16. Web — layout & Todo UI › TODO-D-02: invalid delete id ignored
