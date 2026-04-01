import {Command, Args, Flags} from '@oclif/core'
import {input} from '@inquirer/prompts'
import ora from 'ora'
import {getServiceCosts} from '../../services/aws-costs.js'
import {loadConfig} from '../../services/config.js'
import {formatCostTable, calculateTotal} from '../../formatters/cost.js'
import {DvmiError} from '../../utils/errors.js'
import {
  awsVaultPrefix,
  isAwsVaultSession,
  reexecCurrentCommandWithAwsVault,
  reexecCurrentCommandWithAwsVaultProfile,
} from '../../utils/aws-vault.js'

export default class CostsGet extends Command {
  static description = 'Get AWS costs for a service, grouped by service, tag, or both'

  static examples = [
    '<%= config.bin %> costs get',
    '<%= config.bin %> costs get my-service',
    '<%= config.bin %> costs get --period mtd',
    '<%= config.bin %> costs get --period last-week',
    '<%= config.bin %> costs get --group-by tag --tag-key env',
    '<%= config.bin %> costs get my-service --group-by both --tag-key env',
    '<%= config.bin %> costs get --group-by tag --tag-key env --json',
  ]

  static enableJsonFlag = true

  static args = {
    service: Args.string({description: 'Service name (used to derive tag filter from config)', required: false}),
  }

  static flags = {
    period: Flags.string({
      description: 'Time period: last-month, last-week, mtd',
      default: 'last-month',
      options: ['last-month', 'last-week', 'mtd'],
    }),
    'group-by': Flags.string({
      description: 'Grouping dimension: service, tag, or both',
      default: 'service',
      options: ['service', 'tag', 'both'],
    }),
    'tag-key': Flags.string({
      description: 'Tag key for grouping when --group-by tag or both',
    }),
  }

  async run() {
    const {args, flags} = await this.parse(CostsGet)
    const isJson = flags.json
    const isInteractive = !isJson && process.stdout.isTTY && process.env.CI !== 'true'
    const groupBy = /** @type {'service'|'tag'|'both'} */ (flags['group-by'])

    const config = await loadConfig()

    if (isInteractive && !isAwsVaultSession() && process.env.DVMI_AWS_VAULT_REEXEC !== '1') {
      const profile = await input({
        message: 'AWS profile (aws-vault):',
        default: config.awsProfile || process.env.AWS_VAULT || 'default',
      })

      const selected = profile.trim()
      if (!selected) {
        this.error('AWS profile is required to run this command.')
      }

      const promptedReexecExitCode = await reexecCurrentCommandWithAwsVaultProfile(selected)
      if (promptedReexecExitCode !== null) {
        this.exit(promptedReexecExitCode)
        return
      }
    }

    // Transparent aws-vault usage: if a profile is configured and no AWS creds are present,
    // re-run this exact command via `aws-vault exec <profile> -- ...`.
    const reexecExitCode = await reexecCurrentCommandWithAwsVault(config)
    if (reexecExitCode !== null) {
      this.exit(reexecExitCode)
      return
    }

    // Resolve tag key: explicit flag → first key in config projectTags
    const configTagKey = config.projectTags ? Object.keys(config.projectTags)[0] : undefined
    const tagKey = flags['tag-key'] ?? configTagKey

    // Validate: tag key required when grouping by tag or both
    if ((groupBy === 'tag' || groupBy === 'both') && !tagKey) {
      throw new DvmiError('No tag key available.', 'Pass --tag-key or configure projectTags in dvmi config.')
    }

    const serviceArg = args.service ?? 'all'
    const tags = config.projectTags ?? (args.service ? {project: args.service} : {})

    const spinner = isJson ? null : ora(`Fetching costs...`).start()

    try {
      const {entries, period} = await getServiceCosts(
        serviceArg,
        tags,
        /** @type {any} */ (flags.period),
        groupBy,
        tagKey,
      )
      spinner?.stop()

      const total = calculateTotal(entries)
      const result = {
        service: args.service ?? null,
        groupBy,
        tagKey: tagKey ?? null,
        period,
        items: entries,
        total: {amount: total, unit: 'USD'},
      }

      if (isJson) return result

      if (entries.length === 0) {
        this.log(`No costs found.`)
        return result
      }

      const label = tagKey && groupBy !== 'service' ? `${serviceArg} (by ${tagKey})` : serviceArg
      this.log(formatCostTable(entries, label, groupBy))
      return result
    } catch (err) {
      spinner?.stop()
      if (String(err).includes('AccessDenied') || String(err).includes('UnauthorizedAccess')) {
        this.error('Missing IAM permission: ce:GetCostAndUsage. Contact your AWS admin.')
      }
      if (String(err).includes('CredentialsProviderError') || String(err).includes('No credentials')) {
        if (isInteractive) {
          const suggestedProfile = config.awsProfile || process.env.AWS_VAULT || 'default'
          const profile = await input({
            message: 'No AWS credentials. Enter aws-vault profile to retry (empty to cancel):',
            default: suggestedProfile,
          })

          const selected = profile.trim()
          if (selected) {
            const retryExitCode = await reexecCurrentCommandWithAwsVaultProfile(selected)
            if (retryExitCode !== null) {
              this.exit(retryExitCode)
              return
            }
          }
        }

        const prefix = awsVaultPrefix(config)
        this.error(`No AWS credentials. Use: ${prefix}dvmi costs get` + (args.service ? ` ${args.service}` : ''))
      }
      throw err
    }
  }
}
