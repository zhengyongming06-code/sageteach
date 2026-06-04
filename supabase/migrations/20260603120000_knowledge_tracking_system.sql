-- Sage 学生知识追踪：图谱目录、掌握度数值、错题流水、每日训练
-- 与现有 knowledge_points / coach_messages / review_summaries 并存，逐步迁移

-- ---------------------------------------------------------------------------
-- 1. 全局知识图谱目录（种子数据来自应用内 SUBJECT_KNOWLEDGE_BY_GRADE）
-- ---------------------------------------------------------------------------
create table public.kg_catalog_nodes (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  name text not null,
  parent_id uuid references public.kg_catalog_nodes (id) on delete set null,
  grade_band text check (grade_band in ('高一', '高二', '高三')),
  depth smallint not null default 0 check (depth >= 0 and depth <= 3),
  path text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint kg_catalog_nodes_subject_name_key unique (subject, name)
);

create index kg_catalog_nodes_subject_idx on public.kg_catalog_nodes (subject);
create index kg_catalog_nodes_parent_idx on public.kg_catalog_nodes (parent_id);

alter table public.kg_catalog_nodes enable row level security;

create policy "kg_catalog_nodes read all" on public.kg_catalog_nodes
  for select using (true);

-- ---------------------------------------------------------------------------
-- 2. 扩展用户知识点掌握度（在 knowledge_points 上增加数值型字段）
-- ---------------------------------------------------------------------------
alter table public.knowledge_points
  add column if not exists catalog_node_id uuid references public.kg_catalog_nodes (id) on delete set null,
  add column if not exists mastery_score numeric(5, 2) check (mastery_score >= 0 and mastery_score <= 100),
  add column if not exists correct_count int not null default 0 check (correct_count >= 0),
  add column if not exists wrong_count int not null default 0 check (wrong_count >= 0),
  add column if not exists streak_correct int not null default 0 check (streak_correct >= 0),
  add column if not exists last_event_at timestamptz,
  add column if not exists last_wrong_at timestamptz;

create index knowledge_points_mastery_idx
  on public.knowledge_points (user_id, subject, mastery_score);

-- ---------------------------------------------------------------------------
-- 3. 掌握度变更事件（可审计、可重算）
-- ---------------------------------------------------------------------------
create table public.knowledge_mastery_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  knowledge_point text not null,
  catalog_node_id uuid references public.kg_catalog_nodes (id) on delete set null,
  event_type text not null check (
    event_type in (
      'photo_wrong',
      'photo_quiz_wrong',
      'photo_quiz_correct',
      'diagnostic_wrong',
      'diagnostic_correct',
      'review_mastered',
      'manual_adjust'
    )
  ),
  delta_score numeric(6, 2) not null,
  score_before numeric(5, 2),
  score_after numeric(5, 2) not null,
  source_type text not null check (source_type in ('photo', 'quiz', 'diagnostic', 'review', 'system')),
  source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index knowledge_mastery_events_user_created_idx
  on public.knowledge_mastery_events (user_id, created_at desc);
create index knowledge_mastery_events_user_kp_idx
  on public.knowledge_mastery_events (user_id, subject, knowledge_point);

alter table public.knowledge_mastery_events enable row level security;

create policy "knowledge_mastery_events self read" on public.knowledge_mastery_events
  for select using (auth.uid() = user_id);

create policy "knowledge_mastery_events self insert" on public.knowledge_mastery_events
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. 拍照错题库
-- ---------------------------------------------------------------------------
create table public.student_wrong_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  coach_message_id uuid references public.coach_messages (id) on delete set null,
  review_session_slug text,
  review_session_date date,
  question_summary text not null,
  question_type text,
  difficulty smallint check (difficulty >= 1 and difficulty <= 5),
  knowledge_points text[] not null default '{}',
  is_resolved boolean not null default false,
  resolved_at timestamptz,
  extraction jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index student_wrong_questions_user_created_idx
  on public.student_wrong_questions (user_id, created_at desc);
create index student_wrong_questions_user_subject_idx
  on public.student_wrong_questions (user_id, subject);
create index student_wrong_questions_unresolved_idx
  on public.student_wrong_questions (user_id, is_resolved)
  where is_resolved = false;

alter table public.student_wrong_questions enable row level security;

create policy "student_wrong_questions self read" on public.student_wrong_questions
  for select using (auth.uid() = user_id);

create policy "student_wrong_questions self insert" on public.student_wrong_questions
  for insert with check (auth.uid() = user_id);

create policy "student_wrong_questions self update" on public.student_wrong_questions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. 弱点树快照（按用户+科目物化，便于 Today / 档案页快速读取）
-- ---------------------------------------------------------------------------
create table public.student_weakness_trees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  tree jsonb not null,
  weak_count int not null default 0,
  computed_at timestamptz not null default now(),
  constraint student_weakness_trees_user_subject_key unique (user_id, subject)
);

create index student_weakness_trees_user_idx on public.student_weakness_trees (user_id);

alter table public.student_weakness_trees enable row level security;

create policy "student_weakness_trees self read" on public.student_weakness_trees
  for select using (auth.uid() = user_id);

create policy "student_weakness_trees self upsert" on public.student_weakness_trees
  for insert with check (auth.uid() = user_id);

create policy "student_weakness_trees self update" on public.student_weakness_trees
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 6. 每日训练推荐
-- ---------------------------------------------------------------------------
create table public.daily_training_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  training_date date not null default (timezone('Asia/Shanghai', now()))::date,
  subject text not null,
  knowledge_point text not null,
  catalog_node_id uuid references public.kg_catalog_nodes (id) on delete set null,
  priority int not null default 50 check (priority >= 0 and priority <= 100),
  reason text not null,
  task_type text not null default '同类练习' check (
    task_type in ('同类练习', '错题重做', '巩固测验', '诊断补测')
  ),
  estimated_minutes int not null default 15 check (estimated_minutes > 0),
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint daily_training_items_user_date_kp_key
    unique (user_id, training_date, subject, knowledge_point)
);

create index daily_training_items_user_date_idx
  on public.daily_training_items (user_id, training_date desc);

alter table public.daily_training_items enable row level security;

create policy "daily_training_items self read" on public.daily_training_items
  for select using (auth.uid() = user_id);

create policy "daily_training_items self insert" on public.daily_training_items
  for insert with check (auth.uid() = user_id);

create policy "daily_training_items self update" on public.daily_training_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 7. RPC：批量写入掌握度（Edge Function 用 service role 或 authenticated）
-- ---------------------------------------------------------------------------
create or replace function public.apply_knowledge_mastery_batch(
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev jsonb;
  v_user_id uuid;
  v_subject text;
  v_kp text;
  v_delta numeric;
  v_event_type text;
  v_source_type text;
  v_source_id uuid;
  v_metadata jsonb;
  v_before numeric;
  v_after numeric;
  v_status text;
  v_now timestamptz := now();
  v_results jsonb := '[]'::jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'unauthorized';
  end if;

  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'p_events must be a json array';
  end if;

  for ev in select * from jsonb_array_elements(p_events)
  loop
    v_subject := ev->>'subject';
    v_kp := ev->>'knowledge_point';
    v_delta := (ev->>'delta_score')::numeric;
    v_event_type := ev->>'event_type';
    v_source_type := coalesce(ev->>'source_type', 'photo');
    v_source_id := nullif(ev->>'source_id', '')::uuid;
    v_metadata := coalesce(ev->'metadata', '{}'::jsonb);

    select mastery_score into v_before
    from knowledge_points
    where user_id = v_user_id and subject = v_subject and name = v_kp
    for update;

    if not found then
      v_before := null;
      insert into knowledge_points (user_id, subject, name, status, mastery_score, updated_at)
      values (v_user_id, v_subject, v_kp, '未测试', null, v_now);
    end if;

    v_after := greatest(0, least(100, coalesce(v_before, 50) + v_delta));

    if v_after < 30 then v_status := '薄弱';
    elsif v_after < 70 then v_status := '掌握中';
    else v_status := '已掌握';
    end if;

    update knowledge_points
    set
      mastery_score = v_after,
      status = case when correct_count = 0 and wrong_count = 0 and v_before is null then v_status else v_status end,
      correct_count = correct_count + case when v_delta > 0 then 1 else 0 end,
      wrong_count = wrong_count + case when v_delta < 0 then 1 else 0 end,
      streak_correct = case when v_delta > 0 then streak_correct + 1 else 0 end,
      last_event_at = v_now,
      last_wrong_at = case when v_delta < 0 then v_now else last_wrong_at end,
      updated_at = v_now
    where user_id = v_user_id and subject = v_subject and name = v_kp;

    insert into knowledge_mastery_events (
      user_id, subject, knowledge_point, event_type,
      delta_score, score_before, score_after,
      source_type, source_id, metadata
    ) values (
      v_user_id, v_subject, v_kp, v_event_type,
      v_delta, v_before, v_after,
      v_source_type, v_source_id, v_metadata
    );

    v_results := v_results || jsonb_build_object(
      'subject', v_subject,
      'knowledge_point', v_kp,
      'score_before', v_before,
      'score_after', v_after,
      'status', v_status
    );
  end loop;

  return v_results;
end;
$$;

grant execute on function public.apply_knowledge_mastery_batch(jsonb) to authenticated;
