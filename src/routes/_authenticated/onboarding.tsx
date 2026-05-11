import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { GRADES, SUBJECTS, type Subject } from "@/lib/subjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [grade, setGrade] = useState<string>("");
  const [current, setCurrent] = useState("");
  const [target, setTarget] = useState("");
  const [days, setDays] = useState("");
  const [weak, setWeak] = useState<Subject[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("onboarded").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data?.onboarded) nav({ to: "/app/today" });
    });
  }, [user, nav]);

  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(0, s - 1));

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const examDate = days ? new Date(Date.now() + Number(days) * 86400000).toISOString().slice(0, 10) : null;
      const { error: e1 } = await supabase.from("profiles").update({
        grade,
        current_score: current ? Number(current) : null,
        target_score: target ? Number(target) : null,
        exam_date: examDate,
        onboarded: true,
      }).eq("id", user.id);
      if (e1) throw e1;
      if (weak.length) {
        await supabase.from("weak_subjects").delete().eq("user_id", user.id);
        await supabase.from("weak_subjects").insert(weak.map((s) => ({ user_id: user.id, subject: s })));
      }
      nav({ to: "/app/today" });
    } catch (e) {
      toast.error((e as Error).message ?? "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    {
      title: "你现在在哪个阶段？",
      body: (
        <div className="grid grid-cols-2 gap-2">
          {GRADES.map((g) => (
            <button key={g} onClick={() => { setGrade(g); next(); }}
              className={`rounded-2xl border px-4 py-4 text-base transition ${grade === g ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"}`}>
              {g}
            </button>
          ))}
        </div>
      ),
      can: !!grade,
    },
    {
      title: "目前总分大概是？",
      body: <Input type="number" inputMode="numeric" placeholder="例如 520" value={current} onChange={(e) => setCurrent(e.target.value)} className="h-14 rounded-2xl text-lg" />,
      can: !!current,
    },
    {
      title: "想冲到多少分？",
      body: <Input type="number" inputMode="numeric" placeholder="例如 600" value={target} onChange={(e) => setTarget(e.target.value)} className="h-14 rounded-2xl text-lg" />,
      can: !!target,
    },
    {
      title: "距离考试还有多少天？",
      body: <Input type="number" inputMode="numeric" placeholder="例如 180" value={days} onChange={(e) => setDays(e.target.value)} className="h-14 rounded-2xl text-lg" />,
      can: !!days,
    },
    {
      title: "哪几科最让你头疼？",
      body: (
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => {
            const on = weak.includes(s);
            return (
              <button key={s} onClick={() => setWeak((w) => on ? w.filter((x) => x !== s) : [...w, s])}
                className={`rounded-full border px-4 py-2 text-sm transition ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>
                {s}
              </button>
            );
          })}
        </div>
      ),
      can: weak.length > 0,
    },
  ];

  const cur = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      <div className="mb-8 flex gap-1.5">
        {steps.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition ${i <= step ? "bg-primary" : "bg-border"}`} />
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
        <Button variant="ghost" onClick={back} disabled={step === 0}>上一步</Button>
        {last ? (
          <Button onClick={save} disabled={!cur.can || saving} className="h-12 rounded-xl px-6">
            {saving ? "保存中…" : "完成"}
          </Button>
        ) : (
          <Button onClick={next} disabled={!cur.can} className="h-12 rounded-xl px-6">下一步</Button>
        )}
      </div>
    </div>
  );
}
