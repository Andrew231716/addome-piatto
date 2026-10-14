"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Dumbbell, Sparkles, Target, Utensils } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ACTIVITY_OPTIONS,
  DEFAULT_SETUP,
  DIET_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  buildPlan,
  type CookTime,
  type Sex,
  type UserSetup,
} from "@/lib/plan";

type Props = {
  initialName?: string;
  initial?: UserSetup | null;
  onComplete: (setup: UserSetup) => void;
  onCancel?: () => void;
};

const STEPS = ["Dati", "Obiettivo", "Abitudini", "Piano"] as const;

export function SetupWizard({ initialName = "", initial, onComplete, onCancel }: Props) {
  const [step, setStep] = useState(0);
  const [setup, setSetup] = useState<UserSetup>({
    ...DEFAULT_SETUP,
    ...initial,
    name: initial?.name || initialName || "",
  });

  const preview = useMemo(() => buildPlan(setup), [setup]);

  const canNext =
    step === 0
      ? setup.name.trim().length >= 2 && setup.age >= 14 && setup.height >= 120 && setup.weight >= 35
      : step === 1
        ? setup.goalWeight >= 35 && setup.weeklyGoal >= 2
        : true;

  const patch = (partial: Partial<UserSetup>) => setSetup((current) => ({ ...current, ...partial }));

  return (
    <div className="auth-shell setup-shell">
      <div className="auth-card setup-card">
        <div className="auth-brand">
          <span className="brand-mark"><Dumbbell className="brand-gym-icon" size={22} /><Utensils className="brand-food-icon" size={17} /></span>
          <strong><b>GYM</b><i>&</i><b>FOOD</b></strong>
          <p>Configura allenamenti e alimentazione sul tuo obiettivo reale.</p>
        </div>

        <div className="setup-steps">
          {STEPS.map((label, index) => (
            <button
              key={label}
              type="button"
              className={index === step ? "active" : index < step ? "done" : ""}
              onClick={() => index < step && setStep(index)}
            >
              <span>{index < step ? <Check size={13} /> : index + 1}</span>
              {label}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className="form-stack">
            <h3 className="setup-title">I tuoi dati personali</h3>
            <label>Nome
              <Input value={setup.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Come ti chiami?" />
            </label>
            <div className="form-grid">
              <label>Età
                <Input type="number" value={setup.age} onChange={(e) => patch({ age: Number(e.target.value) })} />
              </label>
              <label>Sesso biologico
                <select className="setup-select" value={setup.sex} onChange={(e) => patch({ sex: e.target.value as Sex })}>
                  <option value="female">Donna</option>
                  <option value="male">Uomo</option>
                  <option value="other">Altro / preferisco non dirlo</option>
                </select>
              </label>
              <label>Altezza (cm)
                <Input type="number" value={setup.height} onChange={(e) => patch({ height: Number(e.target.value) })} />
              </label>
              <label>Peso attuale (kg)
                <Input type="number" step="0.1" value={setup.weight} onChange={(e) => patch({ weight: Number(e.target.value) })} />
              </label>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="form-stack">
            <h3 className="setup-title">Che obiettivo vuoi raggiungere?</h3>
            <div className="setup-choice-grid">
              {GOAL_OPTIONS.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  className={setup.goal === goal.id ? "choice active" : "choice"}
                  onClick={() => patch({ goal: goal.id })}
                >
                  <Target size={18} />
                  <strong>{goal.label}</strong>
                  <small>{goal.detail}</small>
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>Peso obiettivo (kg)
                <Input type="number" step="0.1" value={setup.goalWeight} onChange={(e) => patch({ goalWeight: Number(e.target.value) })} />
              </label>
              <label>Allenamenti a settimana
                <div className="stepper">
                  <button type="button" onClick={() => patch({ weeklyGoal: Math.max(2, setup.weeklyGoal - 1) })}>−</button>
                  <strong>{setup.weeklyGoal}</strong>
                  <button type="button" onClick={() => patch({ weeklyGoal: Math.min(6, setup.weeklyGoal + 1) })}>+</button>
                </div>
              </label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="form-stack">
            <h3 className="setup-title">Abitudini e preferenze</h3>
            <label>Livello di attività
              <select className="setup-select" value={setup.activity} onChange={(e) => patch({ activity: e.target.value as UserSetup["activity"] })}>
                {ACTIVITY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label>Esperienza in allenamento
              <select className="setup-select" value={setup.experience} onChange={(e) => patch({ experience: e.target.value as UserSetup["experience"] })}>
                {EXPERIENCE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label>Stile alimentare
              <select className="setup-select" value={setup.diet} onChange={(e) => patch({ diet: e.target.value as UserSetup["diet"] })}>
                {DIET_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label>Tempo per cucinare
              <div className="segment-control">
                {([
                  ["low", "Poco"],
                  ["medium", "Medio"],
                  ["high", "Ampio"],
                ] as [CookTime, string][]).map(([id, label]) => (
                  <button key={id} type="button" className={setup.cookTime === id ? "active" : ""} onClick={() => patch({ cookTime: id })}>{label}</button>
                ))}
              </div>
            </label>
            <label>Descrivi abitudini, limiti o preferenze
              <Textarea
                value={setup.habitsNotes}
                onChange={(e) => patch({ habitsNotes: e.target.value })}
                placeholder="Es. lavoro sedentario, poca voglia la sera, ginocchio sensibile, non mangio latticini…"
              />
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="form-stack">
            <h3 className="setup-title">Il tuo piano personalizzato</h3>
            <div className="setup-summary-card">
              <span className="card-kicker"><Sparkles size={14} /> GENERATO PER TE</span>
              <h4>{preview.workoutTitle}</h4>
              <p>{preview.workoutSummary}</p>
              <ul>
                <li><strong>Obiettivo</strong> {preview.goalLabel}</li>
                <li><strong>Calorie/giorno</strong> {preview.calorieTarget} kcal</li>
                <li><strong>Macro</strong> P {preview.macros.protein}g · C {preview.macros.carbs}g · G {preview.macros.fat}g</li>
                <li><strong>Dieta</strong> {preview.dietLabel}</li>
                <li><strong>Oggi</strong> {preview.todayActivity}</li>
                <li><strong>Pasti piano</strong> {preview.meals.length} pasti pronti nel diario</li>
              </ul>
              {setup.habitsNotes.trim() && <p className="setup-note">Note considerate: {setup.habitsNotes.trim()}</p>}
            </div>
          </div>
        )}

        <div className="setup-actions">
          {step > 0 ? (
            <button type="button" className="secondary-button" onClick={() => setStep(step - 1)}><ArrowLeft size={17} /> Indietro</button>
          ) : onCancel ? (
            <button type="button" className="secondary-button" onClick={onCancel}>Annulla</button>
          ) : <span />}
          {step < STEPS.length - 1 ? (
            <button type="button" className="primary-button" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Continua <ArrowRight size={17} />
            </button>
          ) : (
            <button type="button" className="primary-button" onClick={() => onComplete(setup)}>
              Attiva il mio piano <Check size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
