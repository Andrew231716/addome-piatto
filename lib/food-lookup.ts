/** Free food lookups: Open Food Facts + optional BarcodeDetector (no API keys). */

export type FoodEstimate = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: "openfoodfacts" | "heuristic" | "manual";
  detail?: string;
};

function num(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Open Food Facts product lookup (free, no key). */
export async function lookupBarcodeOpenFoodFacts(barcode: string): Promise<FoodEstimate | null> {
  const code = barcode.replace(/\D/g, "");
  if (code.length < 8) return null;
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    status?: number;
    product?: {
      product_name?: string;
      product_name_it?: string;
      brands?: string;
      nutriments?: Record<string, number | string | undefined>;
      serving_size?: string;
    };
  };
  if (data.status !== 1 || !data.product) return null;
  const n = data.product.nutriments ?? {};
  const name =
    data.product.product_name_it ||
    data.product.product_name ||
    data.product.brands ||
    `Prodotto ${code}`;
  const calories = Math.round(num(n["energy-kcal_100g"] ?? n.energy_kcal_100g));
  const protein = num(n.proteins_100g);
  const carbs = num(n.carbohydrates_100g);
  const fat = num(n.fat_100g);
  if (calories <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) return null;
  return {
    name: name.slice(0, 80),
    calories: Math.max(0, calories),
    protein: Math.max(0, protein),
    carbs: Math.max(0, carbs),
    fat: Math.max(0, fat),
    source: "openfoodfacts",
    detail: "Valori per 100 g / 100 ml da Open Food Facts: verifica l’etichetta e scegli la quantità.",
  };
}

/** Try BarcodeDetector (Chromium); returns digits or null. */
export async function detectBarcodeFromImage(file: File): Promise<string | null> {
  const Detector = (window as unknown as {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => {
      detect: (source: ImageBitmap | HTMLCanvasElement | HTMLImageElement) => Promise<Array<{ rawValue?: string }>>;
    };
  }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const detector = new Detector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"],
    });
    const bitmap = await createImageBitmap(file);
    const codes = await detector.detect(bitmap);
    bitmap.close?.();
    const value = codes.find((item) => item.rawValue)?.rawValue;
    return value ? value.replace(/\s+/g, "") : null;
  } catch {
    return null;
  }
}
