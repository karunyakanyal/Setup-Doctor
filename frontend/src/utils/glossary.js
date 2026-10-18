import React, { useState, useEffect, useRef } from 'react'

export const GLOSSARY_TERMS = {
  cycle: {
    key: 'cycle',
    title: 'Circular Dependency',
    definition: 'Two or more modules that import each other, either directly or through an indirect chain. This creates tight coupling and can cause undefined runtime imports or bundle bloating.',
    example: 'src/a.js → src/b.js → src/a.js',
  },
  orphan: {
    key: 'orphan',
    title: 'Orphan File',
    definition: 'A file in your repository that is not imported by any other file and is not configured as an application entry point. It is often dead or leftover code from past refactors.',
    example: 'src/oldHelper.js (0 incoming and 0 outgoing imports)',
  },
  'entry point': {
    key: 'entry point',
    title: 'Entry Point',
    definition: 'The initial file where execution or bundling begins, such as main.js or index.html. Entry points naturally have zero importers inside the project itself.',
    example: 'src/main.tsx or index.html',
  },
  hotspot: {
    key: 'hotspot',
    title: 'Hotspot',
    definition: 'A critical file that either has many incoming importers or impacts a high percentage of downstream files. Modifying a hotspot carries high risk of regressions.',
    example: 'src/utils/apiClient.ts (imported across 35 files)',
  },
  'fan-in': {
    key: 'fan-in',
    title: 'Fan-In',
    definition: 'The number of distinct files in your codebase that directly import a specific module. A high fan-in marks a widely shared foundation utility or library.',
    example: 'fan-in: 18 (18 files directly import this file)',
  },
  'downstream impact': {
    key: 'downstream impact',
    title: 'Downstream Impact',
    definition: 'The count and percentage of all project files that depend on this module directly or transitively. A bug here can ripple into all downstream files.',
    example: '42 files (60% of repo) affected by changes here',
  },
  'unresolved import': {
    key: 'unresolved import',
    title: 'Unresolved Import',
    definition: 'An import path or package specifier that could not be mapped to any physical file or installed package on disk. This often causes build errors or runtime crashes.',
    example: 'import { auth } from "./util/auth" (file not found)',
  },
  'declared but unused': {
    key: 'declared but unused',
    title: 'Declared but Unused',
    definition: 'A dependency listed in package.json that was not found in any static import or require statement. It might only be used in configs or may be safe to remove.',
    example: '"lodash" in package.json dependencies, but never imported',
  },
  'used but undeclared': {
    key: 'used but undeclared',
    title: 'Used but Undeclared',
    definition: 'An external package imported in your source code that is not listed in dependencies in package.json. This can cause build or deployment failures in clean environments.',
    example: 'import axios from "axios" without axios in package.json',
  },
  'type-only': {
    key: 'type-only',
    title: 'Type-Only Import / Cycle',
    definition: 'An import or dependency cycle that only references TypeScript types, interfaces, or type annotations. These are erased during compilation and have zero runtime effect.',
    example: 'import type { User } from "./userTypes"',
  },
}

export function getGlossaryTerm(termKey) {
  if (!termKey) return null
  const normalized = String(termKey).trim().toLowerCase()
  return GLOSSARY_TERMS[normalized] || null
}

export function GlossaryButton({ termKey, id: customId }) {
  const term = getGlossaryTerm(termKey)
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef(null)
  const popoverRef = useRef(null)

  const popoverId = customId || `glossary-popover-${String(termKey).replace(/\s+/g, '-')}`

  useEffect(() => {
    if (!isOpen) return undefined

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }

    function handlePointerDown(e) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isOpen])

  if (!term) return null

  return React.createElement(
    'span',
    { className: 'glossary-btn-container' },
    React.createElement(
      'button',
      {
        type: 'button',
        ref: buttonRef,
        className: `glossary-help-btn ${isOpen ? 'active' : ''}`,
        onClick: () => setIsOpen((prev) => !prev),
        'aria-label': `Learn about ${term.title}`,
        'aria-expanded': isOpen,
        'aria-describedby': isOpen ? popoverId : undefined,
      },
      '?'
    ),
    isOpen &&
      React.createElement(
        'div',
        {
          id: popoverId,
          ref: popoverRef,
          role: 'tooltip',
          tabIndex: -1,
          className: 'glossary-popover',
        },
        React.createElement(
          'div',
          { className: 'glossary-popover-header' },
          React.createElement('strong', { className: 'glossary-popover-title' }, term.title),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'glossary-popover-close',
              'aria-label': 'Close explanation',
              onClick: () => {
                setIsOpen(false)
                buttonRef.current?.focus()
              },
            },
            '×'
          )
        ),
        React.createElement('p', { className: 'glossary-popover-def' }, term.definition),
        React.createElement(
          'div',
          { className: 'glossary-popover-example' },
          React.createElement('span', { className: 'glossary-example-tag' }, 'Example:'),
          React.createElement('code', { className: 'glossary-example-code font-mono' }, term.example)
        )
      )
  )
}

export default GlossaryButton
