export const SYSTEM_CATEGORIES = [
  'Environment',
  'Dependencies',
  'Configuration',
  'Build',
  'Runtime',
  'Git',
  'Frontend',
  'Backend',
  'Other',
]

export const BUG_CATEGORIES_STORAGE_KEY = 'setupdoctor-bug-categories'

export function normalizeCategoryName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function normalizedExistingCategories(categories) {
  if (!Array.isArray(categories)) {
    return []
  }

  const normalized = []

  for (const value of categories) {
    const category = normalizeCategoryName(value)
    const key = category.toLowerCase()
    const isSystemCategory = SYSTEM_CATEGORIES.some(
      (systemCategory) => systemCategory.toLowerCase() === key,
    )

    if (
      category &&
      !isSystemCategory &&
      !normalized.some((existing) => existing.toLowerCase() === key)
    ) {
      normalized.push(category)
    }
  }

  return normalized
}

export function normalizeCustomCategories(categories) {
  return normalizedExistingCategories(categories)
}

export function addCustomCategory(categories, value) {
  const currentCategories = normalizedExistingCategories(categories)
  const category = normalizeCategoryName(value)

  if (!category) {
    return { categories: currentCategories, category: '', status: 'empty' }
  }

  const systemCategory = SYSTEM_CATEGORIES.find(
    (existing) => existing.toLowerCase() === category.toLowerCase(),
  )

  if (systemCategory) {
    return {
      categories: currentCategories,
      category: systemCategory,
      status: 'system-category',
    }
  }

  const existingCategory = currentCategories.find(
    (existing) => existing.toLowerCase() === category.toLowerCase(),
  )

  if (existingCategory) {
    return {
      categories: currentCategories,
      category: existingCategory,
      status: 'exists',
    }
  }

  return {
    categories: [...currentCategories, category],
    category,
    status: 'created',
  }
}

export function loadCustomCategories(storage = globalThis.localStorage) {
  try {
    const storedCategories = storage.getItem(BUG_CATEGORIES_STORAGE_KEY)
    return normalizeCustomCategories(
      storedCategories ? JSON.parse(storedCategories) : [],
    )
  } catch {
    return []
  }
}

export function saveCustomCategories(
  categories,
  storage = globalThis.localStorage,
) {
  try {
    storage.setItem(
      BUG_CATEGORIES_STORAGE_KEY,
      JSON.stringify(normalizeCustomCategories(categories)),
    )
    return true
  } catch {
    return false
  }
}