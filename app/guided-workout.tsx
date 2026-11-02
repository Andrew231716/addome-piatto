"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Move, Pause, Play, RotateCcw, Sparkles, TimerReset, Video, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { expandQueueWithRests, type Exercise } from "@/lib/plan";
import { playWorkoutSound } from "@/lib/workout-sounds";

function formatTimer(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}


async function requestWakeLock() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock) return null;
    return await nav.wakeLock.request("screen");
  } catch {
    return null;
  }
}

function youtubeEmbedSrc(videoId: string, { autoplay = true, loop = true } = {}) {
  const params = new URLSearchParams({
    rel: "0",
    playsinline: "1",
    modestbranding: "1",
    controls: "1",
    autoplay: autoplay ? "1" : "0",
    mute: "1",
  });
  if (loop) {
    params.set("loop", "1");
    params.set("playlist", videoId);
  }
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function GuidedWorkout({ open, onOpenChange, voiceEnabled, onComplete, queue }: { open: boolean; onOpenChange: (open: boolean) => void; voiceEnabled: boolean; onComplete: (feedback?: string) => void; queue: Exercise[] }) {
  const safeQueue = useMemo(
    () => expandQueueWithRests(queue),
    [queue],
  );
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState(safeQueue[0]?.seconds ?? 30);
  const [running, setRunning] = useState(false);
  const [videoInline, setVideoInline] = useState(true);
  const [pipOpen, setPipOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const [feedback, setFeedback] = useState("");
  const prevRunning = useRef(false);
  const exercise = safeQueue[index] ?? safeQueue[0];
  const nextExercise = safeQueue[index + 1];
  const workCount = safeQueue.filter((item) => !item.isRest).length;
  const workDone = safeQueue.slice(0, index + 1).filter((item) => !item.isRest).length;
  const totalMinutes = Math.max(1, Math.round(safeQueue.reduce((sum, item) => sum + item.seconds, 0) / 60));

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setSeconds(safeQueue[0]?.seconds ?? 30);
    setRunning(false);
    setFinished(false);
    setFeedback("");
    setVideoInline(true);
    setPipOpen(false);
    prevRunning.current = false;
  }, [open, safeQueue]);

  const speak = (message: string) => {
    if (!voiceEnabled || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "it-IT";
    utterance.rate = 0.98;
    window.speechSynthesis.speak(utterance);
  };

  const announce = (item: Exercise) => {
    if (item.isRest) {
      speak(`${item.name}. ${item.cue}`);
      return;
    }
    speak(`${item.stage}. ${item.name}. ${item.side ?? ""}. ${item.cue}`);
  };

  const soundForTransition = (from: Exercise | undefined, to: Exercise) => {
    if (to.isRest) {
      playWorkoutSound("rest");
      return;
    }
    if (from?.isRest) {
      playWorkoutSound(to.set && from.name.toLowerCase().includes("serie") ? "set" : "exercise");
      return;
    }
    if (from && from.name === to.name && from.set !== to.set) {
      playWorkoutSound("set");
      return;
    }
    playWorkoutSound("exercise");
  };

  const moveTo = (next: number, opts: { autoContinue?: boolean } = {}) => {
    if (next >= safeQueue.length) {
      setRunning(false);
      setFinished(true);
      playWorkoutSound("complete");
      speak("Allenamento completato. Ottimo lavoro.");
      return;
    }
    const safe = Math.max(0, next);
    const from = safeQueue[index];
    const to = safeQueue[safe];
    setIndex(safe);
    setSeconds(to.seconds);
    soundForTransition(from, to);
    announce(to);
    if (opts.autoContinue) setRunning(true);
  };

  useEffect(() => {
    if (!running || finished) return;
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          window.setTimeout(() => moveTo(index + 1, { autoContinue: true }), 220);
          return 0;
        }
        if (current === 4) {
          playWorkoutSound("countdown");
          speak("Tre, due, uno");
        } else if (current <= 3) {
          playWorkoutSound("countdown");
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, index, finished]);

  useEffect(() => {
    if (!open) {
      setRunning(false);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    }
  }, [open]);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    (async () => {
      if (!running || !open || finished) return;
      lock = await requestWakeLock();
      if (cancelled && lock) {
        try { await lock.release(); } catch { /* ignore */ }
      }
    })();
    return () => {
      cancelled = true;
      if (lock) void lock.release().catch(() => undefined);
    };
  }, [running, open, finished]);

  useEffect(() => {
    if (prevRunning.current && !running && open && !finished) {
      playWorkoutSound("pause");
    }
    prevRunning.current = running;
  }, [running, open, finished]);

  const resetAll = () => {
    setIndex(0);
    setSeconds(safeQueue[0]?.seconds ?? 30);
    setRunning(false);
    setFinished(false);
    setFeedback("");
  };

  const toggleRunning = () => {
    const next = !running;
    setRunning(next);
    if (next) {
      playWorkoutSound(exercise?.isRest ? "rest" : "exercise");
      announce(exercise);
    } else {
      playWorkoutSound("pause");
    }
  };

  if (!exercise) return null;

  const badge = exercise.isRest
    ? "PAUSA"
    : exercise.set
      ? `SERIE ${exercise.set}`
      : exercise.stage === "Riscaldamento"
        ? "PREPARAZIONE"
        : "RECUPERO";

  const ringColor = exercise.isRest ? "var(--green)" : "var(--orange)";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`workout-dialog${exercise.isRest ? " is-rest" : ""}`} showCloseButton={false}>
        {!finished ? (
          <>
            <div className="workout-dialog-head">
              <div>
                <span className={`stage-pill ${exercise.stage.toLowerCase()}${exercise.isRest ? " rest" : ""}`}>
                  {exercise.isRest ? "Pausa" : exercise.stage}
                </span>
                <small>{index + 1} di {safeQueue.length}</small>
              </div>
              <button onClick={() => onOpenChange(false)} aria-label="Chiudi allenamento"><X size={20} /></button>
            </div>
            <Progress value={((index + 1) / safeQueue.length) * 100} className="workout-progress" />
            <div className="workout-focus">
              <span className="exercise-count">{badge}</span>
              <h2>{exercise.name}</h2>
              {exercise.side && !exercise.isRest && <span className="side-label">Lato {exercise.side}</span>}
              <p>{exercise.focus}</p>
            </div>
            <div
              className={`timer-ring${exercise.isRest ? " rest" : ""}`}
              style={{ "--score": `${(seconds / Math.max(exercise.seconds, 1)) * 360}deg`, "--ring": ringColor } as React.CSSProperties}
            >
              <span>
                <strong aria-live="polite" aria-atomic="true">{formatTimer(seconds)}</strong>
                <small>{running ? (exercise.isRest ? "RECUPERO" : "IN CORSO") : "IN PAUSA"}</small>
              </span>
            </div>
            <div className={`cue-card${exercise.isRest ? " rest" : ""}`}>
              <Sparkles size={18} />
              <p>{exercise.cue}</p>
            </div>
            {nextExercise && (
              <p className="workout-next">
                Dopo: <strong>{nextExercise.name}</strong>
                {nextExercise.side ? ` · ${nextExercise.side}` : ""}
                {nextExercise.set ? ` · serie ${nextExercise.set}` : ""}
              </p>
            )}
            <div className="workout-controls">
              <button className="round-button secondary" onClick={() => moveTo(index - 1)} disabled={index === 0} aria-label="Esercizio precedente">
                <ArrowLeft size={21} />
              </button>
              <button
                className="round-button secondary"
                onClick={() => { setSeconds(exercise.seconds); setRunning(false); speak(`Ripartiamo da capo. ${exercise.name}`); }}
                title="Ricomincia esercizio"
                aria-label="Ricomincia"
              >
                <RotateCcw size={21} />
              </button>
              <button className="round-button main" onClick={toggleRunning} aria-label={running ? "Pausa" : "Avvia"}>
                {running ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}
              </button>
              <button
                className={`round-button secondary${videoInline ? " active-toggle" : ""}`}
                onClick={() => setVideoInline((value) => !value)}
                title={videoInline ? "Nascondi video" : "Mostra video"}
                aria-label="Video dimostrativo"
              >
                <Video size={21} />
              </button>
              <button
                className="round-button secondary"
                onClick={() => {
                  if (exercise.isRest) moveTo(index + 1, { autoContinue: running });
                  else moveTo(index + 1);
                }}
                aria-label={exercise.isRest ? "Salta pausa" : "Esercizio successivo"}
              >
                <ArrowRight size={21} />
              </button>
            </div>
            {videoInline && (
              <div className="workout-video-inline">
                <div className="workout-video-frame">
                  <iframe
                    key={`${exercise.id}-${exercise.videoId}`}
                    src={youtubeEmbedSrc(exercise.videoId, { autoplay: true, loop: true })}
                    title={`Video dimostrativo: ${exercise.name}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <div className="workout-video-meta">
                  <span>Video in loop · audio muto per la guida vocale</span>
                  <button type="button" onClick={() => setPipOpen(true)}>Apri flottante</button>
                </div>
              </div>
            )}
            <div className="workout-foot">
              <button onClick={() => { setSeconds(exercise.seconds); setRunning(true); }}>
                <TimerReset size={17} /> {exercise.isRest ? "Riparti la pausa" : "Fatto male? Riparti dall’inizio"}
              </button>
              <span>
                {workDone}/{workCount} esercizi
                {exercise.isRest ? " · pausa attiva" : ""}
              </span>
            </div>
            {pipOpen && <DraggableVideo exercise={exercise} onClose={() => setPipOpen(false)} />}
          </>
        ) : (
          <div className="workout-complete">
            <span className="complete-icon"><Check size={34} /></span>
            <span className="eyebrow">SESSIONE COMPLETATA</span>
            <h2>Ottimo lavoro.</h2>
            <p>Hai concluso riscaldamento, allenamento, pause e stretching. Stima: ~{Math.round(totalMinutes * 7.5)} kcal.</p>
            <div className="completion-stats">
              <div><strong>{totalMinutes}</strong><small>minuti</small></div>
              <div><strong>{workCount}</strong><small>esercizi</small></div>
              <div><strong>{safeQueue.length}</strong><small>timer</small></div>
            </div>
            <div className="feedback-box">
              <strong>Com’è stata l’intensità?</strong>
              <div>
                {["Troppo facile", "Giusta", "Troppo intensa"].map((option) => (
                  <button className={feedback === option ? "active" : ""} key={option} onClick={() => setFeedback(option)}>{option}</button>
                ))}
              </div>
              {feedback && (
                <p>
                  {feedback === "Troppo facile"
                    ? "La prossima volta aumenteremo una serie o i secondi di tenuta."
                    : feedback === "Troppo intensa"
                      ? "La prossima volta ridurremo le tenute e allungheremo i recuperi."
                      : "Manteniamo questo equilibrio e progrediamo gradualmente."}
                </p>
              )}
            </div>
            <button className="primary-button full" onClick={() => onComplete(feedback || undefined)}>Salva e chiudi</button>
            <button className="text-button center" onClick={resetAll}><RotateCcw size={16} /> Ripeti da capo</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DraggableVideo({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const [position, setPosition] = useState({ x: 24, y: 84 });
  const drag = useRef({ x: 0, y: 0, active: false });
  return (
    <div className="video-popup" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
      <div
        className="video-handle"
        onPointerDown={(event) => {
          drag.current = { x: event.clientX - position.x, y: event.clientY - position.y, active: true };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current.active) {
            setPosition({
              x: Math.max(-10, Math.min(window.innerWidth - 380, event.clientX - drag.current.x)),
              y: Math.max(10, Math.min(window.innerHeight - 300, event.clientY - drag.current.y)),
            });
          }
        }}
        onPointerUp={() => { drag.current.active = false; }}
      >
        <Move size={17} />
        <span>{exercise.name}{exercise.side ? ` · ${exercise.side}` : ""}</span>
        <button onClick={onClose} aria-label="Chiudi video"><X size={17} /></button>
      </div>
      <iframe
        key={`pip-${exercise.id}`}
        src={youtubeEmbedSrc(exercise.videoId, { autoplay: true, loop: true })}
        title={`Video dimostrativo: ${exercise.name}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

