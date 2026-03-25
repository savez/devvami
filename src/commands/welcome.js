import { Command } from '@oclif/core'
import { printWelcomeScreen } from '../utils/welcome.js'

/**
 * Display the dvmi cyberpunk mission dashboard.
 * Renders the animated DVMI logo followed by a full-color
 * overview of CLI capabilities, focus areas, and quick-start commands.
 */
export default class Welcome extends Command {
  static description = 'Show the dvmi mission dashboard with animated intro'

  static examples = ['<%= config.bin %> welcome']

  async run() {
    await printWelcomeScreen(this.config.version)
  }
}
