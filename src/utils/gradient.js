import chalk from 'chalk'
import readline from 'node:readline'

// ──────────────────────────────────────────────────────────────────────────────
// Brand gradient: ciano → blu vivido → indaco
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {[number, number, number]} GradientStop
 * RGB tuple: [red 0-255, green 0-255, blue 0-255]
 */

/** @type {GradientStop[]} */
export const BRAND_GRADIENT = [
  [0, 212, 255], // #00D4FF — ciano elettrico
  [0, 100, 255], // #0064FF — blu vivido
  [100, 0, 220], // #6400DC — indaco profondo
]

// ──────────────────────────────────────────────────────────────────────────────
// Terminal capability flags
// ──────────────────────────────────────────────────────────────────────────────

/** @type {boolean} true se chalk ha colori E NO_COLOR non è impostato */
export const isColorEnabled = chalk.level > 0 && process.env.NO_COLOR === undefined

/** @type {boolean} true se isTTY E isColorEnabled */
export const isAnimationEnabled = process.stdout.isTTY === true && isColorEnabled

// ──────────────────────────────────────────────────────────────────────────────
// gradientText
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Colora ogni carattere del testo con un gradient RGB interpolato.
 * Se chalk.level === 0 o NO_COLOR impostato, ritorna `text` invariato.
 * Gli spazi non vengono colorati per evitare artefatti.
 *
 * @param {string}        text         - Testo da colorare
 * @param {GradientStop[]} stops       - Almeno 2 color stops RGB
 * @param {number}        [phase=0]    - Offset 0.0–1.0 per shift animato
 * @returns {string}                   - Stringa ANSI-colorata, o text invariato se no-color
 */
export function gradientText(text, stops, phase = 0) {
  if (!isColorEnabled) return text
  if (stops.length < 2) throw new Error('At least 2 gradient stops required')

  const chars = [...text]
  const len = chars.length
  if (len === 0) return ''

  const segments = stops.length - 1

  return chars
    .map((char, i) => {
      if (char === ' ') return char

      // Normalise t in [0, 1] with phase shift
      const t = (i / Math.max(len - 1, 1) + phase) % 1

      const seg = Math.min(Math.floor(t * segments), segments - 1)
      const localT = t * segments - seg

      const [r1, g1, b1] = stops[seg]
      const [r2, g2, b2] = stops[seg + 1]

      const r = Math.round(r1 + (r2 - r1) * localT)
      const g = Math.round(g1 + (g2 - g1) * localT)
      const b = Math.round(b1 + (b2 - b1) * localT)

      return chalk.rgb(r, g, b)(char)
    })
    .join('')
}

// ──────────────────────────────────────────────────────────────────────────────
// animateGradientBanner
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Anima un banner multi-riga con gradient in scrolling, poi si ferma.
 * Se !isTTY o no-color, stampa le righe statiche con gradient e ritorna subito.
 * Nasconde il cursore durante l'animazione e lo ripristina sempre.
 *
 * @param {string[]}      lines        - Righe del banner (output figlet)
 * @param {GradientStop[]} stops       - Color stops
 * @param {number}        [durationMs=1500] - Durata animazione in ms
 * @returns {Promise<void>}
 */
export async function animateGradientBanner(lines, stops, durationMs = 1500) {
  // Stampa sempre il banner statico prima (per terminali che non supportano animazione)
  const printStatic = (phase = 0) => {
    for (const line of lines) {
      process.stdout.write(gradientText(line, stops, phase) + '\n')
    }
  }

  if (!isAnimationEnabled) {
    printStatic()
    return
  }

  // Stampa il banner iniziale e prendi nota di quante righe occupa
  printStatic()
  process.stdout.write('\x1B[?25l') // nascondi cursore

  let phase = 0
  const intervalMs = 80
  const frames = Math.ceil(durationMs / intervalMs)
  let frameCount = 0

  await new Promise((resolve) => {
    const id = setInterval(() => {
      frameCount++
      phase = (phase + 0.03) % 1

      // Risali di `lines.length` righe e ridisegna
      readline.moveCursor(process.stdout, 0, -lines.length)
      for (const line of lines) {
        readline.clearLine(process.stdout, 0)
        process.stdout.write(gradientText(line, stops, phase) + '\n')
      }

      if (frameCount >= frames) {
        clearInterval(id)
        resolve(undefined)
      }
    }, intervalMs)
  })

  process.stdout.write('\x1B[?25h') // ripristina cursore
}
