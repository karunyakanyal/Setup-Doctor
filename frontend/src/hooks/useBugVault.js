import { createContext, useContext, useState, useCallback, createElement } from 'react'
import {
  addCustomCategory,
  loadCustomCategories,
  saveCustomCategories,
} from '../utils/bugCategories.js'
import { createBugRecord } from '../utils/bugVaultData.js'
import {
  exportBugVault,
  parseBugVaultImport,
  mergeBugs,
} from '../utils/bugVaultTransfer.js'
import { safeLoad, safeSave, BUG_VAULT_STORAGE_KEY } from '../utils/storage.js'

const BugVaultContext = createContext(null)

export function prepareAndPersistBug({
  bugs,
  bugDraft,
  editingBugId = null,
  repositoryName = null,
  storage = null,
}) {
  const savedAt = new Date().toISOString()
  const existingBug = editingBugId === null
    ? null
    : bugs.find((b) => b.id === editingBugId || String(b.id) === String(editingBugId))

  const bugFields = createBugRecord({
    ...bugDraft,
    problem: (bugDraft.problem || '').trim(),
    error: (bugDraft.error || '').trim(),
    cause: (bugDraft.cause || '').trim(),
    suggestedFix: (bugDraft.suggestedFix || '').trim(),
    whatITried: (bugDraft.whatITried || '').trim(),
    verifiedSolution: (bugDraft.verifiedSolution || '').trim(),
    category: bugDraft.category,
    repository: editingBugId === null
      ? repositoryName || null
      : existingBug?.repository ?? bugDraft.repository,
  }, {
    id: editingBugId === null ? Date.now() : existingBug?.id ?? editingBugId,
    createdAt: editingBugId === null
      ? savedAt
      : existingBug?.createdAt ?? bugDraft.createdAt ?? savedAt,
    updatedAt: editingBugId === null ? null : savedAt,
  })

  const updatedRecord = editingBugId === null
    ? bugFields
    : { ...existingBug, ...bugFields, updatedAt: savedAt }

  const nextBugs = editingBugId === null
    ? [bugFields, ...bugs]
    : bugs.map((b) => (b.id === editingBugId || String(b.id) === String(editingBugId) ? updatedRecord : b))

  const persisted = safeSave(BUG_VAULT_STORAGE_KEY, nextBugs, storage)

  if (!persisted) {
    return {
      persisted: false,
      result: {
        success: false,
        storageError: 'storage-failed',
        bug: updatedRecord,
        ...updatedRecord,
      },
      nextBugs: bugs,
    }
  }

  return {
    persisted: true,
    result: {
      success: true,
      bug: updatedRecord,
      ...updatedRecord,
    },
    nextBugs,
  }
}

export function BugVaultProvider({ children, initialBugs, initialCategories, storage }) {
  const [bugs, setBugs] = useState(() => {
    if (initialBugs !== undefined) {
      return initialBugs
    }
    return safeLoad(BUG_VAULT_STORAGE_KEY, [], Array.isArray, storage)
  })

  const [customCategories, setCustomCategories] = useState(() => {
    if (initialCategories !== undefined) {
      return initialCategories
    }
    return loadCustomCategories(storage)
  })

  const [transferMessage, setTransferMessage] = useState('')

  const saveBug = useCallback((bugDraft, editingBugId = null, repositoryName = null, customStorage = null) => {
    const { persisted, result, nextBugs } = prepareAndPersistBug({
      bugs,
      bugDraft,
      editingBugId,
      repositoryName,
      storage: customStorage || storage,
    })

    if (persisted) {
      setBugs(nextBugs)
    }

    return result
  }, [bugs, storage])

  const deleteBug = useCallback((id) => {
    setBugs((currentBugs) => {
      const nextBugs = currentBugs.filter((b) => b.id !== id)
      if (nextBugs.length !== currentBugs.length) {
        safeSave(BUG_VAULT_STORAGE_KEY, nextBugs)
      }
      return nextBugs
    })
  }, [])

  const createCategory = useCallback((newCategoryName) => {
    const result = addCustomCategory(customCategories, newCategoryName)
    if (result.status === 'created') {
      if (saveCustomCategories(result.categories)) {
        setCustomCategories(result.categories)
      }
    }
    return result
  }, [customCategories])

  const exportVault = useCallback(() => {
    const jsonString = exportBugVault(bugs, customCategories)
    const dateStr = new Date().toISOString().slice(0, 10)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `setupdoctor-bug-vault-${dateStr}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, [bugs, customCategories])

  const importVault = useCallback((text) => {
    try {
      const { bugs: incomingBugs, categories: incomingCategories, skipped } = parseBugVaultImport(text)

      setBugs((currentBugs) => {
        const nextBugs = mergeBugs(currentBugs, incomingBugs)
        safeSave(BUG_VAULT_STORAGE_KEY, nextBugs)
        return nextBugs
      })

      if (incomingCategories.length > 0) {
        setCustomCategories((currentCategories) => {
          const nextCategories = [...new Set([...currentCategories, ...incomingCategories])]
          saveCustomCategories(nextCategories)
          return nextCategories
        })
      }

      const importedCount = incomingBugs.length
      setTransferMessage(`Imported ${importedCount}, skipped ${skipped}`)
      return { success: true, imported: importedCount, skipped }
    } catch {
      setTransferMessage('Import failed. Invalid file format.')
      return { success: false, error: 'Invalid file format' }
    }
  }, [])

  const value = {
    bugs,
    setBugs,
    customCategories,
    setCustomCategories,
    transferMessage,
    setTransferMessage,
    saveBug,
    deleteBug,
    createCategory,
    exportVault,
    importVault,
  }

  return createElement(BugVaultContext.Provider, { value }, children)
}

export function useBugVault(customStorage) {
  const context = useContext(BugVaultContext)
  if (context) {
    return context
  }

  // Fallback for standalone usage
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [bugs, setBugs] = useState(() =>
    safeLoad(BUG_VAULT_STORAGE_KEY, [], Array.isArray, customStorage),
  )
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [customCategories, setCustomCategories] = useState(() =>
    loadCustomCategories(customStorage),
  )
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [transferMessage, setTransferMessage] = useState('')

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const saveBug = useCallback((bugDraft, editingBugId = null, repositoryName = null, overrideStorage = null) => {
    const { persisted, result, nextBugs } = prepareAndPersistBug({
      bugs,
      bugDraft,
      editingBugId,
      repositoryName,
      storage: overrideStorage || customStorage,
    })

    if (persisted) {
      setBugs(nextBugs)
    }

    return result
  }, [bugs, customStorage])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const deleteBug = useCallback((id) => {
    setBugs((currentBugs) => {
      const nextBugs = currentBugs.filter((b) => b.id !== id)
      if (nextBugs.length !== currentBugs.length) {
        safeSave(BUG_VAULT_STORAGE_KEY, nextBugs)
      }
      return nextBugs
    })
  }, [])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const createCategory = useCallback((newCategoryName) => {
    const result = addCustomCategory(customCategories, newCategoryName)
    if (result.status === 'created') {
      if (saveCustomCategories(result.categories)) {
        setCustomCategories(result.categories)
      }
    }
    return result
  }, [customCategories])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const exportVault = useCallback(() => {
    const jsonString = exportBugVault(bugs, customCategories)
    const dateStr = new Date().toISOString().slice(0, 10)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `setupdoctor-bug-vault-${dateStr}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, [bugs, customCategories])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const importVault = useCallback((text) => {
    try {
      const { bugs: incomingBugs, categories: incomingCategories, skipped } = parseBugVaultImport(text)

      setBugs((currentBugs) => {
        const nextBugs = mergeBugs(currentBugs, incomingBugs)
        safeSave(BUG_VAULT_STORAGE_KEY, nextBugs)
        return nextBugs
      })

      if (incomingCategories.length > 0) {
        setCustomCategories((currentCategories) => {
          const nextCategories = [...new Set([...currentCategories, ...incomingCategories])]
          saveCustomCategories(nextCategories)
          return nextCategories
        })
      }

      const importedCount = incomingBugs.length
      setTransferMessage(`Imported ${importedCount}, skipped ${skipped}`)
      return { success: true, imported: importedCount, skipped }
    } catch {
      setTransferMessage('Import failed. Invalid file format.')
      return { success: false, error: 'Invalid file format' }
    }
  }, [])

  return {
    bugs,
    setBugs,
    customCategories,
    setCustomCategories,
    transferMessage,
    setTransferMessage,
    saveBug,
    deleteBug,
    createCategory,
    exportVault,
    importVault,
  }
}
