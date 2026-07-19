-- 数学练题种子（先跑通通路，再慢慢加真题）
-- 在 Supabase Dashboard → SQL Editor 整段执行
-- 知识点名必须与识点/辅学一致（如「抛物线」「导数应用」）

-- ---------- 抛物线 × 2 ----------
with q1 as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '抛物线焦点弦中点',
    '已知抛物线 C: y² = 2px (p>0)，F 为焦点。过 F 的弦 AB 的中点为 M(x0,y0)。求证：弦 AB 所在直线的斜率为 y0/(x0-p/2)（或按你选用的公开卷题干改写完整）。',
    '设直线为 y=k(x-p/2)，与抛物线联立，用韦达定理表示中点坐标。',
    '数学题库 · 抛物线 · 示例1',
    2,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '抛物线', 0 from q1;

with q2 as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '抛物线与直线相交求弦长',
    '抛物线 y²=4x，直线 y=x+m。当直线与抛物线交于 A、B 两点时，求 |AB| 的最小值及对应 m。',
    '联立得二次方程，用弦长公式 √(1+k²)|x1-x2|，再对参数求最值。',
    '数学题库 · 抛物线 · 示例2',
    2,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '抛物线', 1 from q2;

-- ---------- 导数应用 × 2 ----------
with q3 as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '导数求切线',
    '函数 f(x)=x³-3x+1，求曲线 y=f(x) 在点 (1,f(1)) 处的切线方程。',
    '先求 f''(x)，再代入切点斜率，用点斜式写方程。',
    '数学题库 · 导数应用 · 示例1',
    1,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '导数应用', 0 from q3;

with q4 as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '导数与极值',
    '已知函数 f(x)=ae^x + x² + x，若 f(x) 在 R 上单调递增，求实数 a 的取值范围。',
    '令 f''(x)≥0 恒成立，转化为 g(x)=ae^x+2x+1≥0，再分类讨论 a。',
    '数学题库 · 导数应用 · 示例2',
    3,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '导数应用', 1 from q4;

-- 自检：应能看到 4 道 published 数学题
-- select r.id, r.source_label, t.knowledge_point
-- from learning_resources r
-- join resource_knowledge_tags t on t.resource_id = r.id
-- where t.subject = '数学' and r.status = 'published';
