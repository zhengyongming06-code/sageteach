## Sage 学习教练 — Build Plan

A calm, Apple-like AI academic coach for Chinese high school students. Mobile-first, Chinese-first, dark mode, Supabase auth + DB, Lovable AI Gateway for streaming AI responses.

### Stack
- TanStack Start (existing template)
- Lovable Cloud (Supabase) for auth, DB, session persistence
- Lovable AI Gateway (`google/gemini-3-flash-preview` default, `openai/gpt-5.2` for deeper diagnosis) via server functions with SSE streaming
- Tailwind v4 design tokens in `src/styles.css`
- shadcn components, customized

### Design system
- Warm, calm palette: ivory background, soft sand, muted terracotta primary, deep ink foreground; dark mode = warm charcoal + amber accent
- Typography: system Chinese stack (PingFang SC, HarmonyOS Sans, Noto Sans SC) + Inter for numerals
- Generous spacing, rounded-2xl cards, subtle shadows, soft motion (framer-motion)
- No purple, no neon, no over-gradients

### Routes
```
/                       landing (brief, calm hero → CTA login)
/login, /signup         email + password (Chinese errors, loading states)
/onboarding             grade, current score, target, days to exam, weak subjects
/_authenticated/
  app                   shell with bottom tab nav (mobile) / side nav (desktop)
    today               今日计划
    review              学科复盘 (subject picker → subject-specific flow → AI diagnosis)
    coach               AI教练 (streaming chat with memory)
    plan                提分分析 (score strategy, ROI per subject, weekly plan)
    articles            成长文章 (curated long-form pieces)
```

### Database (Supabase)
- `profiles` (id, grade, current_score, target_score, exam_date, created_at)
- `weak_subjects` (user_id, subject)
- `reflections` (id, user_id, subject, answers jsonb, ai_diagnosis text, created_at)
- `coach_messages` (id, user_id, role, content, created_at) — full history sent each turn
- `daily_plans` (id, user_id, date, plan jsonb)
- `score_plans` (id, user_id, plan jsonb, created_at)
- `articles` (id, slug, title, excerpt, body, tag) — seeded
- RLS: user can only read/write own rows; articles public read
- `user_roles` table + `has_role()` (kept minimal, future-proof)

### Server functions (`src/lib/*.functions.ts`)
- `coach.functions.ts` — streaming chat, pulls profile + recent reflections + last N messages for context
- `reflection.functions.ts` — subject-specific diagnosis (structured via tool calling)
- `plan.functions.ts` — daily plan + score-improvement strategy
- All use `requireSupabaseAuth`; system prompts crafted per feature, banning the listed clichés

### Subject reflection flows
Distinct question sets for 数学/英语/物理/化学/生物/语文/政治/历史/地理. Each renders as a multi-step card form, then calls AI for structured diagnosis (root cause, knowledge gap, panic vs skill, next action).

### AI tone rules (system prompt)
- Forbidden phrases enumerated
- Required behaviors: diagnose root cause, reduce shame, give one concrete next action, natural Chinese, max 200 字 unless analysis requested
- Reasoning effort `medium` for coach + reflection; `low` for daily plan

### Articles
Seed 6–8 authentic long-form pieces in DB (raw, non-cheesy: 高三真实故事, 崩溃后的重建, 深夜共鸣, etc.)

### Out of scope (v1)
- Push notifications, social features, payment, admin dashboard, image upload

### Order of implementation
1. Enable Lovable Cloud
2. Design tokens + base layout
3. Auth (signup auto-login, mobile session persistence, Chinese errors)
4. DB schema + RLS migration
5. Onboarding flow
6. App shell + nav
7. Coach chat (streaming) — validates AI gateway end-to-end
8. Subject reflection (most important feature)
9. Today plan + score plan
10. Articles seed + reader
11. Polish, dark mode QA, mobile QA
