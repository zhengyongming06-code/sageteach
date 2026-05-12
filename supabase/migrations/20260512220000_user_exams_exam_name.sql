-- Custom exam countdown: multiple exams per user + display name on profile

alter table public.profiles
  add column if not exists exam_name text;

create table if not exists public.user_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  exam_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists user_exams_user_exam_date_idx
  on public.user_exams (user_id, exam_date asc);

alter table public.user_exams enable row level security;

create policy "user_exams self read" on public.user_exams
  for select using (auth.uid() = user_id);

create policy "user_exams self insert" on public.user_exams
  for insert with check (auth.uid() = user_id);

create policy "user_exams self update" on public.user_exams
  for update using (auth.uid() = user_id);

create policy "user_exams self delete" on public.user_exams
  for delete using (auth.uid() = user_id);

-- Backfill from legacy profile.exam_date (one row per user)
insert into public.user_exams (user_id, name, exam_date)
select p.id, coalesce(nullif(trim(p.exam_name), ''), '重要考试'), p.exam_date::date
from public.profiles p
where p.exam_date is not null
  and not exists (select 1 from public.user_exams ue where ue.user_id = p.id);

update public.profiles p
set exam_name = '重要考试'
where p.exam_date is not null
  and (p.exam_name is null or trim(both from p.exam_name) = '');
