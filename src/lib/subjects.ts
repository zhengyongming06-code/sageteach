export const SUBJECTS = [
  "语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理",
] as const;

export type Subject = (typeof SUBJECTS)[number];

export const GRADES = ["高一", "高二", "高三", "复读", "大学备考"] as const;

type Question = { id: string; label: string; placeholder?: string };

export const REFLECTION_QUESTIONS: Record<Subject, Question[]> = {
  数学: [
    { id: "stuck_problem", label: "今天最卡的题是什么？", placeholder: "题目类型 / 出处 / 简述题面" },
    { id: "stuck_where", label: "卡在思路、计算还是模型？" },
    { id: "broken_concept", label: "哪个知识点断裂了？" },
    { id: "skill_or_panic", label: "你是不会，还是慌了？" },
    { id: "redo_plan", label: "如果再做一次，会怎么拆题？" },
  ],
  英语: [
    { id: "wrong_reading", label: "阅读错因是什么？" },
    { id: "vocab_or_logic", label: "是词汇、定位还是逻辑？" },
    { id: "tricky_sentence", label: "哪种句子最容易卡？" },
    { id: "new_expression", label: "今天记住了什么表达？" },
  ],
  物理: [
    { id: "broken_model", label: "哪个模型不会？" },
    { id: "force_analysis", label: "受力分析哪里乱？" },
    { id: "broken_step", label: "哪一步推导断了？" },
    { id: "formula_fail", label: "公式为什么联立失败？" },
  ],
  化学: [
    { id: "topic", label: "今天卡在哪一类反应/计算？" },
    { id: "reason", label: "是方程式不熟、电子转移还是平衡？" },
    { id: "lab_or_calc", label: "实验题还是计算题？哪一步？" },
    { id: "next", label: "下一次应该先看什么？" },
  ],
  生物: [
    { id: "topic", label: "今天哪个概念最绕？" },
    { id: "reason", label: "是遗传计算、过程图还是术语？" },
    { id: "missed", label: "材料题漏掉的是哪类信息？" },
    { id: "next", label: "下一步要怎么补？" },
  ],
  语文: [
    { id: "section", label: "今天在哪一类题失分最多？" },
    { id: "reason", label: "是审题、答题模板，还是积累？" },
    { id: "writing", label: "作文卡在立意还是结构？" },
    { id: "feeling", label: "读不进去 / 状态散，是真的吗？" },
  ],
  政治: [
    { id: "module", label: "哪个模块最模糊？" },
    { id: "framework", label: "答题框架卡在哪一步？" },
    { id: "linking", label: "材料和原理之间断在哪里？" },
    { id: "next", label: "今晚 20 分钟可以补什么？" },
  ],
  历史: [
    { id: "period", label: "哪个时期 / 主线最乱？" },
    { id: "answer_pattern", label: "材料题答题套路卡在哪？" },
    { id: "memory", label: "是记不住，还是不会用？" },
    { id: "next", label: "明天要重做的一道题是？" },
  ],
  地理: [
    { id: "topic", label: "今天卡在自然还是人文？" },
    { id: "spatial", label: "空间想象 / 图表读不懂的部分？" },
    { id: "model", label: "哪个区位 / 过程模型不熟？" },
    { id: "next", label: "下一步先看哪一类题？" },
  ],
};
