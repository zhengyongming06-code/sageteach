-- Knowledge point tracking + diagnostic test answer log (new-user optional flow)

create table public.knowledge_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  name text not null,
  status text not null default '未测试',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_points_status_check check (
    status in ('未测试', '薄弱', '掌握中', '已掌握')
  ),
  constraint knowledge_points_user_subject_name_key unique (user_id, subject, name)
);

create index knowledge_points_user_idx on public.knowledge_points (user_id);
create index knowledge_points_user_subject_idx on public.knowledge_points (user_id, subject);

alter table public.knowledge_points enable row level security;

create policy "knowledge_points self read" on public.knowledge_points
  for select using (auth.uid() = user_id);

create policy "knowledge_points self insert" on public.knowledge_points
  for insert with check (auth.uid() = user_id);

create policy "knowledge_points self update" on public.knowledge_points
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "knowledge_points self delete" on public.knowledge_points
  for delete using (auth.uid() = user_id);

create table public.diagnostic_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null,
  knowledge_point text not null,
  is_correct boolean not null,
  created_at timestamptz not null default now()
);

create index diagnostic_results_user_created_idx
  on public.diagnostic_results (user_id, created_at desc);

alter table public.diagnostic_results enable row level security;

create policy "diagnostic_results self read" on public.diagnostic_results
  for select using (auth.uid() = user_id);

create policy "diagnostic_results self insert" on public.diagnostic_results
  for insert with check (auth.uid() = user_id);
