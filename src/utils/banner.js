import figlet from 'figlet'
import chalk from 'chalk'
import { BRAND_GRADIENT, animateGradientBanner, isColorEnabled } from './gradient.js'

// Brand colors
export const ORANGE = '#FF6B2B'
export const BLUE = '#003087'

/**
 * Render figlet text as a Promise.
 * @param {string} text
 * @param {figlet.Options} opts
 * @returns {Promise<string>}
 */
function figletAsync(text, opts) {
  return new Promise((resolve, reject) =>
    figlet.text(text, opts, (err, result) => (err ? reject(err) : resolve(result ?? ''))),
  )
}

/**
 * Print the devvami welcome banner con gradient animato arancione→rosso→viola.
 * In ambienti non-TTY (CI, pipe, --json) stampa un banner statico senza ANSI.
 * @returns {Promise<void>}
 */
export async function printBanner() {
   const art = await figletAsync('DVMI', { font: 'ANSI Shadow' })
   const artLines = art.split('\n').filter((l) => l.trim() !== '')
   const width = Math.max(...artLines.map((l) => l.length)) + 4

   const tagline = isColorEnabled
     ? chalk.hex(ORANGE).bold('  Devvami Developer CLI')
     : '  Devvami Developer CLI'

  const separator = isColorEnabled
    ? chalk.hex(ORANGE).dim('─'.repeat(Math.min(width, 60)))
    : '─'.repeat(Math.min(width, 60))

  process.stdout.write('\n')

  // Anima ogni riga dell'ASCII art con gradient brand
  await animateGradientBanner(artLines, BRAND_GRADIENT)

  process.stdout.write(separator + '\n')
  process.stdout.write(tagline + '\n')
  process.stdout.write(separator + '\n')
  process.stdout.write('\n')
}
