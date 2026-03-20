import readline from 'node:readline'
import { isAnimationEnabled, BRAND_GRADIENT, gradientText } from './gradient.js'

/**
 * Stampa testo con effetto typewriter (lettera per lettera).
 * Se !isTTY o no-color, stampa tutto in una volta.
 *
 * @param {string}  text               - Testo da stampare
 * @param {Object}  [opts]
 * @param {number}  [opts.interval=30] - Ms per carattere
 * @param {import('./gradient.js').GradientStop[]} [opts.gradient] - Se fornito, applica gradient
 * @returns {Promise<void>}
 */
export async function typewriter(text, opts = {}) {
  const { interval = 30, gradient } = opts

  if (!isAnimationEnabled) {
    const out = gradient ? gradientText(text, gradient) : text
    process.stdout.write(out + '\n')
    return
  }

  const chars = [...text]

  for (let i = 0; i <= chars.length; i++) {
    const partial = chars.slice(0, i).join('')
    const colored = gradient ? gradientText(partial, gradient) : partial

    readline.cursorTo(process.stdout, 0)
    readline.clearLine(process.stdout, 0)
    process.stdout.write(colored)

    await new Promise((r) => setTimeout(r, interval))
  }

  process.stdout.write('\n')
}

/**
 * Wrapper sintetico per typewriter con BRAND_GRADIENT di default.
 *
 * @param {string}  text               - Messaggio di completamento
 * @param {import('./gradient.js').GradientStop[]} [gradient=BRAND_GRADIENT]
 * @returns {Promise<void>}
 */
export async function typewriterLine(text, gradient = BRAND_GRADIENT) {
  return typewriter(text, { gradient, interval: 25 })
}
