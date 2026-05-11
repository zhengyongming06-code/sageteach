
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  grade text,
  current_score integer,
  target_score integer,
  exam_date date,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles self read" on public.profiles for select using (auth.uid() = id);
create policy "profiles self insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles self update" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Weak subjects
create table public.weak_subjects (
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  primary key (user_id, subject)
);
alter table public.weak_subjects enable row level security;
create policy "weak_subjects self all" on public.weak_subjects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reflections
create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  answers jsonb not null default '{}'::jsonb,
  ai_diagnosis text,
  created_at timestamptz not null default now()
);
alter table public.reflections enable row level security;
create policy "reflections self all" on public.reflections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index reflections_user_created_idx on public.reflections (user_id, created_at desc);

-- Coach messages
create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.coach_messages enable row level security;
create policy "coach_messages self all" on public.coach_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index coach_messages_user_created_idx on public.coach_messages (user_id, created_at);

-- Daily plans
create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null default current_date,
  plan jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, plan_date)
);
alter table public.daily_plans enable row level security;
create policy "daily_plans self all" on public.daily_plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Score plans
create table public.score_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.score_plans enable row level security;
create policy "score_plans self all" on public.score_plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Articles (public read)
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null,
  body text not null,
  tag text not null,
  reading_minutes integer not null default 4,
  created_at timestamptz not null default now()
);
alter table public.articles enable row level security;
create policy "articles public read" on public.articles for select using (true);
