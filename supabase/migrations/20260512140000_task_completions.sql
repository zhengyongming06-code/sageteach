create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  review_summary_id uuid not null references public.review_summaries (id) on delete cascade,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, review_summary_id)
);

create index task_completions_user_idx on public.task_completions (user_id);

alter table public.task_completions enable row level security;

create policy "task_completions self read" on public.task_completions
  for select using (auth.uid() = user_id);

create policy "task_completions self insert" on public.task_completions
  for insert with check (auth.uid() = user_id);

create policy "task_completions self update" on public.task_completions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
