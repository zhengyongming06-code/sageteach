/**
 * 高中网课 / 名师资源参考（整理自用，非官方合作列表）
 */

export type FamousTeacher = {
  /** 学科（与 App 内 SUBJECTS 可对照） */
  subject: string;
  /** 老师名或常用称呼 */
  name: string;
  /** 擅长领域、风格简述 */
  expertise: string;
  /** 建议优先看的模块或专题 */
  suggestedModules: string[];
};

export const FAMOUS_TEACHERS: FamousTeacher[] = [
  {
    subject: "数学",
    name: "赵礼显",
    expertise: "函数与导数综合、选填提速、题型归纳清晰",
    suggestedModules: ["函数与导数", "三角函数与解三角形", "数列", "选填技巧"],
  },
  {
    subject: "数学",
    name: "一数",
    expertise: "体系完整、基础到拔高衔接顺，适合系统补漏",
    suggestedModules: ["必修同步", "圆锥曲线", "导数大题", "概率统计"],
  },
  {
    subject: "数学",
    name: "佟大大",
    expertise: "讲解细致、适合基础薄弱同学建立信心",
    suggestedModules: ["函数入门", "立体几何", "概率", "一轮复习专题"],
  },
  {
    subject: "数学",
    name: "王伟",
    expertise: "圆锥曲线与导数大题套路",
    suggestedModules: ["椭圆/双曲线/抛物线", "导数恒成立", "极值点偏移"],
  },
  {
    subject: "物理",
    name: "夏梦迪",
    expertise: "模型化与「大招」解题、强调应试节奏",
    suggestedModules: ["力学综合", "电磁场", "动量能量", "实验题"],
  },
  {
    subject: "物理",
    name: "黄夫人",
    expertise: "电学、基础讲得清楚，适合从零补电学",
    suggestedModules: ["电场", "恒定电流", "磁场", "电磁感应"],
  },
  {
    subject: "物理",
    name: "赵玉峰",
    expertise: "一轮体系完整，题型覆盖全",
    suggestedModules: ["牛顿定律", "曲线运动", "万有引力", "电磁综合"],
  },
  {
    subject: "物理",
    name: "李楠",
    expertise: "竞赛背景，难题与思维拓展",
    suggestedModules: ["力学进阶", "电磁压轴", "物理图像"],
  },
  {
    subject: "英语",
    name: "陶然（FREE 高考英语）",
    expertise: "语法体系、阅读与七选五方法论",
    suggestedModules: ["语法填空", "阅读理解", "七选五", "写作句式"],
  },
  {
    subject: "英语",
    name: "李辉",
    expertise: "阅读理解「括号法」、作文模板化",
    suggestedModules: ["阅读定位", "完形填空", "应用文/读后续写"],
  },
  {
    subject: "英语",
    name: "徐磊",
    expertise: "语法与完形技巧向",
    suggestedModules: ["从句与非谓语", "完形逻辑", "改错"],
  },
  {
    subject: "语文",
    name: "国家玮",
    expertise: "作文与阅读审题、语言质感提升",
    suggestedModules: ["现代文阅读", "作文立意", "文言文实词"],
  },
  {
    subject: "语文",
    name: "杨洋",
    expertise: "作文结构、素材运用与文采训练",
    suggestedModules: ["议论文框架", "任务驱动型作文", "名句默写策略"],
  },
  {
    subject: "语文",
    name: "乘风",
    expertise: "阅读与文言文题型拆解",
    suggestedModules: ["小说阅读", "文言文翻译", "诗歌鉴赏"],
  },
  {
    subject: "化学",
    name: "李政",
    expertise: "无机有机体系、工业流程与实验大题",
    suggestedModules: ["元素化合物", "反应原理", "有机推断", "实验设计"],
  },
  {
    subject: "化学",
    name: "高东辉",
    expertise: "基础化学、方程式与实验讲得细",
    suggestedModules: ["物质的量", "氧化还原", "电化学基础"],
  },
  {
    subject: "化学",
    name: "郑瑞",
    expertise: "结构化学与原理题",
    suggestedModules: ["物质结构", "化学平衡", "水溶液离子平衡"],
  },
  {
    subject: "生物",
    name: "万猛",
    expertise: "必修选修体系化、图表与实验题",
    suggestedModules: ["细胞与代谢", "遗传计算", "稳态与调节", "基因工程"],
  },
  {
    subject: "生物",
    name: "周芳煜",
    expertise: "遗传专题、适合遗传薄弱同学",
    suggestedModules: ["孟德尔定律", "伴性遗传", "系谱图", "变异与育种"],
  },
  {
    subject: "生物",
    name: "张继光",
    expertise: "一轮全面、知识密度高",
    suggestedModules: ["分子与细胞", "生态", "实验探究题"],
  },
  {
    subject: "政治",
    name: "马宇轩",
    expertise: "主观题逻辑与时政术语",
    suggestedModules: ["经济生活", "政治生活", "哲学主观题", "时政热点"],
  },
  {
    subject: "政治",
    name: "刘勖雯",
    expertise: "大题模板与知识串联",
    suggestedModules: ["文化生活", "当代国际政治与经济", "法律与生活"],
  },
  {
    subject: "历史",
    name: "段北辰",
    expertise: "通史框架、材料题作答结构",
    suggestedModules: ["中国古代史", "世界近现代史", "开放性试题"],
  },
  {
    subject: "历史",
    name: "定哥",
    expertise: "时间轴记忆、选择题技巧",
    suggestedModules: ["纲要上下串讲", "选修模块", "历史小论文"],
  },
  {
    subject: "地理",
    name: "安迎",
    expertise: "自然地理原理讲得透",
    suggestedModules: ["大气", "水循环与洋流", "地质地貌", "整体性差异性"],
  },
  {
    subject: "地理",
    name: "张艳平",
    expertise: "综合题思维与区域案例",
    suggestedModules: ["人文地理", "区域可持续发展", "选修旅游/环保"],
  },
];

const norm = (s: string) => s.trim().toLowerCase();

/**
 * 在名师库中查找：关键词可同时匹配学科、姓名、擅长领域、建议模块（不区分大小写，子串即可）。
 */
export function findTeachers(keyword: string): FamousTeacher[] {
  const q = norm(keyword);
  if (!q) return [...FAMOUS_TEACHERS];

  return FAMOUS_TEACHERS.filter((t) => {
    const inSubject = norm(t.subject).includes(q);
    const inName = norm(t.name).includes(q);
    const inExpertise = norm(t.expertise).includes(q);
    const inModules = t.suggestedModules.some((m) => norm(m).includes(q));
    return inSubject || inName || inExpertise || inModules;
  });
}

/** 按学科精确匹配（与数据中的 subject 字段一致，如「数学」） */
export function findTeachersBySubject(subject: string): FamousTeacher[] {
  const s = subject.trim();
  if (!s) return [];
  return FAMOUS_TEACHERS.filter((t) => t.subject === s);
}
