import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let viteServer
let DiagnosticsErrorState

test.before(async () => {
  viteServer = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  })

  const errMod = await viteServer.ssrLoadModule(
    './src/components/diagnostics/DiagnosticsErrorState.jsx',
  )
  DiagnosticsErrorState = errMod.default
})

test.after(async () => {
  if (viteServer) {
    await viteServer.close()
  }
})

test('DiagnosticsErrorState: renders NO_PACKAGE_JSON message correctly', () => {
  const html = renderToStaticMarkup(
    React.createElement(DiagnosticsErrorState, {
      error: {
        code: 'NO_PACKAGE_JSON',
        message: 'package.json not found',
      },
    }),
  )

  assert.ok(
    html.includes(
      'No package.json found. SetupDoctor currently analyzes JavaScript and TypeScript projects.',
    ),
  )
})

test('DiagnosticsErrorState: renders 429 rate limit message correctly', () => {
  const htmlWithMsg = renderToStaticMarkup(
    React.createElement(DiagnosticsErrorState, {
      error: {
        status: 429,
        message: 'GitHub API rate limit exceeded. Set GITHUB_TOKEN.',
      },
    }),
  )

  assert.ok(
    htmlWithMsg.includes('GitHub API rate limit exceeded. Set GITHUB_TOKEN.'),
  )

  const htmlWithoutMsg = renderToStaticMarkup(
    React.createElement(DiagnosticsErrorState, {
      error: {
        status: 429,
      },
    }),
  )

  assert.ok(
    htmlWithoutMsg.includes('GitHub API rate limit exceeded. Set GITHUB_TOKEN.'),
  )
})

test('DiagnosticsErrorState: renders generic message for other errors', () => {
  const html500 = renderToStaticMarkup(
    React.createElement(DiagnosticsErrorState, {
      error: {
        status: 500,
        message: 'Internal server error',
      },
    }),
  )

  assert.ok(
    html500.includes(
      'We encountered a problem fetching the manifest or tree for this repository.',
    ),
  )

  const htmlDefault = renderToStaticMarkup(
    React.createElement(DiagnosticsErrorState, {}),
  )

  assert.ok(
    htmlDefault.includes(
      'We encountered a problem fetching the manifest or tree for this repository.',
    ),
  )
})

test('DiagnosticsErrorState: renders custom message prop override when provided', () => {
  const html = renderToStaticMarkup(
    React.createElement(DiagnosticsErrorState, {
      message: 'Explicit custom message',
    }),
  )

  assert.ok(html.includes('Explicit custom message'))
})

test('NO_PACKAGE_JSON path through the UI error state: renders distinct message when NO_PACKAGE_JSON code is provided', () => {
  // Simulates non-200 response payload parsed by DashboardView
  const responseData = {
    success: false,
    code: 'NO_PACKAGE_JSON',
    message: 'package.json not found',
  }

  // DashboardView sets diagnosticsError to { status: 404, code: data.code, message: ... }
  // and renders DiagnosticsErrorState with error and message
  const errorObj = {
    status: 404,
    code: responseData.code,
    message: 'No package.json found. SetupDoctor currently analyzes JavaScript and TypeScript projects.',
  }

  const html = renderToStaticMarkup(
    React.createElement(DiagnosticsErrorState, {
      error: errorObj,
      message: errorObj.message,
    }),
  )

  assert.ok(
    html.includes(
      'No package.json found. SetupDoctor currently analyzes JavaScript and TypeScript projects.',
    ),
  )
  assert.ok(!html.includes('We encountered a problem fetching the manifest'))
})
