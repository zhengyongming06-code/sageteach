import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { syncProfileNearestExam } from "@/lib/user-exams";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

const STEP1_GRADES = ["高一", "高二", "高三", "其他"] as const;

function Onboarding() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [grade, setGrade] = useState<string>("");
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [current, setCurrent] = useState("");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("onboarded")
          .eq("id", user.id)
          .maybeSingle();
        if (data?.onboarded) nav({ to: "/app/today" });
      } catch (err) {
        console.warn("[onboarding] profile onboarded check failed", err);
      }
    })();
  }, [user, nav]);

  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(0, s - 1));

  const save = async () => {
    if (!user) return;
    const name = examName.trim();
    if (!name || !examDate) {
      toast.error("请填写考试名称和日期");
      return;
    }
    setSaving(true);
    try {
      const parseScore = (label: string, raw: string) => {
        const t = raw.trim();
        if (!t) throw new Error(`请填写${label}`);
        const n = Number(t);
        if (!Number.isFinite(n)) throw new Error(`${label}须为有效数字`);
        return n;
      };
      const currentScore = parseScore("当前分", current);
      const targetScore = parseScore("目标分", target);

      const { data: examRow, error: eExam } = await supabase
        .from("user_exams")
        .insert({
          user_id: user.id,
          name,
          exam_date: examDate,
        })
        .select("id")
        .single();
      if (eExam) throw eExam;

      const { error: eProfile } = await supabase
        .from("profiles")
        .update({
          grade,
          current_score: currentScore,
          target_score: targetScore,
          exam_name: name,
          exam_date: examDate,
          onboarded: true,
        })
        .eq("id", user.id);
      if (eProfile) {
        await supabase.from("user_exams").delete().eq("id", examRow.id);
        throw eProfile;
      }

      await syncProfileNearestExam(user.id);
      nav({ to: "/app/today" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    {
      title: "你现在是几年级？",
      body: (
        <div className="grid grid-cols-2 gap-2">
          {STEP1_GRADES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                setGrade(g);
                if (g === "高三") {
                  setExamName("高考");
                  setExamDate("2026-06-07");
                } else {
                  setExamName("");
                  setExamDate("");
                }
                next();
              }}
              className={`rounded-2xl border px-4 py-4 text-base transition ${
                grade === g
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      ),
      can: !!grade,
    },
    {
      title: "设置你的下一个重要考试",
      body: (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm text-muted-foreground">考试名称</p>
            <Input
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              placeholder="期末考试 / 高考 / 模拟考…"
              className="h-12 rounded-2xl text-base"
            />
          </div>
          <div>
            <p className="mb-2 text-sm text-muted-foreground">考试日期</p>
            <Input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="h-12 rounded-2xl text-base"
            />
            {grade === "高三" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                高三默认「高考」与 2026-06-07，可随时修改。
              </p>
            ) : null}
          </div>
        </div>
      ),
      can: !!examName.trim() && !!examDate,
    },
    {
      title: "目标分与当前分",
      body: (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm text-muted-foreground">当前分（大概）</p>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="例如 520"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="h-12 rounded-2xl text-lg"
            />
          </div>
          <div>
            <p className="mb-2 text-sm text-muted-foreground">目标分</p>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="例如 600"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-12 rounded-2xl text-lg"
            />
          </div>
        </div>
      ),
      can: !!current && !!target,
    },
  ];

  const cur = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      <div className="mb-8 flex gap-1.5">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition ${i <= step ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25 }}
          className="flex-1"
        >
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{cur.title}</h1>
          <div className="mt-8">{cur.body}</div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={back} disabled={step === 0}>
          上一步
        </Button>
        {last ? (
          <Button
            onClick={() => void save()}
            disabled={!cur.can || saving}
            className="h-12 rounded-xl px-6"
          >
            {saving ? "保存中…" : "完成"}
          </Button>
        ) : (
          <Button onClick={next} disabled={!cur.can} className="h-12 rounded-xl px-6">
            下一步
          </Button>
        )}
      </div>
    </div>
  );
}
