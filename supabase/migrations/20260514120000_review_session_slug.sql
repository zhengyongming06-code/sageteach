-- Multiple review threads per user + subject + calendar day (disambiguated by slug).
alter table public.coach_messages
  add column if not exists review_session_slug uuid;

-- One stable slug per legacy (user, subject, date) thread
with g as (
  select distinct user_id, review_subject, review_session_date
  from public.coach_messages
  where review_subject is not null
    and review_session_date is not null
),
slugged as (
  select
    user_id,
    review_subject,
    review_session_date,
    gen_random_uuid() as review_session_slug
  from g
)
update public.coach_messages cm
set review_session_slug = s.review_session_slug
from slugged s
where cm.user_id = s.user_id
  and cm.review_subject = s.review_subject
  and cm.review_session_date = s.review_session_date
  and cm.review_session_slug is null;

create index if not exists coach_messages_user_review_session_slug_idx
  on public.coach_messages (user_id, review_session_slug)
  where review_session_slug is not null;

comment on column public.coach_messages.review_session_slug is 'Identifies one review conversation; multiple slugs may share the same review_session_date + review_subject.';

alter table public.review_summaries
  add column if not exists review_session_slug uuid;

-- Optional: your hosted DB may have these constraints from an older schema
alter table if exists public.review_sessions
  drop constraint if exists review_sessions_user_subject_session_date_key;

alter table public.review_summaries
  drop constraint if exists review_summaries_user_session_unique;

-- Allow users to delete their own summaries (session delete)
drop policy if exists "review_summaries self delete" on public.review_summaries;
create policy "review_summaries self delete" on public.review_summaries
  for delete using (auth.uid() = user_id);
