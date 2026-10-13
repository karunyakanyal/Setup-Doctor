export const OWNER_REGEX = /^[A-Za-z0-9-]+$/
export const REPO_REGEX = /^[A-Za-z0-9._-]+$/

export function parseRepository(input) {
  if (typeof input !== 'string') {
    throw new Error('Enter owner/repo')
  }

  let clean = input.trim()
  if (!clean) {
    throw new Error('Enter owner/repo')
  }

  // Strip query and hash
  clean = clean.split(/[?#]/)[0].trim()
  if (!clean) {
    throw new Error('Enter owner/repo')
  }

  // Handle git@ prefix (e.g. git@github.com:owner/repo.git)
  if (clean.startsWith('git@')) {
    clean = clean.slice(4).replace(':', '/')
  }

  // Strip protocol-relative leading slashes
  clean = clean.replace(/^\/\//, '')

  // Strip scheme if present (e.g. https://, http://)
  let host = ''
  const schemeMatch = clean.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.*)$/)
  if (schemeMatch) {
    clean = schemeMatch[2]
    const slashIdx = clean.indexOf('/')
    if (slashIdx !== -1) {
      host = clean.slice(0, slashIdx)
      clean = clean.slice(slashIdx + 1)
    } else {
      host = clean
      clean = ''
    }
  } else {
    // No scheme. Check if first segment is a host (e.g. github.com/owner/repo or gitlab.com/o/r)
    const slashIdx = clean.indexOf('/')
    const firstSegment = slashIdx !== -1 ? clean.slice(0, slashIdx) : clean
    if (firstSegment.includes('.') || firstSegment.toLowerCase().startsWith('www.')) {
      host = firstSegment
      clean = slashIdx !== -1 ? clean.slice(slashIdx + 1) : ''
    }
  }

  if (host) {
    let normalizedHost = host.split(':')[0].toLowerCase()
    if (normalizedHost.startsWith('www.')) {
      normalizedHost = normalizedHost.slice(4)
    }
    if (normalizedHost !== 'github.com') {
      throw new Error('Only github.com repositories are supported')
    }
  }

  const segments = clean.split('/').filter(Boolean)
  if (segments.length < 2) {
    throw new Error('Enter owner/repo')
  }

  const owner = segments[0]
  let repo = segments[1]

  if (repo.toLowerCase().endsWith('.git')) {
    repo = repo.slice(0, -4)
  }

  if (!repo) {
    throw new Error('Enter owner/repo')
  }

  if (!OWNER_REGEX.test(owner) || !REPO_REGEX.test(repo)) {
    throw new Error('Invalid repository owner or name')
  }

  return { owner, repo }
}

export default parseRepository
