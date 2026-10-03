import { normalizeBugRecord } from './bugVaultData.js'
import { normalizeCustomCategories } from './bugCategories.js'

export const BUG_VAULT_EXPORT_VERSION = 1

/**
 * Returns a JSON string containing the version, export timestamp, bugs, and categories.
 *
 * @param {Array} bugs
 * @param {Array} categories
 * @returns {string} JSON string
 */
export function exportBugVault(bugs = [], categories = []) {
  const payload = {
    version: BUG_VAULT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    bugs: Array.isArray(bugs) ? bugs : [],
    categories: Array.isArray(categories) ? categories : [],
  }

  return JSON.stringify(payload, null, 2)
}

/**
 * Validates the shape of imported JSON text, normalizes each valid bug,
 * drops invalid entries, and returns { bugs, categories, skipped }.
 * Never throws.
 *
 * @param {string} text
 * @returns {{ bugs: Array, categories: Array, skipped: number }}
 */
export function parseBugVaultImport(text) {
  try {
    if (typeof text !== 'string' || !text.trim()) {
      return { bugs: [], categories: [], skipped: 0 }
    }

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return { bugs: [], categories: [], skipped: 0 }
    }

    if (!parsed || typeof parsed !== 'object') {
      return { bugs: [], categories: [], skipped: 0 }
    }

    let rawBugs = null
    let rawCategories = []

    if (Array.isArray(parsed)) {
      rawBugs = parsed
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.bugs)) {
        rawBugs = parsed.bugs
      }
      if (Array.isArray(parsed.categories)) {
        rawCategories = parsed.categories
      }
    }

    if (!Array.isArray(rawBugs)) {
      return { bugs: [], categories: [], skipped: 0 }
    }

    const bugs = []
    let skipped = 0

    for (const item of rawBugs) {
      if (
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        item.id != null &&
        String(item.id).trim() !== ''
      ) {
        const normalized = normalizeBugRecord(item)
        if (normalized.problem || normalized.error) {
          bugs.push(normalized)
        } else {
          skipped += 1
        }
      } else {
        skipped += 1
      }
    }

    const categories = normalizeCustomCategories(rawCategories)

    return {
      bugs,
      categories,
      skipped,
    }
  } catch {
    return { bugs: [], categories: [], skipped: 0 }
  }
}

/**
 * Dedupes bugs by id and keeps the newer updatedAt (or createdAt fallback).
 *
 * @param {Array} existing
 * @param {Array} incoming
 * @returns {Array} Merged bugs
 */
export function mergeBugs(existing = [], incoming = []) {
  const safeExisting = Array.isArray(existing) ? existing : []
  const safeIncoming = Array.isArray(incoming) ? incoming : []
  const map = new Map()

  for (const bug of safeExisting) {
    if (bug && bug.id != null) {
      map.set(String(bug.id), bug)
    }
  }

  for (const bug of safeIncoming) {
    if (!bug || bug.id == null) continue
    const key = String(bug.id)
    const current = map.get(key)
    if (!current) {
      map.set(key, bug)
    } else {
      const currentTime = Date.parse(current.updatedAt || current.createdAt || 0) || 0
      const incomingTime = Date.parse(bug.updatedAt || bug.createdAt || 0) || 0
      if (incomingTime > currentTime) {
        map.set(key, bug)
      }
    }
  }

  return Array.from(map.values())
}
