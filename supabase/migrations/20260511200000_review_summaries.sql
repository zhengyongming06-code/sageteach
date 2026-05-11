create table public.review_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null default (timezone('utc', now()))::date,
  subject text not null,
  weak_point text not null,
  tonight_task text not null,
  follow_up text not null,
  created_at timestamptz not null default now()
);

alter table public.review_summaries enable row level security;

create policy "review_summaries self read" on public.review_summaries
  for select using (auth.uid() = user_id);

create policy "review_summaries self insert" on public.review_summaries
  for insert with check (auth.uid() = user_id);

create index review_summaries_user_created_idx
  on public.review_summaries (user_id, created_at desc);
