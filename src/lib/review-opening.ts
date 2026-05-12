/** Internal review_subject for the guided first session (no subject picker). */
export const ONBOARDING_REVIEW_SUBJECT = "总览";

/**
 * First assistant line for guided onboarding — inserted locally, not via API.
 */
export const REVIEW_GUIDED_FIRST_OPENING = `你好，我是Sage。我们用5分钟做一件事。
告诉我你上次考试哪道题最让你头疼——
题目说不清楚没关系，说说你当时的感觉。`;

/** If profile flag is already cleared but opening re-seeded (edge case). */
export const REVIEW_RETURNING_FIRST_OPENING =
  "你好，我是Sage。在我们开始之前，告诉我两件事：你现在的分数大概是多少，你想考到哪里？";

/** After structured summary is saved, final assistant line in the same session. */
export const POST_REVIEW_SESSION_CLOSING =
  "明天复盘时，告诉我这道题你又做了一遍，结果怎样。";

/** Closing line after the first guided onboarding summary. */
export const POST_FIRST_ONBOARDING_SESSION_CLOSING =
  "好，今天先到这里。你的第一个卡点已经记录了。\n明天继续。";
