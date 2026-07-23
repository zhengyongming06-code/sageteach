-- 数学练题全覆盖（B：高一～高三均匀，每考点 2 道）
-- 在 Supabase Dashboard → SQL Editor 整段执行
-- 知识点名必须与识点/辅学一致（见 SUBJECT_KNOWLEDGE_BY_GRADE）
--
-- 若已跑过 math_practice_questions.sql：本文件仍可整段执行；
-- 「抛物线」「导数应用」会再各增 2 道不同题（该考点共 4 道），属正常。
--
-- 自检覆盖率：
-- select t.knowledge_point, count(*) as n
-- from resource_knowledge_tags t
-- join learning_resources r on r.id = t.resource_id
-- where t.subject = '数学' and r.status = 'published' and r.resource_type = 'question'
-- group by t.knowledge_point
-- order by t.knowledge_point;

-- ========== 高一 ==========

-- ---------- 函数与导数基础 × 2 ----------
with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '二次函数最值',
    '函数 f(x)=x²-4x+3 在区间 [0,3] 上的最大值与最小值分别是多少？',
    '配方或求导找极值点；注意端点与对称轴 x=2 是否在区间内。',
    '数学题库 · 函数与导数基础 · 1',
    1,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '函数与导数基础', 0 from q;

with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '导数定义与切线斜率',
    '已知 f(x)=x²+1，用导数定义求 f''(1)，并写出曲线在 x=1 处的切线方程。',
    'f''(a)=lim(h→0)[f(a+h)-f(a)]/h；切线用点斜式。',
    '数学题库 · 函数与导数基础 · 2',
    1,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '函数与导数基础', 1 from q;

-- ---------- 三角函数 × 2 ----------
with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '三角恒等变换求值',
    '已知 sinα=3/5，α∈(π/2,π)，求 cosα、tanα 以及 sin2α 的值。',
    '先由同角关系求 cosα（注意象限符号），再用二倍角公式。',
    '数学题库 · 三角函数 · 1',
    1,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '三角函数', 0 from q;

with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '正弦定理求边',
    '在 △ABC 中，A=45°，B=60°，c=√2，求边 a。',
    '先求 C=75°，再用正弦定理 a/sinA = c/sinC。',
    '数学题库 · 三角函数 · 2',
    2,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '三角函数', 1 from q;

-- ---------- 向量 × 2 ----------
with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '平面向量数量积',
    '已知 |a|=2，|b|=3，a·b=3，求 |a+b| 与 |a-b|。',
    '用 |u|²=u·u 展开；|a±b|²=|a|²+|b|²±2a·b。',
    '数学题库 · 向量 · 1',
    1,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '向量', 0 from q;

with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '向量垂直与共线',
    '设 a=(1,2)，b=(m,1)。若 a⊥b，求 m；若 a∥b，求 m。',
    '垂直：a·b=0；共线：存在 λ 使 b=λa（或坐标成比例）。',
    '数学题库 · 向量 · 2',
    1,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '向量', 1 from q;

-- ---------- 数列 × 2 ----------
with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '等差数列通项与求和',
    '等差数列 {a_n} 中，a_3=5，a_7=13。求公差 d、通项 a_n，以及前 10 项和 S_10。',
    '由 a_n=a_1+(n-1)d 列方程；S_n=n(a_1+a_n)/2。',
    '数学题库 · 数列 · 1',
    1,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '数列', 0 from q;

with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '等比数列与求和',
    '等比数列 {a_n} 中，a_1=2，公比 q=1/2。求 a_5 与前 6 项和 S_6。',
    'a_n=a_1 q^{n-1}；S_n=a_1(1-q^n)/(1-q)（q≠1）。',
    '数学题库 · 数列 · 2',
    1,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '数列', 1 from q;

-- ========== 高二 ==========

-- ---------- 立体几何 × 2 ----------
with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '线面垂直判定',
    '在正方体 ABCD-A₁B₁C₁D₁ 中，棱长为 1。求证：AC₁ ⊥ 平面 A₁BD，并求点 A 到平面 A₁BD 的距离。',
    '用向量法：证 AC₁·A₁B=AC₁·A₁D=0；距离可用体积法或点到面公式。',
    '数学题库 · 立体几何 · 1',
    2,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '立体几何', 0 from q;

with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '二面角与空间角',
    '正四面体棱长为 2。求相邻两个面所成二面角的余弦值。',
    '取棱中点或建系，用两个法向量夹角（注意二面角与法向量夹角的关系）。',
    '数学题库 · 立体几何 · 2',
    3,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '立体几何', 1 from q;

-- ---------- 概率统计 × 2 ----------
with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '样本均值与方差',
    '一组数据：2, 4, 4, 6, 9。求样本平均数 x̄ 与样本方差 s²（分母用 n）。',
    'x̄=Σx_i/n；s²=Σ(x_i-x̄)²/n（若考题要求用 n-1 则按题意）。',
    '数学题库 · 概率统计 · 1',
    1,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '概率统计', 0 from q;

with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '正态分布与频率',
    '某成绩近似服从正态分布 N(μ,σ²)，已知约 68% 的数据落在 (μ-σ, μ+σ) 内。若 μ=70，σ=10，估计落在 (60,80) 内的比例约多少？落在 (50,90) 呢？',
    '记住 1σ≈68%、2σ≈95% 的经验规则即可作答。',
    '数学题库 · 概率统计 · 2',
    2,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '概率统计', 1 from q;

-- ---------- 古典概型 × 2 ----------
with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '古典概型基本计数',
    '袋中有 3 红 2 白共 5 个球，随机摸出 2 个。求恰好 1 红 1 白的概率。',
    '分母 C(5,2)；分子 C(3,1)·C(2,1)。',
    '数学题库 · 古典概型 · 1',
    1,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '古典概型', 0 from q;

with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '掷骰子古典概型',
    '掷两枚均匀骰子，求点数之和为 7 的概率。',
    '基本事件共 6×6=36；和为 7 的有 (1,6)…(6,1) 共 6 种。',
    '数学题库 · 古典概型 · 2',
    1,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '古典概型', 1 from q;

-- ---------- 条件概率 × 2 ----------
with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '条件概率定义',
    '掷一枚均匀骰子，事件 A={点数为偶数}，B={点数≥4}。求 P(A|B)。',
    'P(A|B)=P(A∩B)/P(B)；先列出 B 与 A∩B 的样本点。',
    '数学题库 · 条件概率 · 1',
    2,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '条件概率', 0 from q;

with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '全概率与贝叶斯入门',
    '某产品由甲、乙两厂生产，甲占 60%、乙占 40%；甲次品率 2%，乙次品率 5%。随机抽一件为次品，求它来自甲厂的概率。',
    '设 A=次品，B₁/B₂=甲/乙；用贝叶斯公式 P(B₁|A)=P(A|B₁)P(B₁)/P(A)。',
    '数学题库 · 条件概率 · 2',
    2,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '条件概率', 1 from q;

-- ---------- 线性规划 × 2 ----------
with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '可行域与目标函数',
    '约束：x≥0，y≥0，x+y≤4，2x+y≤6。目标 z=3x+2y。求 z 的最大值及对应 (x,y)。',
    '画出可行域多边形，在顶点处算 z，取最大者。',
    '数学题库 · 线性规划 · 1',
    2,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '线性规划', 0 from q;

with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '线性规划最小值',
    '约束：x≥1，y≥0，x+2y≥4，x≤3。目标 z=x+y。求 z 的最小值。',
    '同样找可行域顶点（或边界交点），比较目标函数值。',
    '数学题库 · 线性规划 · 2',
    2,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '线性规划', 1 from q;

-- ========== 高三 ==========

-- ---------- 椭圆与双曲线 × 2 ----------
with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '椭圆标准方程与焦点',
    '椭圆 C: x²/25 + y²/16 = 1。求长轴长、短轴长、焦距、离心率 e，以及焦点坐标。',
    'a=5，b=4，c=√(a²-b²)；e=c/a；焦点 (±c,0)。',
    '数学题库 · 椭圆与双曲线 · 1',
    1,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '椭圆与双曲线', 0 from q;

with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '双曲线渐近线与离心率',
    '双曲线 C: x²/9 - y²/16 = 1。求实轴长、虚轴长、离心率 e，并写出渐近线方程。',
    'a=3，b=4，c=√(a²+b²)；e=c/a；渐近线 y=±(b/a)x。',
    '数学题库 · 椭圆与双曲线 · 2',
    2,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '椭圆与双曲线', 1 from q;

-- ---------- 抛物线 × 2（与早期种子不同题） ----------
with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '抛物线定义与焦点准线',
    '抛物线 y²=8x。求焦点坐标、准线方程，以及点 P(2,4) 到焦点与到准线的距离（验证定义）。',
    '标准形 y²=2px → 2p=8，p=4；焦点 (p/2,0)，准线 x=-p/2。',
    '数学题库 · 抛物线 · full-1',
    1,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '抛物线', 2 from q;

with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '抛物线焦半径',
    '抛物线 y²=4x，点 P 在抛物线上且纵坐标为 2。求 |PF|（F 为焦点）。',
    '先求 P 横坐标；焦半径公式：对 y²=2px，|PF|=x_P+p/2。',
    '数学题库 · 抛物线 · full-2',
    2,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '抛物线', 3 from q;

-- ---------- 导数应用 × 2（与早期种子不同题） ----------
with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '导数与单调区间',
    '函数 f(x)=x³-3x²-9x+5。求 f(x) 的单调递增区间与单调递减区间。',
    '求 f''(x)=0 的根，列表判断 f'' 符号，得增减区间。',
    '数学题库 · 导数应用 · full-1',
    2,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '导数应用', 2 from q;

with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '导数与不等式恒成立',
    '已知 f(x)=ln x - ax + 1。若对任意 x>0 都有 f(x)≤0，求实数 a 的取值范围。',
    '等价于 g(x)=ln x +1 ≤ ax 对 x>0 恒成立，或研究 h(x)=f(x) 最大值 ≤0；常用求导找极值。',
    '数学题库 · 导数应用 · full-2',
    3,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '导数应用', 3 from q;

-- ---------- 复数 × 2 ----------
with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '复数四则运算',
    '设 z₁=1+2i，z₂=3-i。求 z₁+z₂、z₁z₂、以及 |z₁|。',
    '实部虚部分开算；|a+bi|=√(a²+b²)。',
    '数学题库 · 复数 · 1',
    1,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '复数', 0 from q;

with q as (
  insert into public.learning_resources (
    resource_type, title, stem, answer_hint, source_label, difficulty, status, platform
  ) values (
    'question',
    '复数方程与共轭',
    '设复数 z 满足 z + conjugate(z) = 4，且 z·conjugate(z)=5。求 z。',
    '令 z=x+yi，则 2x=4，x²+y²=5，解出 x,y。',
    '数学题库 · 复数 · 2',
    2,
    'published',
    'internal'
  )
  returning id
)
insert into public.resource_knowledge_tags (resource_id, subject, knowledge_point, sort_order)
select id, '数学', '复数', 1 from q;
