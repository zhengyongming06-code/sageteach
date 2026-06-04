-- Product validation dashboard: funnel, AI quality, user feedback (replace growth metrics)

create table if not exists public.analytics_product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  event_date date not null default (timezone('Asia/Shanghai', now()))::date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_product_events_type_date_idx
  on public.analytics_product_events (event_type, event_date desc);

alter table public.analytics_product_events enable row level security;

create policy "analytics_product_events self insert" on public.analytics_product_events
  for insert with check (auth.uid() = user_id);

create or replace function public.record_product_analytics_event(
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'unauthorized';
  end if;
  insert into analytics_product_events (user_id, event_type, event_date, metadata)
  values (uid, p_event_type, analytics_today_cst(), coalesce(p_metadata, '{}'::jsonb));
end;
$$;

grant execute on function public.record_product_analytics_event(text, jsonb) to authenticated;

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
  v_review_started bigint;
  v_review_completed bigint;
  v_photo_count bigint;
  v_training_total bigint;
  v_training_done bigint;
  v_series jsonb;
  v_funnel jsonb;
  v_ai jsonb;
  v_feedback jsonb;
  v_photo_attempts bigint;
  v_photo_successes bigint;
  v_photo_anomalies bigint;
  v_extract_attempts bigint;
  v_extract_successes bigint;
begin
  if not public.is_analytics_admin() then
    raise exception 'forbidden';
  end if;

  select count(distinct user_id) into v_dau
  from public.analytics_user_activity_days(v_to, v_to);

  select count(distinct user_id) into v_wau
  from public.analytics_user_activity_days(v_to - 6, v_to);

  select count(*) into v_photo_attempts
  from coach_messages cm
  where cm.role = 'user'
    and cm.content = '__sage_photo_v1__'
    and (timezone('Asia/Shanghai', cm.created_at))::date between v_from and v_to;

  select count(*) into v_photo_successes
  from coach_messages cm
  where cm.role = 'assistant'
    and cm.content like '__sage_photo_md_v1__%'
    and (timezone('Asia/Shanghai', cm.created_at))::date between v_from and v_to;

  select count(*) into v_photo_anomalies
  from coach_messages cm
  where cm.role = 'assistant'
    and cm.content like '__sage_photo_md_v1__%'
    and (timezone('Asia/Shanghai', cm.created_at))::date between v_from and v_to
    and (
      length(regexp_replace(cm.content, '^__sage_photo_md_v1__', '')) < 120
      or cm.content like '%旧版分析%'
      or cm.content like '%识别失败%'
      or cm.content like '%需重新拍照%'
      or cm.content not like '%##%'
    );

  begin
    select count(*) into v_extract_attempts
    from learning_evidence le
    where le.evidence_type = 'photo'
      and (timezone('Asia/Shanghai', le.created_at))::date between v_from and v_to;

    select count(*) into v_extract_successes
    from learning_evidence le
    where le.evidence_type = 'photo'
      and (timezone('Asia/Shanghai', le.created_at))::date between v_from and v_to
      and (
        cardinality(le.linked_knowledge_points) > 0
        or jsonb_array_length(coalesce(le.extraction -> 'knowledge_points', '[]'::jsonb)) > 0
      );
  exception when undefined_table then
    v_extract_attempts := v_photo_successes;
    v_extract_successes := 0;
  end;

  if v_extract_attempts = 0 then
    v_extract_attempts := v_photo_successes;
  end if;

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

  v_photo_count := v_photo_successes;

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

  with photo_u as (
    select distinct cm.user_id
    from coach_messages cm
    where cm.role = 'user'
      and cm.content = '__sage_photo_v1__'
      and (timezone('Asia/Shanghai', cm.created_at))::date between v_from and v_to
  ),
  review_u as (
    select distinct cm.user_id
    from coach_messages cm
    where cm.review_session_slug is not null
      and (timezone('Asia/Shanghai', cm.created_at))::date between v_from and v_to
      and exists (
        select 1 from coach_messages u
        where u.user_id = cm.user_id
          and u.review_session_slug = cm.review_session_slug
          and u.role = 'user'
      )
  ),
  photo_review_u as (
    select p.user_id from photo_u p
    where exists (select 1 from review_u r where r.user_id = p.user_id)
  ),
  complete_u as (
    select distinct rs.user_id
    from review_summaries rs
    where rs.session_date between v_from and v_to
  ),
  photo_review_complete_u as (
    select pr.user_id from photo_review_u pr
    where exists (select 1 from complete_u c where c.user_id = pr.user_id)
  ),
  training_u as (
    select distinct dt.user_id
    from daily_training_items dt
    where dt.training_date between v_from and v_to
  ),
  photo_review_complete_training_u as (
    select pr.user_id from photo_review_complete_u pr
    where exists (select 1 from training_u t where t.user_id = pr.user_id)
  ),
  training_done_u as (
    select distinct dt.user_id
    from daily_training_items dt
    where dt.training_date between v_from and v_to
      and dt.status = 'done'
  ),
  photo_review_complete_training_done_u as (
    select pr.user_id from photo_review_complete_training_u pr
    where exists (select 1 from training_done_u t where t.user_id = pr.user_id)
  ),
  counts as (
    select
      (select count(*) from photo_u) as c_photo,
      (select count(*) from photo_review_u) as c_review,
      (select count(*) from photo_review_complete_u) as c_complete,
      (select count(*) from photo_review_complete_training_u) as c_training,
      (select count(*) from photo_review_complete_training_done_u) as c_training_done
  )
  select jsonb_build_array(
    jsonb_build_object(
      'key', 'photo',
      'label', '拍题',
      'users', c.c_photo,
      'rate_from_previous', null
    ),
    jsonb_build_object(
      'key', 'review',
      'label', 'Review',
      'users', c.c_review,
      'rate_from_previous',
        case when c.c_photo > 0 then round(c.c_review::numeric / c.c_photo, 4) else 0 end
    ),
    jsonb_build_object(
      'key', 'review_complete',
      'label', '完成 Review',
      'users', c.c_complete,
      'rate_from_previous',
        case when c.c_review > 0 then round(c.c_complete::numeric / c.c_review, 4) else 0 end
    ),
    jsonb_build_object(
      'key', 'training_generated',
      'label', '生成训练',
      'users', c.c_training,
      'rate_from_previous',
        case when c.c_complete > 0 then round(c.c_training::numeric / c.c_complete, 4) else 0 end
    ),
    jsonb_build_object(
      'key', 'training_done',
      'label', '完成训练',
      'users', c.c_training_done,
      'rate_from_previous',
        case when c.c_training > 0 then round(c.c_training_done::numeric / c.c_training, 4) else 0 end
    )
  )
  into v_funnel
  from counts c;

  v_ai := jsonb_build_object(
    'photo_analysis_success_rate',
      case when v_photo_attempts > 0 then round(v_photo_successes::numeric / v_photo_attempts, 4) else 0 end,
    'photo_analysis_attempts', v_photo_attempts,
    'photo_analysis_successes', v_photo_successes,
    'ai_output_anomaly_rate',
      case when v_photo_successes > 0 then round(v_photo_anomalies::numeric / v_photo_successes, 4) else 0 end,
    'ai_output_anomalies', v_photo_anomalies,
    'knowledge_extraction_success_rate',
      case when v_extract_attempts > 0 then round(v_extract_successes::numeric / v_extract_attempts, 4) else 0 end,
    'knowledge_extraction_attempts', v_extract_attempts,
    'knowledge_extraction_successes', v_extract_successes
  );

  begin
    with weak as (
      select rs.weak_point as label, count(*)::bigint as cnt
      from review_summaries rs
      where rs.session_date between v_from and v_to
        and coalesce(trim(rs.weak_point), '') <> ''
      group by rs.weak_point
      order by cnt desc
      limit 8
    ),
    mistakes as (
      select smp.label, smp.subject, sum(smp.occurrence_count)::bigint as cnt
      from student_mistake_patterns smp
      where (timezone('Asia/Shanghai', smp.last_seen_at))::date between v_from and v_to
      group by smp.label, smp.subject
      order by cnt desc
      limit 8
    ),
    training_clicks as (
      select
        coalesce(
          ape.metadata ->> 'task_type',
          ape.metadata ->> 'label',
          '训练任务'
        ) as label,
        coalesce(ape.metadata ->> 'subject', '') as subject,
        count(*)::bigint as cnt
      from analytics_product_events ape
      where ape.event_type = 'training_go_click'
        and ape.event_date between v_from and v_to
      group by 1, 2
      order by cnt desc
      limit 8
    ),
    training_done_rank as (
      select
        dt.task_type || ' · ' || dt.knowledge_point as label,
        dt.subject,
        count(*)::bigint as cnt
      from daily_training_items dt
      where dt.training_date between v_from and v_to
        and dt.status = 'done'
      group by dt.task_type, dt.knowledge_point, dt.subject
      order by cnt desc
      limit 8
    )
    select jsonb_build_object(
      'top_weak_points',
        coalesce(
          (select jsonb_agg(jsonb_build_object('label', w.label, 'count', w.cnt) order by w.cnt desc) from weak w),
          '[]'::jsonb
        ),
      'top_mistake_patterns',
        coalesce(
          (select jsonb_agg(jsonb_build_object('label', m.label, 'subject', m.subject, 'count', m.cnt) order by m.cnt desc) from mistakes m),
          '[]'::jsonb
        ),
      'top_training_tasks',
        coalesce(
          (select jsonb_agg(jsonb_build_object('label', t.label, 'subject', t.subject, 'count', t.cnt) order by t.cnt desc) from training_clicks t),
          (select jsonb_agg(jsonb_build_object('label', d.label, 'subject', d.subject, 'count', d.cnt) order by d.cnt desc) from training_done_rank d),
          '[]'::jsonb
        )
    )
    into v_feedback;
  exception when undefined_table then
    select coalesce(
      (
        select jsonb_build_object(
          'top_weak_points',
            coalesce(
              (
                select jsonb_agg(jsonb_build_object('label', w.label, 'count', w.cnt) order by w.cnt desc)
                from (
                  select rs.weak_point as label, count(*)::bigint as cnt
                  from review_summaries rs
                  where rs.session_date between v_from and v_to
                    and coalesce(trim(rs.weak_point), '') <> ''
                  group by rs.weak_point
                  order by cnt desc
                  limit 8
                ) w
              ),
              '[]'::jsonb
            ),
          'top_mistake_patterns', '[]'::jsonb,
          'top_training_tasks', '[]'::jsonb
        )
      ),
      '{}'::jsonb
    )
    into v_feedback;
  end;

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
    'review_completion_rate',
      case when v_review_started > 0 then round(v_review_completed::numeric / v_review_started, 4) else 0 end,
    'review_started', v_review_started,
    'review_completed', v_review_completed,
    'photo_count', v_photo_count,
    'daily_training_completion_rate',
      case when v_training_total > 0 then round(v_training_done::numeric / v_training_total, 4) else 0 end,
    'daily_training_total', v_training_total,
    'daily_training_done', v_training_done,
    'dau_series', v_series,
    'funnel', coalesce(v_funnel, '[]'::jsonb),
    'ai_quality', v_ai,
    'feedback', coalesce(v_feedback, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.get_product_analytics_dashboard(int) to authenticated;
