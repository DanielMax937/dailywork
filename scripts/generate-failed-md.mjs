#!/usr/bin/env node
/**
 * Reads Playwright JSON report and writes docs/TEST_CASES_FAILED.md
 * with only failed / timed-out tests (title should include case IDs like WEB-L-01).
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const jsonPath = path.join(root, "test-results", "playwright-results.json");
const outPath = path.join(root, "docs", "TEST_CASES_FAILED.md");

function walkSuites(suites, out, collectSkipped) {
  if (!suites) return;
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const r = t.results?.[0];
        const st = r?.status;
        const title = [suite.title, spec.title, t.title].filter(Boolean).join(" › ");
        if (st === "failed" || st === "timedOut" || st === "interrupted") {
          out.push({
            title,
            status: st,
            message:
              r?.error?.message ??
              r?.error?.stack ??
              String(r?.error ?? "unknown error"),
          });
        }
        if (collectSkipped && st === "skipped") {
          collectSkipped.push(title);
        }
      }
    }
    walkSuites(suite.suites ?? [], out, collectSkipped);
  }
}

function main() {
  if (!fs.existsSync(jsonPath)) {
    const body = `# TEST_CASES_FAILED

未找到 \`test-results/playwright-results.json\`。请先运行 \`npm run test:e2e\`。
`;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, body, "utf8");
    console.error("Missing JSON report:", jsonPath);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const failed = [];
  const skipped = [];
  walkSuites(data.suites ?? [], failed, skipped);

  const now = new Date().toISOString();
  let md = `# 未通过的测试用例（Playwright）

生成时间：${now}

来源：根据 \`npm run test:e2e\` 的 JSON 报告汇总；用例 ID 见各条 \`title\` 前缀（与 \`docs/TEST_CASES.md\` 对应）。

`;

  if (failed.length === 0) {
    md += `**本次运行无失败用例（全部通过或跳过）。**\n`;
  } else {
    md += `| # | 状态 | 用例（Playwright title） | 错误摘要 |\n`;
    md += `|---|------|---------------------------|----------|\n`;
    failed.forEach((f, i) => {
      const msg = f.message.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
      const title = f.title.replace(/\|/g, "\\|");
      md += `| ${i + 1} | ${f.status} | ${title} | ${msg} |\n`;
    });
  }

  if (skipped.length > 0) {
    md += `\n## 跳过的用例（不计入失败）\n\n`;
    skipped.forEach((s, i) => {
      md += `${i + 1}. ${s.replace(/\|/g, "\\|")}\n`;
    });
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md, "utf8");
  console.log("Wrote", outPath, failed.length ? `(${failed.length} failed)` : "(0 failed)");
}

main();
