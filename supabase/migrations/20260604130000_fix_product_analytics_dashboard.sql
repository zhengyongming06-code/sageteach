-- Fix retention LATERAL joins + harden optional tables in product analytics dashboard

create or replace function public.get_product_analytics_dashboard(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_to date := analytics_today_cst();
  v_from date := v_to - greatest(p_days, 1) + 1;
  v_dau bigint;
  v_wau bigint;
  v_avg_streak numeric;
  v_max_streak bigint;
  v_review_started bigint;
  v_review_completed bigint;
  v_photo_count bigint;
  v_training_total bigint;
  v_training_done bigint;
  v_d1_retention numeric;
  v_d7_retention numeric;
  v_series jsonb;
  v_streak_dist jsonb;
begin
  if not public.is_analytics_admin() then
    raise exception 'forbidden';
  end if;

  select count(distinct user_id) into v_dau
  from public.analytics_user_activity_days(v_to, v_to);

  select count(distinct user_id) into v_wau
  from public.analytics_user_activity_days(v_to - 6, v_to);

  with act as (
    select * from public.analytics_user_activity_days(v_from - 60, v_to)
  ),
  numbered as (
    select
      user_id,
      activity_date,
      activity_date - (row_number() over (partition by user_id order by activity_date))::int as grp
    from act
  ),
  streaks as (
    select user_id, grp, count(*)::bigint as streak_len, max(activity_date) as streak_end
    from numbered
    group by user_id, grp
  ),
  current_streak as (
    select user_id, streak_len
    from streaks
    where streak_end >= v_to - 1
  )
  select coalesce(avg(streak_len), 0), coalesce(max(streak_len), 0)
  into v_avg_streak, v_max_streak
  from current_streak;

  with act as (
    select * from public.analytics_user_activity_days(v_from - 60, v_to)
  ),
  numbered as (
    select
      user_id,
      activity_date,
      activity_date - (row_number() over (partition by user_id order by activity_date))::int as grp
    from act
  ),
  streaks as (
    select user_id, grp, count(*)::bigint as streak_len, max(activity_date) as streak_end
    from numbered
    group by user_id, grp
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('days', streak_len, 'users', cnt) order by streak_len),
    '[]'::jsonb
  )
  into v_streak_dist
  from (
    select streak_len, count(*)::bigint as cnt
    from streaks
    where streak_end >= v_to - 1
    group by streak_len
  ) t;

  select count(distinct cm.review_session_slug) into v_review_started
  from coach_messages cm
  where cm.review_session_slug is not null
    and cm.review_subject is not null
    and (timezone('Asia/Shanghai', cm.created_at))::date between v_from and v_to
    and exists (
      select 1 from coach_messages u
      where u.user_id = cm.user_id
        and u.review_session_slug = cm.review_session_slug
        and u.role = 'user'
    );

  select count(distinct rs.review_session_slug) into v_review_completed
  from review_summaries rs
  where rs.review_session_slug is not null
    and rs.session_date between v_from and v_to;

  begin
    select count(*) into v_photo_count
    from (
      select id from learning_evidence
      where evidence_type = 'photo'
        and (timezone('Asia/Shanghai', created_at))::date between v_from and v_to
      union all
      select id from coach_messages
      where content like '__sage_photo_md_v1__%'
        and (timezone('Asia/Shanghai', created_at))::date between v_from and v_to
    ) p;
  exception when undefined_table then
    select count(*) into v_photo_count
    from coach_messages
    where content like '__sage_photo_md_v1__%'
      and (timezone('Asia/Shanghai', created_at))::date between v_from and v_to;
  end;

  begin
    select
      count(*),
      count(*) filter (where status = 'done')
    into v_training_total, v_training_done
    from daily_training_items
    where training_date between v_from and v_to;
  exception when undefined_table then
    v_training_total := 0;
    v_training_done := 0;
  end;

  with cohort as (
    select distinct user_id, activity_date as cohort_date
    from public.analytics_user_activity_days(v_from, v_to - 7)
  ),
  ret as (
    select
      c.cohort_date,
      count(distinct c.user_id) as cohort_size,
      count(distinct case when a1.user_id is not null then c.user_id end) as d1,
      count(distinct case when a7.user_id is not null then c.user_id end) as d7
    from cohort c
    left join lateral public.analytics_user_activity_days(c.cohort_date + 1, c.cohort_date + 1) a1
      on a1.user_id = c.user_id
    left join lateral public.analytics_user_activity_days(c.cohort_date + 7, c.cohort_date + 7) a7
      on a7.user_id = c.user_id
    group by c.cohort_date
  )
  select
    coalesce(sum(d1)::numeric / nullif(sum(cohort_size), 0), 0),
    coalesce(sum(d7)::numeric / nullif(sum(cohort_size), 0), 0)
  into v_d1_retention, v_d7_retention
  from ret
  where cohort_size > 0;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d::text,
        'dau', (
          select count(distinct user_id)
          from public.analytics_user_activity_days(d::date, d::date)
        )
      )
      order by d
    ),
    '[]'::jsonb
  )
  into v_series
  from generate_series(v_from, v_to, interval '1 day') as g(d);

  return jsonb_build_object(
    'range', jsonb_build_object('from', v_from::text, 'to', v_to::text, 'days', p_days),
    'dau', v_dau,
    'wau', v_wau,
    'avg_streak_days', round(v_avg_streak, 2),
    'max_streak_days', v_max_streak,
    'streak_distribution', v_streak_dist,
    'review_completion_rate',
      case when v_review_started > 0 then round(v_review_completed::numeric / v_review_started, 4) else 0 end,
    'review_started', v_review_started,
    'review_completed', v_review_completed,
    'photo_count', v_photo_count,
    'daily_training_completion_rate',
      case when v_training_total > 0 then round(v_training_done::numeric / v_training_total, 4) else 0 end,
    'daily_training_total', v_training_total,
    'daily_training_done', v_training_done,
    'retention_d1', round(v_d1_retention, 4),
    'retention_d7', round(v_d7_retention, 4),
    'dau_series', v_series
  );
end;
$$;

grant execute on function public.get_product_analytics_dashboard(int) to authenticated;
