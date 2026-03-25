import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import ora from 'ora'
import { confirm, input, select } from '@inquirer/prompts'
import { printWelcomeScreen } from '../utils/welcome.js'
import { typewriterLine } from '../utils/typewriter.js'
import { detectPlatform } from '../services/platform.js'
import { exec, which } from '../services/shell.js'
import { configExists, loadConfig, saveConfig, CONFIG_PATH } from '../services/config.js'
import { oauthFlow, storeToken, validateToken, getTeams } from '../services/clickup.js'

import { SUPPORTED_TOOLS } from '../services/prompts.js'

export default class Init extends Command {
  static description = 'Setup completo ambiente di sviluppo locale'

  static examples = [
    '<%= config.bin %> init',
    '<%= config.bin %> init --dry-run',
    '<%= config.bin %> init --verbose',
  ]

  static enableJsonFlag = true

  static flags = {
    verbose: Flags.boolean({ description: 'Mostra output dettagliato', default: false }),
    'dry-run': Flags.boolean({ description: 'Mostra cosa farebbe senza eseguire', default: false }),
  }

  async run() {
    const { flags } = await this.parse(Init)
    const isDryRun = flags['dry-run']
    const isJson = flags.json

    if (!isJson) await printWelcomeScreen(this.config.version)

    const platform = await detectPlatform()
    const steps = []

    // 1. Check prerequisites
    const spinner = isJson ? null : ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Checking prerequisites...') }).start()
    const prerequisites = [
      { name: 'Node.js', cmd: 'node', args: ['--version'], required: true },
      { name: 'nvm', cmd: 'nvm', args: ['--version'], required: false },
      { name: 'npm', cmd: 'npm', args: ['--version'], required: true },
      { name: 'Git', cmd: 'git', args: ['--version'], required: true },
      { name: 'gh CLI', cmd: 'gh', args: ['--version'], required: true },
      { name: 'Docker', cmd: 'docker', args: ['--version'], required: false },
      { name: 'AWS CLI', cmd: 'aws', args: ['--version'], required: false },
      { name: 'aws-vault', cmd: 'aws-vault', args: ['--version'], required: false },
    ]

    for (const prereq of prerequisites) {
      const path = await which(prereq.cmd)
      const status = path ? 'ok' : prereq.required ? 'fail' : 'warn'
      steps.push({ name: prereq.name, status, action: path ? 'found' : 'missing' })
      if (flags.verbose && !isJson) this.log(`  ${prereq.name}: ${path ?? 'not found'}`)
    }
    spinner?.succeed('Prerequisites checked')

    // 2. Configure Git credential helper
    const gitCredSpinner = isJson ? null : ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Configuring Git credential helper...') }).start()
    if (!isDryRun) {
      await exec('git', ['config', '--global', 'credential.helper', platform.credentialHelper])
    }
    steps.push({ name: 'git-credential', status: 'ok', action: isDryRun ? 'would configure' : 'configured' })
    gitCredSpinner?.succeed(`Git credential helper: ${platform.credentialHelper}`)

    // 3. Configure aws-vault (interactive if not configured)
    const awsVaultInstalled = await which('aws-vault')
    if (awsVaultInstalled) {
      steps.push({ name: 'aws-vault', status: 'ok', action: 'found' })
    } else {
      steps.push({ name: 'aws-vault', status: 'warn', action: 'not installed' })
      if (!isJson) this.log(chalk.yellow('  aws-vault not found. Install: brew install aws-vault'))
    }

    // 4. Create/update config
    const configSpinner = isJson ? null : ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Creating config...') }).start()
    let config = await loadConfig()

     if (!configExists() && !isDryRun && !isJson) {
       // Stop the spinner before interactive prompts to avoid TTY contention on macOS
       configSpinner?.stop()
       const useOrg = await confirm({ message: 'Do you use a GitHub organization? (y/n)', default: true })
       let org = ''
       if (useOrg) {
         org = await input({ message: 'GitHub org name:', default: config.org || '' })
       }
       const awsProfile = await input({ message: 'AWS profile name:', default: config.awsProfile || 'default' })
       const awsRegion = await input({ message: 'AWS region:', default: config.awsRegion || 'eu-west-1' })
       config = { ...config, org, awsProfile, awsRegion, shell: platform.credentialHelper }
     }

    if (!isDryRun) {
      await saveConfig(config)
    }
    steps.push({ name: 'config', status: 'ok', action: isDryRun ? 'would create' : 'created' })
    configSpinner?.succeed(`Config: ${CONFIG_PATH}`)

    // 5. ClickUp wizard (T008: interactive, T009: dry-run, T010: json)
    if (isDryRun) {
      // T009: In dry-run mode report what would happen without any network calls
      steps.push({ name: 'clickup', status: 'would configure' })
    } else if (isJson) {
      // T010: In JSON mode skip wizard, report current ClickUp config status
      config = await loadConfig()
      steps.push({
        name: 'clickup',
        status: config.clickup?.teamId ? 'configured' : 'not_configured',
        teamId: config.clickup?.teamId,
        teamName: config.clickup?.teamName,
        authMethod: config.clickup?.authMethod,
      })
    } else {
      // T008: Full interactive wizard
      const configureClickUp = await confirm({ message: 'Configure ClickUp integration?', default: true })
       if (!configureClickUp) {
         steps.push({ name: 'clickup', status: 'skipped' })
         this.log(chalk.dim('  Skipped. Run `dvmi init` again to configure ClickUp later.'))
       } else {
        // Determine auth method
        const clientId = process.env.CLICKUP_CLIENT_ID
        const clientSecret = process.env.CLICKUP_CLIENT_SECRET
        let authMethod = /** @type {'oauth'|'personal_token'} */ ('personal_token')

        if (clientId && clientSecret) {
          const choice = await select({
            message: 'Select ClickUp authentication method:',
            choices: [
              { name: 'Personal API Token (paste from ClickUp Settings > Apps)', value: 'personal_token' },
              { name: 'OAuth (opens browser)', value: 'oauth' },
            ],
          })
          authMethod = /** @type {'oauth'|'personal_token'} */ (choice)
        }

        // Acquire token
        if (authMethod === 'oauth') {
          try {
            this.log(chalk.dim('  Opening browser for OAuth authorization...'))
            await oauthFlow(/** @type {string} */ (clientId), /** @type {string} */ (clientSecret))
          } catch {
            this.log(chalk.yellow('  OAuth failed. Falling back to Personal API Token.'))
            authMethod = 'personal_token'
          }
        }

        if (authMethod === 'personal_token') {
          const token = await input({ message: 'Paste your ClickUp Personal API Token:' })
          await storeToken(token)
        }

        // Validate token
        const validateSpinner = ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Validating ClickUp credentials...') }).start()
        let tokenValid = false
        try {
          const result = await validateToken()
          tokenValid = result.valid
          validateSpinner.succeed('ClickUp credentials validated')
        } catch {
          validateSpinner.fail('Failed to validate ClickUp credentials')
        }

        if (!tokenValid) {
          this.log(chalk.yellow('  Invalid token. Check your ClickUp Personal API Token and try again.'))
          const retry = await confirm({ message: 'Retry ClickUp configuration?', default: false })
          if (!retry) {
            steps.push({ name: 'clickup', status: 'skipped' })
          } else {
            const token = await input({ message: 'Paste your ClickUp Personal API Token:' })
            await storeToken(token)
            tokenValid = (await validateToken()).valid
          }
        }

        if (tokenValid) {
          // Fetch teams
          let teamId = ''
          let teamName = ''
          const teamsSpinner = ora({ spinner: 'arc', color: false, text: chalk.hex('#FF6B2B')('Fetching available teams...') }).start()
          try {
            const teams = await getTeams()
            teamsSpinner.stop()
            if (teams.length === 1) {
              teamId = teams[0].id
              teamName = teams[0].name
              this.log(chalk.green('✓') + ` Auto-selected team: ${teamName} (${teamId})`)
            } else if (teams.length > 1) {
              const selected = await select({
                message: 'Select your ClickUp team:',
                choices: teams.map((t) => ({ name: `${t.name} (${t.id})`, value: t.id })),
              })
              teamId = selected
              teamName = teams.find((t) => t.id === selected)?.name ?? ''
            } else {
              teamId = await input({ message: 'Enter ClickUp team ID:' })
            }
          } catch {
            teamsSpinner.fail('Could not fetch teams')
            teamId = await input({ message: 'Enter ClickUp team ID (find in ClickUp Settings > Spaces):' })
          }

          // Save ClickUp config
          config = await loadConfig()
          config = { ...config, clickup: { ...config.clickup, teamId, teamName, authMethod } }
          await saveConfig(config)
          this.log(chalk.green('✓') + ' ClickUp configured successfully!')
          steps.push({ name: 'clickup', status: 'configured', teamId, teamName, authMethod })
        }
      }
    }

     // 6. AI tool selection
     if (isDryRun) {
       steps.push({ name: 'ai-tool', status: 'would configure' })
     } else if (isJson) {
       config = await loadConfig()
       steps.push({
         name: 'ai-tool',
         status: config.aiTool ? 'configured' : 'not_configured',
         aiTool: config.aiTool,
       })
     } else {
       const aiToolChoices = Object.keys(SUPPORTED_TOOLS).map((t) => ({ name: t, value: t }))
       aiToolChoices.push({ name: 'none / skip', value: '' })
       const aiTool = await select({
         message: 'Select your preferred AI tool for `dvmi prompts run`:',
         choices: aiToolChoices,
       })
       if (aiTool) {
         config = { ...config, aiTool }
         await saveConfig(config)
         this.log(chalk.green(`✓ AI tool set to: ${aiTool}`))
         steps.push({ name: 'ai-tool', status: 'configured', aiTool })
       } else {
         steps.push({ name: 'ai-tool', status: 'skipped' })
       }
     }

     // 7. Shell completions
     steps.push({ name: 'shell-completions', status: 'ok', action: 'install via: dvmi autocomplete' })

    const result = { steps, configPath: CONFIG_PATH }

     if (isJson) return result

     await typewriterLine('✓ Setup complete!')
     this.log(chalk.dim('  Run `dvmi doctor` to verify your environment'))

    return result
  }
}
