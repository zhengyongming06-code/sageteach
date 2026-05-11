-- Per-subject, per-day review chat sessions (merged coach + 复盘)
create table public.review_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  session_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, subject, session_date)
);

alter table public.review_sessions enable row level security;

create policy "review_sessions self all" on public.review_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index review_sessions_user_subject_date_idx
  on public.review_sessions (user_id, subject, session_date desc);

create table public.review_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.review_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.review_messages enable row level security;

create policy "review_messages via session" on public.review_messages
  for all using (
    exists (
      select 1 from public.review_sessions s
      where s.id = review_messages.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.review_sessions s
      where s.id = review_messages.session_id and s.user_id = auth.uid()
    )
  );

create index review_messages_session_created_idx
  on public.review_messages (session_id, created_at);
