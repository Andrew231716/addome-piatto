import type { Exercise } from "./plan";
import { expandQueueWithRests } from "./plan";

export type IntensityFeedback = "Troppo facile" | "Giusta" | "Troppo intensa";
export type DifficultyPreset = "Più facile" | "Bilanciato" | "Più intenso";

function scaleSeconds(seconds: number, factor: number, min = 12, max = 90) {
  return Math.max(min, Math.min(max, Math.round(seconds * factor)));
}

/** Adjust hold times / strip some rests based on free local feedback rules. */
export function adaptQueueByFeedback(queue: Exercise[], feedback: IntensityFeedback): Exercise[] {
  if (feedback === "Giusta") return queue;
  const factor = feedback === "Troppo facile" ? 1.18 : 0.82;
  const next = queue
    .filter((item) => !(feedback === "Troppo intensa" && item.isRest && item.seconds < 18))
    .map((item) => {
      if (item.isRest) {
        return {
          ...item,
          seconds: scaleSeconds(item.seconds, feedback === "Troppo facile" ? 0.85 : 1.25, 10, 60),
        };
      }
      return { ...item, seconds: scaleSeconds(item.seconds, factor) };
    });
  return expandQueueWithRests(next);
}

export function adaptQueueByDifficulty(queue: Exercise[], difficulty: DifficultyPreset): Exercise[] {
  if (difficulty === "Bilanciato") return expandQueueWithRests(queue);
  const feedback: IntensityFeedback = difficulty === "Più facile" ? "Troppo intensa" : "Troppo facile";
  return adaptQueueByFeedback(queue, feedback);
}

/** Replace Side Plank with Bird Dog (coach backache rule). */
export function swapSidePlankForBirdDog(queue: Exercise[]): Exercise[] {
  return expandQueueWithRests(
    queue.map((item) =>
      !item.isRest && item.name.toLowerCase().includes("side plank")
        ? {
            ...item,
            id: `${item.id}-birddog`,
            name: "Bird Dog",
            focus: "Core e schiena",
            seconds: Math.min(item.seconds, 30),
            cue: "Allunga gli arti opposti senza ruotare il bacino.",
            videoId: "ZdAHe9_HeEw",
            side: undefined,
          }
        : item,
    ),
  );
}

export function shortenHolds(queue: Exercise[], seconds = 20): Exercise[] {
  return expandQueueWithRests(
    queue.map((item) =>
      item.isRest || item.stage !== "Allenamento"
        ? item
        : { ...item, seconds: Math.min(item.seconds, seconds) },
    ),
  );
}
