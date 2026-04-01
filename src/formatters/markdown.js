import {marked} from 'marked'
import chalk from 'chalk'
import {deflate} from 'pako'

// Custom terminal renderer — outputs ANSI-formatted text using chalk.
// marked-terminal@7 is incompatible with all currently released versions of marked
// due to an internal API break (this.o.text undefined).
// This inline renderer has no external dependencies beyond chalk (already in deps).
const terminalRenderer = {
  heading(text, level) {
    const stripped = text.replace(/<[^>]*>/g, '')
    if (level === 1) return '\n' + chalk.bold.white(stripped) + '\n\n'
    if (level === 2) return '\n' + chalk.bold(stripped) + '\n\n'
    return '\n' + chalk.bold.dim(stripped) + '\n\n'
  },
  paragraph(text) {
    return text + '\n\n'
  },
  strong(text) {
    return chalk.bold(text)
  },
  em(text) {
    return chalk.italic(text)
  },
  codespan(code) {
    return chalk.bgGray.white(` ${code} `)
  },
  code(code, _lang) {
    const lines = code.split('\n').map((l) => '  ' + chalk.gray(l))
    return '\n' + lines.join('\n') + '\n\n'
  },
  blockquote(quote) {
    return (
      quote
        .split('\n')
        .map((l) => chalk.dim('│ ') + chalk.italic(l))
        .join('\n') + '\n'
    )
  },
  link(href, _title, text) {
    return `${text} ${chalk.dim(`(${href})`)}`
  },
  image(href, _title, text) {
    return `[image: ${text}] ${chalk.dim(`(${href})`)}`
  },
  list(body, _ordered) {
    return body + '\n'
  },
  listitem(text) {
    return '  • ' + text + '\n'
  },
  hr() {
    return chalk.dim('─'.repeat(60)) + '\n\n'
  },
  br() {
    return '\n'
  },
  del(text) {
    return chalk.strikethrough(text)
  },
  text(text) {
    return text
  },
  html(html) {
    return html.replace(/<[^>]*>/g, '')
  },
}

marked.use({renderer: terminalRenderer})

/**
 * Render a markdown string as ANSI-formatted terminal output.
 * @param {string} content - Raw markdown string
 * @returns {string} ANSI-formatted string ready for terminal output
 */
export function renderMarkdown(content) {
  return marked(content)
}

/**
 * Extract all Mermaid diagram code blocks from a markdown string.
 * @param {string} content - Raw markdown string
 * @returns {string[]} Array of mermaid diagram source strings (without fences)
 */
export function extractMermaidBlocks(content) {
  const regex = /```mermaid\n([\s\S]*?)```/g
  const blocks = []
  let match
  while ((match = regex.exec(content)) !== null) {
    blocks.push(match[1].trim())
  }
  return blocks
}

/**
 * Encode a Mermaid diagram as a mermaid.live URL (pako-compressed).
 * @param {string} diagramCode - Mermaid diagram source code
 * @returns {string} Full mermaid.live view URL
 */
export function toMermaidLiveUrl(diagramCode) {
  const state = JSON.stringify({
    code: diagramCode,
    mermaid: JSON.stringify({theme: 'default'}),
    updateDiagram: true,
    grid: true,
    panZoom: true,
    rough: false,
  })
  const data = new TextEncoder().encode(state)
  const compressed = deflate(data, {level: 9})
  const encoded = Buffer.from(compressed).toString('base64url')
  return `https://mermaid.live/view#pako:${encoded}`
}
