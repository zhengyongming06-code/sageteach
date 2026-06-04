# 产品分析系统

后台定位：**产品验证**（行为漏斗 + AI 质量 + 用户反馈），而非增长指标。

## 指标说明

| 模块 | 指标 | 数据来源 |
|------|------|----------|
| 活跃 | DAU / WAU | `analytics_user_daily` + `coach_messages` |
| 行为漏斗 | 拍题 → Review → 完成 Review → 生成训练 → 完成训练 | 同周期内拍题用户的逐步转化（用户数） |
| AI 质量 | 分析成功率 | 用户拍题消息 vs 成功返回的 photo markdown |
| AI 质量 | 输出异常率 | 成功解析中过短/缺结构/失败提示等启发式 |
| AI 质量 | 知识点抽取成功率 | `learning_evidence` 含有效 knowledge_points |
| 用户反馈 | 最常见卡点 | `review_summaries.weak_point` 聚合 |
| 用户反馈 | 错误模式 | `student_mistake_patterns` |
| 用户反馈 | 训练任务点击 | `analytics_product_events.training_go_click`（无点击时用完成训练备选） |

## 部署

1. Supabase SQL Editor 依次执行：
   - `supabase/migrations/20260604120000_product_analytics.sql`
   - `supabase/migrations/20260604130000_fix_product_analytics_dashboard.sql`
   - `supabase/migrations/20260604150000_product_analytics_validation.sql`
2. 添加管理员：

```sql
insert into admin_users (user_id)
select id from auth.users where email = '你的邮箱@example.com';
```

3. 侧栏 **分析** → `/app/admin/analytics`

## 埋点

| 事件 | 触发 |
|------|------|
| `record_analytics_activity()` | App 登录后心跳 |
| `training_go_click` | Today 训练卡片「去练」 |
| `photo_analysis_failed` | Review 拍题识别失败 |

## 排查

| 现象 | 处理 |
|------|------|
| 侧栏无「分析」 | 执行 admin_users 插入 SQL |
| 页面报 `forbidden` | 同上 |
| 页面报 RPC 错误 | 执行 validation migration |
| 训练点击始终为空 | 用户点击「去练」后刷新；或查看完成训练备选统计 |
