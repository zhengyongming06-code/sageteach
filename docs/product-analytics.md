# 产品分析系统

## 指标说明

| 指标 | 数据来源 |
|------|----------|
| DAU | 当日 `analytics_user_daily` + `coach_messages` 去重用户 |
| WAU | 近 7 日活跃去重用户 |
| 连续使用天数 | 当前 streak（最后一天 ≥ 昨天）均值 / 最大值 |
| Review 完成率 | 有 `review_summaries` 的 session / 有用户消息的 review session |
| 拍题次数 | `learning_evidence(photo)` + 拍照 markdown 消息 |
| 训练完成率 | `daily_training_items` done / total |
| 次日 / 7 日留存 | cohort 平均留存 |

## 部署

1. Supabase SQL Editor 执行：
   - `supabase/migrations/20260604120000_product_analytics.sql`
   - `supabase/migrations/20260604130000_fix_product_analytics_dashboard.sql`（修复留存 SQL）
2. 添加管理员：

```sql
insert into admin_users (user_id)
select id from auth.users where email = '你的邮箱@example.com';
```

3. 打开 App → 侧栏 **分析** → `/app/admin/analytics`

## 排查

| 现象 | 处理 |
|------|------|
| 侧栏无「分析」 | 执行 admin_users 插入 SQL |
| 页面报 `forbidden` | 同上 |
| 页面报 RPC / SQL 错误 | 执行 fix migration；刷新后看具体错误文案 |
| Console `record_activity` 警告 | 可忽略（登录瞬间 session 未就绪时会失败一次） |

## 埋点

`AppShell` 登录后自动调用 `record_analytics_activity()`，写入 `analytics_user_daily`。
