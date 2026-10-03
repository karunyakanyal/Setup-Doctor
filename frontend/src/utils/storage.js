export const STORAGE_VERSION = 1

export const BUG_VAULT_STORAGE_KEY = 'setupdoctor-bug-vault'
export const BUG_CATEGORIES_STORAGE_KEY = 'setupdoctor-bug-categories'
export const HISTORY_STORAGE_KEY = 'setupdoctor-history'
export const PROJECTS_STORAGE_KEY = 'setupdoctor-projects'

function getStorage(customStorage) {
  if (customStorage) return customStorage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage
  return null
}

/**
 * Safely loads and parses data from localStorage.
 * Automatically wraps JSON.parse and localStorage access in try/catch.
 * If data is unversioned, migrates to { version: 1, data }.
 * Returns fallback on corrupt, missing, or invalid data and never throws.
 *
 * @param {string} key
 * @param {*} fallback
 * @param {Function} [validate] - Optional validator predicate: (data) => boolean
 * @param {Storage} [customStorage] - Optional storage implementation for testing
 * @returns {*}
 */
export function safeLoad(key, fallback, validate, customStorage) {
  try {
    const storage = getStorage(customStorage)
    if (!storage || typeof storage.getItem !== 'function') {
      return fallback
    }

    const raw = storage.getItem(key)
    if (raw == null || raw === '') {
      return fallback
    }

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return fallback
    }

    if (parsed == null) {
      return fallback
    }

    let data
    let isUnversioned = false

    if (
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      'version' in parsed &&
      'data' in parsed
    ) {
      data = parsed.data
    } else {
      data = parsed
      isUnversioned = true
    }

    if (typeof validate === 'function') {
      try {
        if (!validate(data)) {
          return fallback
        }
      } catch {
        return fallback
      }
    }

    if (isUnversioned) {
      try {
        safeSave(key, data, customStorage)
      } catch {
        // Migration failure should not prevent returning valid loaded data.
      }
    }

    return data
  } catch {
    return fallback
  }
}

/**
 * Safely writes data wrapped in { version: 1, data } to localStorage.
 * Returns true on success, false on error, and never throws.
 *
 * @param {string} key
 * @param {*} value
 * @param {Storage} [customStorage]
 * @returns {boolean}
 */
export function safeSave(key, value, customStorage) {
  try {
    const storage = getStorage(customStorage)
    if (!storage || typeof storage.setItem !== 'function') {
      return false
    }

    const envelope = {
      version: STORAGE_VERSION,
      data: value,
    }

    storage.setItem(key, JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}
