import chalk from 'chalk'

/**
 * Post-command hook: display update notification if a newer version is available.
 */
export const postrun = async () => {
  try {
    const { checkForUpdate } = await import('../services/version-check.js')
    const { hasUpdate, current, latest } = await checkForUpdate()
     if (hasUpdate && latest) {
       process.stderr.write(
         chalk.dim(`\nUpdate available: ${current} → ${chalk.green(latest)}. Run \`dvmi upgrade\`\n`),
       )
     }
  } catch {
    // Never interrupt user flow
  }
}
