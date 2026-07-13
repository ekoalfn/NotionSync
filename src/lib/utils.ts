import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Decimal hours → "X Jam Y Menit" (Indonesian). 0 → "—".
export function fmtJam(hours: number): string {
  if (!hours || hours <= 0) return "—";
  let h = Math.floor(hours);
  let m = Math.round((hours - h) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  if (h === 0) return `${m} Menit`;
  if (m === 0) return `${h} Jam`;
  return `${h} Jam ${m} Menit`;
}
