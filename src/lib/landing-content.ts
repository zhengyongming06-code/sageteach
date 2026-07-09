/** Shared landing / demo copy — 拍错题 → 视频 + 练题 + AI 辅学 */

import type { Subject } from "@/lib/subjects";

export type LandingTarget =
  | { to: "/demo"; hash?: "capture" | "videos" | "practice" | "ai" | "today" }
  | { to: "/signup" };

export type LandingProduct = {
  status: "live" | "preview" | "planned";
  title: string;
  desc: string;
  target: LandingTarget;
  cta: string;
};

export const LANDING_PRODUCTS: LandingProduct[] = [
  {
    status: "live",
    title: "拍题识点",
    desc: "拍下错题，AI 从解析里抽出具体知识点——比如「圆锥曲线弦长」，不是笼统的「数学不好」。",
    target: { to: "/demo", hash: "capture" },
    cta: "看看识点示例",
  },
  {
    status: "preview",
    title: "视频推课",
    desc: "按知识点推荐 B 站讲解（如赵礼显等），外链跳转，先听再练。",
    target: { to: "/demo", hash: "videos" },
    cta: "看看视频示例",
  },
  {
    status: "preview",
    title: "同类练手",
    desc: "推 2～3 道同类题检验是否真懂；后续接入真题 / 授权题库。",
    target: { to: "/demo", hash: "practice" },
    cta: "看看练题示例",
  },
  {
    status: "live",
    title: "AI 追问",
    desc: "卡在某一步时，对话帮你定位「到底是联立不会，还是 Δ 算错」——不是直接给答案。",
    target: { to: "/demo", hash: "ai" },
    cta: "看看对话示例",
  },
];

export type LandingGraphNode = {
  x: number;
  y: number;
  label: string;
  kind: "active" | "planned";
  target: LandingTarget;
};

export const LANDING_GRAPH_NODES: LandingGraphNode[] = [
  { x: 178, y: 150, label: "拍题识点", kind: "active", target: { to: "/demo", hash: "capture" } },
  { x: 380, y: 100, label: "视频推课", kind: "active", target: { to: "/demo", hash: "videos" } },
  { x: 582, y: 150, label: "同类练手", kind: "active", target: { to: "/demo", hash: "practice" } },
  { x: 646, y: 282, label: "AI追问", kind: "active", target: { to: "/demo", hash: "ai" } },
  { x: 582, y: 414, label: "掌握度", kind: "active", target: { to: "/demo", hash: "today" } },
  { x: 380, y: 470, label: "题库接入", kind: "planned", target: { to: "/signup" } },
  { x: 178, y: 414, label: "诊断快测", kind: "planned", target: { to: "/signup" } },
  { x: 114, y: 282, label: "学科复盘", kind: "active", target: { to: "/demo", hash: "ai" } },
];

export const LANDING_GRAPH_EDGES: Array<[number, number, number, number]> = [
  [380, 280, 178, 150],
  [380, 280, 380, 100],
  [380, 280, 582, 150],
  [380, 280, 646, 282],
  [380, 280, 582, 414],
  [380, 280, 380, 470],
  [380, 280, 178, 414],
  [380, 280, 114, 282],
];

export const LANDING_OVERVIEW_STEPS = [
  {
    step: "01",
    title: "拍出错题，自动识点",
    desc: "复盘里拍照或描述卡点，Sage 提取如「圆锥曲线弦长」等具体知识点，写入你的掌握度档案。",
  },
  {
    step: "02",
    title: "推视频 + 同类题",
    desc: "按知识点推荐 B 站讲解链接，再配 2～3 道同类练手题——先听再练，不是盲刷。",
  },
  {
    step: "03",
    title: "AI 帮你找到真不懂处",
    desc: "练题或听课仍卡壳时，对话追问「卡在哪一步」，整理进今晚任务，第二天接着跟进。",
  },
] as const;

export const DEMO_PHOTO_CAPTION = {
  subject: "数学" as Subject,
  questionType: "圆锥曲线 · 直线与椭圆相交求弦长",
  knowledgePoints: ["椭圆与双曲线", "直线与圆锥曲线位置关系", "弦长公式"],
  summary: "已知椭圆与直线联立，求弦长；学生在判别式与根与系数关系处出错。",
};

export const DEMO_VIDEOS = [
  {
    title: "圆锥曲线弦长问题通法",
    teacher: "赵礼显",
    platform: "bilibili" as const,
    url: "https://search.bilibili.com/all?keyword=赵礼显%20圆锥曲线%20弦长",
    note: "数学 · 示例搜索链接",
  },
  {
    title: "椭圆与直线联立基础",
    teacher: "赵礼显",
    platform: "bilibili" as const,
    url: "https://search.bilibili.com/all?keyword=赵礼显%20椭圆%20直线%20联立",
  },
];

export const DEMO_PRACTICE_QUESTIONS = [
  {
    id: "p1",
    stem: "椭圆 x²/4 + y²/3 = 1 与直线 y = x + m 相交，求弦长（用 |x₁-x₂|√(1+k²) 思路）。",
    source: "模拟题 · 数学",
    status: "preview" as const,
  },
  {
    id: "p2",
    stem: "若直线 y = kx + 1 与椭圆 x²/9 + y²/4 = 1 相交于 A、B，且 |AB| = 4√5/5，求 k。",
    source: "模拟题 · 数学",
    status: "preview" as const,
  },
];

export const DEMO_AI_MESSAGES = [
  {
    role: "assistant" as const,
    content: "弦长题你卡在联立后的 Δ，还是根与系数关系？先别算弦长——你能写出联立后关于 x 的一元二次方程吗？",
  },
  {
    role: "user" as const,
    content: "联立我会，但 Δ 和 x₁+x₂ 老搞混，不知道哪个决定相交。",
  },
  {
    role: "assistant" as const,
    content: "好，我们只练一步：Δ > 0 说明相交；弦长用 |x₁-x₂|√(1+k²)。你先告诉我，这题里 k 是多少？",
  },
];

export const DEMO_REVIEW_MESSAGES = DEMO_AI_MESSAGES;

export const DEMO_SUMMARY = {
  subject: "数学",
  weakPoint: "圆锥曲线弦长——联立与 Δ、根与系数关系",
  tonightTask: "完成 2 道直线与椭圆相交求弦长题，每题先写联立步骤再算 Δ。",
};

export const DEMO_TONIGHT_TASKS = [
  {
    subject: "数学",
    task: "完成 2 道弦长同类题（见练手示例）",
    done: false,
  },
  {
    subject: "物理",
    task: "画 3 道带电粒子在磁场中偏转轨迹，练圆心定位",
    done: true,
  },
];

export function landingProductStatusLabel(status: LandingProduct["status"]) {
  if (status === "live") return "已上线";
  if (status === "preview") return "预览中";
  return "规划中";
}

export function landingLinkProps(target: LandingTarget) {
  if (target.to === "/signup") return { to: "/signup" as const };
  return { to: "/demo" as const, hash: target.hash };
}
