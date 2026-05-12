-- Daily practice question (Today page) and post-review session feedback

create table if not exists public.daily_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  question text,
  subject text,
  answer text,
  explanation text,
  completed boolean not null default false,
  was_correct boolean,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists daily_questions_user_date_idx
  on public.daily_questions (user_id, date desc);

alter table public.daily_questions enable row level security;

create policy "daily_questions self read" on public.daily_questions
  for select using (auth.uid() = user_id);

create policy "daily_questions self insert" on public.daily_questions
  for insert with check (auth.uid() = user_id);

create policy "daily_questions self update" on public.daily_questions
  for update using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------

create table public.review_session_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_date date not null,
  subject text not null,
  rating text not null check (rating in ('helpful', 'neutral', 'unhelpful')),
  created_at timestamptz not null default now()
);

create index review_session_feedback_user_created_idx
  on public.review_session_feedback (user_id, created_at desc);

alter table public.review_session_feedback enable row level security;

create policy "review_session_feedback self read" on public.review_session_feedback
  for select using (auth.uid() = user_id);

create policy "review_session_feedback self insert" on public.review_session_feedback
  for insert with check (auth.uid() = user_id);
