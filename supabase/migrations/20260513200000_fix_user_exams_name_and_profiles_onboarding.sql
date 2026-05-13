-- Align remote schemas with the app: some DBs used different column names.

-- 1) user_exams: app expects column "name" (not exam_name)
alter table public.user_exams add column if not exists name text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'user_exams'
      and c.column_name = 'exam_name'
  ) then
    update public.user_exams
    set name = coalesce(
      nullif(trim(both from name), ''),
      nullif(trim(both from exam_name::text), ''),
      '重要考试'
    );
  end if;
end $$;

update public.user_exams
set name = coalesce(nullif(trim(both from name), ''), '重要考试')
where name is null or trim(both from name) = '';

alter table public.user_exams alter column name set default '重要考试';

do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'user_exams'
      and c.column_name = 'name'
      and c.is_nullable = 'YES'
  ) then
    alter table public.user_exams alter column name set not null;
  end if;
end $$;

-- 2) profiles: app expects review_onboarding_complete (not ..._completed)
do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = 'review_onboarding_completed'
  )
  and not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'profiles'
      and c.column_name = 'review_onboarding_complete'
  ) then
    alter table public.profiles rename column review_onboarding_completed to review_onboarding_complete;
  end if;
end $$;

alter table public.profiles
  add column if not exists review_onboarding_complete boolean not null default false;
