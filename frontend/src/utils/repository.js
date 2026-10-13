import { parseRepository, OWNER_REGEX, REPO_REGEX } from '../../../shared/repository.js'

export { parseRepository, OWNER_REGEX, REPO_REGEX }

export function validateRepositoryUrl(value) {
  try {
    parseRepository(value)
    return true
  } catch {
    return false
  }
}

export default parseRepository
