-- Review chat stores on existing coach_messages (no new REST tables = no 404 if only this runs)
alter table public.coach_messages
  add column if not exists review_subject text,
  add column if not exists review_session_date date;

comment on column public.coach_messages.review_subject is 'When set with review_session_date, row belongs to subject+date review thread; null = Today/general coach thread.';

create index if not exists coach_messages_user_review_session_idx
  on public.coach_messages (user_id, review_subject, review_session_date)
  where review_subject is not null and review_session_date is not null;
