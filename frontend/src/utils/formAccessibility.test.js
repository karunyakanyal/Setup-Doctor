import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let viteServer
let AnalyzeRepositoryModal
let BugForm

test.before(async () => {
  viteServer = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  })

  const modalMod = await viteServer.ssrLoadModule(
    './src/components/AnalyzeRepositoryModal.jsx',
  )
  AnalyzeRepositoryModal = modalMod.default

  const bugFormMod = await viteServer.ssrLoadModule(
    './src/components/BugForm.jsx',
  )
  BugForm = bugFormMod.default
})

test.after(async () => {
  if (viteServer) {
    await viteServer.close()
  }
})

function extractLabels(html) {
  const labelRegex = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi
  const labels = []
  let match
  while ((match = labelRegex.exec(html)) !== null) {
    const attrs = match[1]
    const content = match[2]
    const forMatch = attrs.match(/\bfor="([^"]+)"/)
    labels.push({
      htmlFor: forMatch ? forMatch[1] : null,
      content,
      text: content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    })
  }
  return labels
}

function extractFormControls(html) {
  const labels = extractLabels(html)
  const controlRegex = /<(input|select|textarea)\b([^>]*?)(\/?>)/gi
  const controls = []
  let match
  while ((match = controlRegex.exec(html)) !== null) {
    const tagName = match[1].toLowerCase()
    const attrs = match[2]
    const idMatch = attrs.match(/\bid="([^"]+)"/)
    const nameMatch = attrs.match(/\bname="([^"]+)"/)
    const ariaLabelMatch = attrs.match(/\baria-label="([^"]+)"/)
    const ariaLabelledByMatch = attrs.match(/\baria-labelledby="([^"]+)"/)
    const typeMatch = attrs.match(/\btype="([^"]+)"/)

    const id = idMatch ? idMatch[1] : null
    const name = nameMatch ? nameMatch[1] : null
    const ariaLabel = ariaLabelMatch ? ariaLabelMatch[1] : null

    let accessibleName = null
    if (ariaLabel && ariaLabel.trim()) {
      accessibleName = ariaLabel.trim()
    } else if (id) {
      const explicitLabel = labels.find((l) => l.htmlFor === id)
      if (explicitLabel && explicitLabel.text) {
        accessibleName = explicitLabel.text
      } else {
        const wrappingLabel = labels.find((l) => l.content.includes(`id="${id}"`))
        if (wrappingLabel && wrappingLabel.text) {
          accessibleName = wrappingLabel.text
        }
      }
    }

    controls.push({
      tagName,
      type: typeMatch ? typeMatch[1] : (tagName === 'input' ? 'text' : undefined),
      id,
      name,
      accessibleName,
      ariaLabel,
      ariaLabelledBy: ariaLabelledByMatch ? ariaLabelledByMatch[1] : null,
    })
  }
  return controls
}

test('AnalyzeRepositoryModal: all form controls have id, name, and accessible name', () => {
  const html = renderToStaticMarkup(
    React.createElement(AnalyzeRepositoryModal, {
      onClose: () => {},
      onSuccess: () => {},
    }),
  )

  const controls = extractFormControls(html)
  assert.ok(controls.length > 0, 'Expected at least one form control in AnalyzeRepositoryModal')

  for (const control of controls) {
    assert.ok(control.id, `Control <${control.tagName}> must have an id`)
    assert.ok(control.name, `Control <${control.tagName} id="${control.id}"> must have a name`)
    assert.ok(
      control.accessibleName,
      `Control <${control.tagName} id="${control.id}"> must have an accessible name`,
    )
  }

  const urlInput = controls.find((c) => c.id === 'repository-url')
  assert.ok(urlInput, 'repository-url input must exist')
  assert.equal(urlInput.name, 'repositoryUrl')
  assert.ok(urlInput.accessibleName.toLowerCase().includes('github repository url'))
})

test('BugForm: all 9 form controls have unique id, name, and accessible name', () => {
  const html = renderToStaticMarkup(
    React.createElement(BugForm, {
      newBug: {
        problem: '',
        error: '',
        suggestedFix: '',
        cause: '',
        whatITried: '',
        verifiedSolution: '',
        status: 'unresolved',
      },
      setNewBug: () => {},
      editingBugId: null,
      selectedCategory: '__create_custom_category__',
      setSelectedCategory: () => {},
      newCategoryName: '',
      setNewCategoryName: () => {},
      categoryMessage: '',
      setCategoryMessage: () => {},
      isCategoryMessageError: false,
      setIsCategoryMessageError: () => {},
      bugFormMessage: '',
      setBugFormMessage: () => {},
      customCategories: [],
      automaticCategory: 'Configuration',
      similarBugs: [],
      isDetailsOpen: true,
      setIsDetailsOpen: () => {},
      onSubmit: () => {},
      onCancel: () => {},
    }),
  )

  const controls = extractFormControls(html)
  assert.equal(controls.length, 9, 'Expected 9 form controls in fully expanded BugForm')

  const seenIds = new Set()
  const seenNames = new Set()

  for (const control of controls) {
    assert.ok(control.id, `Control <${control.tagName}> must have an id`)
    assert.ok(
      control.name,
      `Control <${control.tagName} id="${control.id}"> must have a name`,
    )
    assert.ok(
      control.accessibleName,
      `Control <${control.tagName} id="${control.id}"> must have an accessible name`,
    )

    assert.ok(!seenIds.has(control.id), `Duplicate control id: ${control.id}`)
    assert.ok(!seenNames.has(control.name), `Duplicate control name: ${control.name}`)
    seenIds.add(control.id)
    seenNames.add(control.name)
  }

  const expectedFields = [
    { id: 'bug-problem', name: 'problem' },
    { id: 'bug-error', name: 'error' },
    { id: 'bug-suggested-fix', name: 'suggestedFix' },
    { id: 'bug-cause', name: 'cause' },
    { id: 'bug-what-i-tried', name: 'whatITried' },
    { id: 'bug-verified-solution', name: 'verifiedSolution' },
    { id: 'bug-status', name: 'status' },
    { id: 'bug-category', name: 'category' },
    { id: 'new-custom-category', name: 'newCategoryName' },
  ]

  for (const expected of expectedFields) {
    const found = controls.find((c) => c.id === expected.id)
    assert.ok(found, `Expected field with id "${expected.id}" was not found`)
    assert.equal(found.name, expected.name)
  }
})

test('BugVaultView: import and search form controls have id, name, and accessible names', () => {
  const bugVaultViewPath = path.resolve(__dirname, '../views/BugVaultView.jsx')
  const content = fs.readFileSync(bugVaultViewPath, 'utf8')

  // Import file control
  assert.ok(
    content.includes('id="bug-vault-import-file"'),
    'Import input must have id="bug-vault-import-file"',
  )
  assert.ok(
    content.includes('name="importFile"'),
    'Import input must have name="importFile"',
  )
  assert.ok(
    content.includes('aria-label="Import Bug Vault JSON file"'),
    'Import input must have accessible aria-label',
  )
  assert.ok(
    content.includes('htmlFor="bug-vault-import-file"'),
    'Import label must have htmlFor="bug-vault-import-file"',
  )

  // Search control
  assert.ok(
    content.includes('id="bug-vault-search"'),
    'Search input must have id="bug-vault-search"',
  )
  assert.ok(
    content.includes('name="searchQuery"'),
    'Search input must have name="searchQuery"',
  )
  assert.ok(
    content.includes('aria-label="Search bugs"'),
    'Search input must have aria-label="Search bugs"',
  )
})
