-- Learning Session + Evidence + Mistake Pattern（知识状态中心架构）

create table if not exists public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  session_type text not null check (session_type in ('review', 'photo', 'diagnostic', 'training')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  legacy_review_session_slug text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists learning_sessions_user_started_idx
  on public.learning_sessions (user_id, started_at desc);

alter table public.learning_sessions enable row level security;

create policy "learning_sessions self read" on public.learning_sessions
  for select using (auth.uid() = user_id);

create policy "learning_sessions self insert" on public.learning_sessions
  for insert with check (auth.uid() = user_id);

create policy "learning_sessions self update" on public.learning_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------

create table if not exists public.learning_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid references public.learning_sessions (id) on delete set null,
  evidence_type text not null check (evidence_type in ('photo', 'chat', 'diagnostic', 'quiz')),
  subject text not null,
  coach_message_id uuid references public.coach_messages (id) on delete set null,
  raw_content text,
  extraction jsonb not null default '{}'::jsonb,
  linked_knowledge_points text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists learning_evidence_user_created_idx
  on public.learning_evidence (user_id, created_at desc);

alter table public.learning_evidence enable row level security;

create policy "learning_evidence self read" on public.learning_evidence
  for select using (auth.uid() = user_id);

create policy "learning_evidence self insert" on public.learning_evidence
  for insert with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------

create table if not exists public.student_mistake_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  pattern_key text not null,
  label text not null,
  description text,
  knowledge_points text[] not null default '{}',
  occurrence_count int not null default 1 check (occurrence_count >= 1),
  last_seen_at timestamptz not null default now(),
  constraint student_mistake_patterns_user_subject_key unique (user_id, subject, pattern_key)
);

create index if not exists student_mistake_patterns_user_idx
  on public.student_mistake_patterns (user_id, last_seen_at desc);

alter table public.student_mistake_patterns enable row level security;

create policy "student_mistake_patterns self read" on public.student_mistake_patterns
  for select using (auth.uid() = user_id);

create policy "student_mistake_patterns self insert" on public.student_mistake_patterns
  for insert with check (auth.uid() = user_id);

create policy "student_mistake_patterns self update" on public.student_mistake_patterns
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
