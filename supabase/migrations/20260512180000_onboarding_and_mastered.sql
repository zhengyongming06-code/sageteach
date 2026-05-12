alter table public.profiles
  add column if not exists review_onboarding_complete boolean not null default false;

update public.profiles p
set review_onboarding_complete = true
where exists (
  select 1 from public.review_summaries rs where rs.user_id = p.id
);

alter table public.review_summaries
  add column if not exists mastered text;
