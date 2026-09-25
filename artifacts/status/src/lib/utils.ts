import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Rebase only fields edited after a save began onto the canonical server response. */
export function rebaseDraftChanges(saved: any, submitted: any, current: any): any {
  if (JSON.stringify(current) === JSON.stringify(submitted)) return saved
  if (!current || typeof current !== "object" || Array.isArray(current)
      || !submitted || typeof submitted !== "object" || Array.isArray(submitted)) return current
  const merged = { ...saved }
  for (const key of new Set([...Object.keys(submitted), ...Object.keys(current)])) {
    if (!(key in current)) {
      delete merged[key]
    } else {
      merged[key] = rebaseDraftChanges(saved?.[key], submitted[key], current[key])
    }
  }
  return merged
}
