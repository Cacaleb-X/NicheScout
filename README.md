# NicheScout

NicheScout 是一个 Store First 的本地商家线索发现 CLI。Phase 1 使用 Mock/Manual Adapter 跑通“输入 → 查询扩展 → 商家发现 → 去重 → 社交内容归因 → 评分 → SQLite → XLSX”完整流程，不依赖 LLM API Key，也不会尝试绕过登录、验证码或平台限制。

## 环境

- Node.js 24+
- Codex Desktop 工作区提供的 `@oai/artifact-tool`（用于生成真正的 XLSX）

本仓库在当前 Codex 工作区已配置好运行时依赖。若移动到其他环境，请为 `@oai/artifact-tool` 配置可用的包来源或替换 `src/exporters/xlsx.ts` 的实现。

## 立即运行 Demo

```bash
npm run demo
```

输出：`outputs/demo_changsha_harry_potter_bars.xlsx`

Demo 会返回 50 家按 Priority Score 排序的商家，并保存公开联系方式来源、匹配证据和人工跟进字段。

## 自定义搜索

```bash
npm run scout -- \
  --city "长沙" \
  --district "五一广场" \
  --category "酒吧" \
  --niche "哈利波特主题,魔法主题,沉浸式" \
  --limit 50 \
  --exclude "连锁,低价" \
  --output "outputs/my_leads.xlsx"
```

`category` 和 `niche` 都是自由输入。`district`、`exclude` 和 `output` 可省略。运行 `npm run scout -- --help` 查看参数。

## 导入人工商家 JSON

```bash
npm run scout -- \
  --city "长沙" \
  --category "酒吧" \
  --niche "魔法主题" \
  --manual examples/manual-stores.json
```

人工数据会和 Mock Adapter 结果合并、匹配并去重。缺失字段允许为空；原始数据会保存在 SQLite 中。

## 数据与评分

- SQLite 默认路径：`data/nichescout.sqlite`，可通过 `NICHESCOUT_DB_PATH` 修改。
- 每次运行创建新的任务记录，不删除或重建旧数据。
- Match Score 只衡量细分条件匹配度。
- Contact Score 只衡量公开商家联系方式的可用性。
- Priority Score = Match Score × 0.6 + Contact Score × 0.4。
- 所有评分权重集中在 `src/config/scoring.ts`。
- 普通消费者、KOL/KOC 和本地媒体账号不会被当成商家官方账号。

## 测试

```bash
npm test
```

测试覆盖查询扩展、商家去重、实体匹配、细分评分、联系评分、优先级、官方账号判断、来源追踪、缺失数据和 XLSX 导出。

## Phase 1 边界

当前 `MockBusinessAdapter`、`MockSocialAdapter` 和 `ManualImportAdapter` 已实现统一 Adapter 接口。真实大众点评和小红书采集尚未实现；Phase 2 应优先接入一个合规、稳定的公开本地商家数据源，并在 Adapter 内处理 `MANUAL_LOGIN_REQUIRED`、验证码停止与限流状态，核心工作流无需改写。
