/** Lightweight Web Audio cues for guided workouts (no audio files needed). */

let sharedCtx: AudioContext | null = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx) sharedCtx = new AC();
  if (sharedCtx.state === "suspended") void sharedCtx.resume();
  return sharedCtx;
}

function tone(ctx: AudioContext, freq: number, start: number, duration: number, gain = 0.08, type: OscillatorType = "sine") {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export type WorkoutSoundKind = "exercise" | "set" | "rest" | "countdown" | "complete" | "pause";

export function playWorkoutSound(kind: WorkoutSoundKind) {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;

  if (kind === "exercise") {
    tone(ctx, 660, t, 0.12, 0.09, "triangle");
    tone(ctx, 880, t + 0.12, 0.16, 0.08, "triangle");
  } else if (kind === "set") {
    tone(ctx, 520, t, 0.1, 0.08, "sine");
    tone(ctx, 520, t + 0.14, 0.1, 0.07, "sine");
    tone(ctx, 780, t + 0.28, 0.14, 0.08, "sine");
  } else if (kind === "rest") {
    tone(ctx, 392, t, 0.18, 0.07, "sine");
    tone(ctx, 294, t + 0.16, 0.22, 0.06, "sine");
  } else if (kind === "pause") {
    tone(ctx, 440, t, 0.1, 0.05, "sine");
  } else if (kind === "countdown") {
    tone(ctx, 740, t, 0.07, 0.07, "square");
  } else if (kind === "complete") {
    tone(ctx, 523, t, 0.12, 0.08, "triangle");
    tone(ctx, 659, t + 0.12, 0.12, 0.08, "triangle");
    tone(ctx, 784, t + 0.24, 0.22, 0.09, "triangle");
  }
}
