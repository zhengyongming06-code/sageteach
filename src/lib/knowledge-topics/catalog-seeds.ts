import { SUBJECT_KNOWLEDGE_BY_GRADE, type GradeBand } from "@/lib/knowledge-points";
import { SUBJECTS, type Subject } from "@/lib/subjects";
import {
  bilibiliSearchUrl,
  pickCuratorsForSubject,
} from "@/lib/knowledge-topics/curators";
import type { KnowledgeTopicEntry } from "@/lib/knowledge-topics/topic-types";

const SUBJECT_SLUG: Record<Subject, string> = {
  语文: "cn",
  数学: "math",
  英语: "en",
  物理: "phy",
  化学: "chem",
  生物: "bio",
  政治: "pol",
  历史: "hist",
  地理: "geo",
};

function slugFor(subject: Subject, name: string): string {
  return `${SUBJECT_SLUG[subject]}-${name.replace(/\s+/g, "-")}`;
}

function autoEntry(subject: Subject, name: string, gradeBand: GradeBand): KnowledgeTopicEntry {
  const curators = pickCuratorsForSubject(subject, 3);
  return {
    subject,
    name,
    slug: slugFor(subject, name),
    gradeBand,
    eyebrow: `${subject} · ${gradeBand}`,
    summary: `高考「${name}」常见考点。拍错题识点后可在此看 ${curators[0]?.name ?? "B站"} 等推荐讲解，并完成同类练手。`,
    sections: [
      {
        id: "path",
        title: "建议学习路径",
        body: `① 看辅学块或本页推荐视频，先搞清概念；② 做 2 道同类题检验；③ 仍卡壳时在复盘里「继续追问 Sage」，只练不会的那一步。`,
      },
    ],
    videos: curators.slice(0, 2).map((c, i) => ({
      id: `auto-v${i}`,
      title: `${name} · ${c.name}专题`,
      teacher: c.name,
      platform: "bilibili" as const,
      url: bilibiliSearchUrl(`${c.name} ${name}`),
      note: c.note,
    })),
    practiceQuestions: [],
    relatedNames: [],
  };
}

/** Hand-curated rich entries (override auto-generated stubs). */
export const CURATED_TOPIC_ENTRIES: KnowledgeTopicEntry[] = [
  {
    subject: "数学",
    name: "椭圆与双曲线",
    slug: "math-conic-ellipse",
    gradeBand: "高三",
    eyebrow: "圆锥曲线 · 高频卡点",
    summary:
      "直线与椭圆/双曲线联立、判别式、弦长与中点弦，是高考解析几何的核心套路。拍错题后常落在此类知识点。",
    sections: [
      {
        id: "chord",
        title: "弦长问题怎么入手",
        body:
          "典型路径：① 直线方程代入曲线 → 一元二次方程；② 用 Δ 判断相交；③ 弦长 |AB| = √(1+k²)|x₁-x₂| 或 √(1+1/k²)|y₁-y₂|。易错点：根与系数关系与弦长公式混用、漏算 k。",
      },
      {
        id: "midpoint",
        title: "中点弦与点差法",
        body: "若题干给中点，优先考虑点差法求斜率；与弦长题区分，避免一律硬算联立。",
      },
    ],
    videos: [
      {
        id: "v1",
        title: "圆锥曲线弦长与中点弦",
        teacher: "赵礼显",
        platform: "bilibili",
        url: "https://search.bilibili.com/all?keyword=赵礼显%20圆锥曲线%20弦长",
        note: "策展搜索 · 后续绑 BV 号",
      },
      {
        id: "v2",
        title: "椭圆与直线联立基础",
        teacher: "赵礼显",
        platform: "bilibili",
        url: "https://search.bilibili.com/all?keyword=赵礼显%20椭圆%20直线%20联立",
      },
    ],
    practiceQuestions: [
      {
        id: "q1",
        stem: "椭圆 x²/4 + y²/3 = 1 与 y = x + m 相交，求弦长（先联立，再用 |x₁-x₂|√(1+k²)）。",
        source: "模拟题",
        difficulty: 2,
        answerHint: "联立消元 → 写出 Δ>0 条件 → 用根与系数关系求 |x₁-x₂|",
      },
      {
        id: "q2",
        stem: "直线 y = 2x + 1 与椭圆 x²/9 + y²/4 = 1 交于 A、B，求 |AB|。",
        source: "模拟题",
        difficulty: 2,
      },
    ],
    relatedNames: ["抛物线", "导数应用"],
  },
  {
    subject: "物理",
    name: "带电粒子运动",
    slug: "physics-charged-particle",
    gradeBand: "高三",
    eyebrow: "磁场 · 洛伦兹力",
    summary:
      "带电粒子在匀强磁场中偏转，圆心定位与半径几何关系是常见卡点；与复盘拍题场景高度相关。",
    sections: [
      {
        id: "center",
        title: "圆心怎么定",
        body:
          "洛伦兹力方向用左手定则；速度方向与圆心在同一条垂直于速度的直线上。作图题：先定 force 方向 → 再定圆心 → 画轨迹。",
      },
      {
        id: "radius",
        title: "半径与几何",
        body: "r = mv/(qB)；结合边界条件（磁场宽度、偏转角）列方程。",
      },
    ],
    videos: [
      {
        id: "v1",
        title: "带电粒子在磁场中圆周运动",
        teacher: "黄夫人",
        platform: "bilibili",
        url: "https://search.bilibili.com/all?keyword=黄夫人%20带电粒子%20磁场",
        note: "基础",
      },
      {
        id: "v2",
        title: "磁场综合与圆心定位",
        teacher: "夏梦迪",
        platform: "bilibili",
        url: "https://search.bilibili.com/all?keyword=夏梦迪%20带电粒子%20磁场",
        note: "进阶",
      },
    ],
    practiceQuestions: [
      {
        id: "q1",
        stem: "粒子以 v 垂直进入匀强磁场，画出轨迹并标圆心（给定 B 方向）。",
        source: "模拟题 · 作图",
        difficulty: 2,
        answerHint: "左手定则定 force → 圆心在 v 垂线方向",
      },
    ],
    relatedNames: ["磁场", "电磁感应"],
  },
  {
    subject: "语文",
    name: "作文立意",
    slug: "cn-composition-theme",
    gradeBand: "高三",
    eyebrow: "作文 · 一类文起点",
    summary:
      "材料作文立意决定分数上限：抓关键词、辨关系、落到具体价值判断。拍错题或作文低分后，常落在立意偏题、观点空泛。",
    sections: [
      {
        id: "keywords",
        title: "从材料里抓什么",
        body: "先圈关键词与限定语（谁、在什么情境、冲突是什么）；再写「材料在讨论 X 与 Y 的关系」，避免一上来就套万能模板。",
      },
      {
        id: "depth",
        title: "立意怎么不空",
        body: "好立意 = 明确态度 + 可论证的分论点。例：不只写「要重视传承」，而写「传承不是复制，是在新语境里激活旧价值」。",
      },
    ],
    videos: [
      {
        id: "v1",
        title: "高考作文立意方法",
        teacher: "国家玮",
        platform: "bilibili",
        url: "https://search.bilibili.com/all?keyword=国家玮%20高考作文%20立意",
      },
      {
        id: "v2",
        title: "材料作文审题与立意",
        teacher: "国家玮",
        platform: "bilibili",
        url: "https://search.bilibili.com/all?keyword=国家玮%20材料作文%20立意",
      },
    ],
    practiceQuestions: [
      {
        id: "q1",
        stem: "给一则双观点材料，写出中心论点 + 两个分论点（各一句，可论证）。",
        source: "作文训练",
        difficulty: 2,
        answerHint: "中心论点要有态度；分论点要能展开举例或对比",
      },
    ],
    relatedNames: ["实用类文本", "论述类选项辨析"],
  },
  {
    subject: "英语",
    name: "阅读理解长难句",
    slug: "en-reading-long-sentence",
    gradeBand: "高三",
    eyebrow: "阅读 · 长难句拆解",
    summary:
      "阅读错因一半是长难句：找主干、辨从句、理清指代。拍错题识点后适合先拆句再回选项。",
    sections: [
      {
        id: "skeleton",
        title: "三步拆句",
        body: "① 找谓语定主干；② 从关系词（which/that/when/where）切从句；③ 还原指代（it/they/this 指谁）。",
      },
      {
        id: "options",
        title: "拆完怎么选",
        body: "细节题回原文定位同义替换；推理题看作者态度词（suggest/concern/doubt）；不要凭感觉选「看起来对」的。",
      },
    ],
    videos: [
      {
        id: "v1",
        title: "高考英语阅读长难句",
        teacher: "FREE高考英语",
        platform: "bilibili",
        url: "https://search.bilibili.com/all?keyword=FREE高考英语%20长难句",
      },
      {
        id: "v2",
        title: "阅读真题长难句精讲",
        teacher: "龙坚",
        platform: "bilibili",
        url: "https://search.bilibili.com/all?keyword=龙坚%20英语%20长难句",
        note: "备选",
      },
    ],
    practiceQuestions: [
      {
        id: "q1",
        stem: "任选一篇阅读里的一句长难句：标主干 + 划出从句 + 写出中文大意（3 行内）。",
        source: "阅读训练",
        difficulty: 2,
      },
    ],
    relatedNames: ["书面表达", "完形填空"],
  },
  {
    subject: "化学",
    name: "化学平衡",
    slug: "chem-equilibrium",
    gradeBand: "高二",
    eyebrow: "反应原理 · 勒夏特列",
    summary:
      "平衡常数、转化率、条件改变对平衡的影响是高频考点；与拍题中的图像题、计算题高度相关。",
    sections: [
      {
        id: "lechatelier",
        title: "勒夏特列怎么用",
        body: "浓度、压强、温度变化 → 平衡向减弱改变方向移动。注意：催化剂只加快速率，不改平衡位置；固体、纯液体浓度不进 K。",
      },
      {
        id: "calc",
        title: "计算题套路",
        body: "列三段式（始、变、平）→ 用 K 表达式 → 注意单位与气体分压。易错：把 Q 与 K 混淆。",
      },
    ],
    videos: [
      {
        id: "v1",
        title: "化学平衡与勒夏特列",
        teacher: "李政",
        platform: "bilibili",
        url: "https://search.bilibili.com/all?keyword=李政%20化学平衡",
      },
      {
        id: "v2",
        title: "平衡常数与图像",
        teacher: "李政",
        platform: "bilibili",
        url: "https://search.bilibili.com/all?keyword=李政%20化学平衡%20图像",
      },
    ],
    practiceQuestions: [
      {
        id: "q1",
        stem: "恒温恒容下 A ⇌ 2B，增大 A 浓度，平衡如何移动？B 的物质的量怎么变？",
        source: "模拟题",
        difficulty: 2,
        answerHint: "浓度增大 → 向消耗 A 方向移动",
      },
    ],
    relatedNames: ["电化学", "工业流程"],
  },
  {
    subject: "生物",
    name: "遗传综合",
    slug: "bio-genetics-combined",
    gradeBand: "高三",
    eyebrow: "遗传 · 大题综合",
    summary:
      "伴性遗传、自由组合、概率计算与系谱分析常合在一起考；拍错题后需要拆题型而不是死记答案。",
    sections: [
      {
        id: "pattern",
        title: "先判遗传方式",
        body: "系谱题：隐性看女病男正常/男病女正常；伴性看交叉遗传。实验题：先写基因型符号，再配子，最后算概率。",
      },
      {
        id: "prob",
        title: "概率怎么算稳",
        body: "分步：① 确定亲本基因型；② 列出配子类型及比例；③ 乘法法则算子代。易错：漏算致死或重组类型。",
      },
    ],
    videos: [
      {
        id: "v1",
        title: "高考生物遗传综合",
        teacher: "李林",
        platform: "bilibili",
        url: "https://search.bilibili.com/all?keyword=李林%20遗传%20综合",
      },
      {
        id: "v2",
        title: "伴性遗传与系谱图",
        teacher: "李林",
        platform: "bilibili",
        url: "https://search.bilibili.com/all?keyword=李林%20伴性遗传",
      },
    ],
    practiceQuestions: [
      {
        id: "q1",
        stem: "给一系谱图（含隐性性状），判断常染色体隐性还是伴 X 隐性，并写出依据（2 条）。",
        source: "模拟题 · 系谱",
        difficulty: 2,
      },
    ],
    relatedNames: ["遗传规律基础", "实验设计"],
  },
  {
    subject: "数学",
    name: "导数应用",
    slug: "math-derivative-apps",
    gradeBand: "高三",
    eyebrow: "导数 · 单调与极值",
    summary:
      "导数求单调区间、极值、最值与恒成立问题是高考大题常客；与拍错题中的分类讨论、端点漏检相关。",
    sections: [
      {
        id: "mono",
        title: "单调区间标准流程",
        body: "求 f′(x) → 找零点与不可导点 → 列表或穿根定符号 → 写区间。含参题先对参数分类讨论。",
      },
      {
        id: "always",
        title: "恒成立 / 能成立",
        body: "f(x)≥0 恒成立 → 看 f(x)min；能成立 → 看 f(x)max。分离参数或构造函数求导是常用套路。",
      },
    ],
    videos: [
      {
        id: "v1",
        title: "导数应用大题通法",
        teacher: "赵礼显",
        platform: "bilibili",
        url: "https://search.bilibili.com/all?keyword=赵礼显%20导数%20应用",
      },
      {
        id: "v2",
        title: "导数与恒成立",
        teacher: "赵礼显",
        platform: "bilibili",
        url: "https://search.bilibili.com/all?keyword=赵礼显%20导数%20恒成立",
      },
    ],
    practiceQuestions: [
      {
        id: "q1",
        stem: "f(x)=x³-3x+1，求单调区间与极值点（写出 f′ 与符号表思路）。",
        source: "模拟题",
        difficulty: 2,
      },
    ],
    relatedNames: ["椭圆与双曲线", "函数与导数基础"],
  },
];

const curatedKeys = new Set(
  CURATED_TOPIC_ENTRIES.map((e) => `${e.subject}\0${e.name}`),
);

export function generateCatalogSeedEntries(): KnowledgeTopicEntry[] {
  const out: KnowledgeTopicEntry[] = [];
  for (const subject of SUBJECTS) {
    const bands = SUBJECT_KNOWLEDGE_BY_GRADE[subject];
    for (const band of Object.keys(bands) as GradeBand[]) {
      for (const name of bands[band] ?? []) {
        const key = `${subject}\0${name}`;
        if (curatedKeys.has(key)) continue;
        out.push(autoEntry(subject, name, band));
      }
    }
  }
  return out;
}

export function buildAllCatalogEntries(): KnowledgeTopicEntry[] {
  return [...CURATED_TOPIC_ENTRIES, ...generateCatalogSeedEntries()];
}
