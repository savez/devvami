/**
 * Pre-command hook: trigger non-blocking version check.
 */
export const init = async () => {
  // Fire-and-forget version check — result used by postrun hook
  import('../services/version-check.js')
    .then(({ checkForUpdate }) => checkForUpdate())
    .catch(() => null) // never block command execution
}
