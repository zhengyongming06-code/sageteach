-- 立刻修复：给前端读题权限（在 SQL Editor 执行本文件）
-- 若种子已灌过，执行完后刷新 sageteach.top 辅学/复盘即可看到真题

grant select on public.learning_resources to anon, authenticated;
grant select on public.resource_knowledge_tags to anon, authenticated;

-- 自检：用登录用户的 anon key 也能看到（Dashboard 里这条应返回 ≥1）
select count(*) as published_math_questions
from public.learning_resources r
join public.resource_knowledge_tags t on t.resource_id = r.id
where t.subject = '数学'
  and t.knowledge_point = '抛物线'
  and r.status = 'published'
  and r.resource_type = 'question';
