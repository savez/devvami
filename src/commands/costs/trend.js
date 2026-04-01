import {Command, Flags} from '@oclif/core'
import {input} from '@inquirer/prompts'
import ora from 'ora'
import {getTrendCosts, getTwoMonthPeriod} from '../../services/aws-costs.js'
import {loadConfig} from '../../services/config.js'
import {barChart, lineChart} from '../../formatters/charts.js'
import {DvmiError} from '../../utils/errors.js'
import {
  awsVaultPrefix,
  isAwsVaultSession,
  reexecCurrentCommandWithAwsVault,
  reexecCurrentCommandWithAwsVaultProfile,
} from '../../utils/aws-vault.js'

export default class CostsTrend extends Command {
  static description = 'Show a rolling 2-month daily cost trend chart'

  static examples = [
    '<%= config.bin %> costs trend',
    '<%= config.bin %> costs trend --line',
    '<%= config.bin %> costs trend --group-by tag --tag-key env',
    '<%= config.bin %> costs trend --group-by both --tag-key env',
    '<%= config.bin %> costs trend --group-by tag --tag-key env --line',
    '<%= config.bin %> costs trend --json',
  ]

  static enableJsonFlag = true

  static flags = {
    'group-by': Flags.string({
      description: 'Grouping dimension: service, tag, or both',
      default: 'service',
      options: ['service', 'tag', 'both'],
    }),
    'tag-key': Flags.string({
      description: 'Tag key for grouping when --group-by tag or both',
    }),
    line: Flags.boolean({
      description: 'Render as line chart instead of default bar chart',
      default: false,
    }),
  }

  async run() {
    const {flags} = await this.parse(CostsTrend)
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

    const configTagKey = config.projectTags ? Object.keys(config.projectTags)[0] : undefined
    const tagKey = flags['tag-key'] ?? configTagKey

    if ((groupBy === 'tag' || groupBy === 'both') && !tagKey) {
      throw new DvmiError('No tag key available.', 'Pass --tag-key or configure projectTags in dvmi config.')
    }

    const spinner = isJson ? null : ora('Fetching cost trend data...').start()

    try {
      const trendSeries = await getTrendCosts(groupBy, tagKey)
      spinner?.stop()

      const {start, end} = getTwoMonthPeriod()

      if (isJson) {
        return {
          groupBy,
          tagKey: tagKey ?? null,
          period: {start, end},
          series: trendSeries,
        }
      }

      if (trendSeries.length === 0) {
        this.log('No cost data found for the last 2 months.')
        return
      }

      // Convert CostTrendSeries[] → ChartSeries[]
      // All series must share the same label (date) axis — use the union of all dates
      const allDates = Array.from(new Set(trendSeries.flatMap((s) => s.points.map((p) => p.date)))).sort()

      /** @type {import('../../formatters/charts.js').ChartSeries[]} */
      const chartSeries = trendSeries.map((s) => {
        const dateToAmount = new Map(s.points.map((p) => [p.date, p.amount]))
        return {
          name: s.name,
          values: allDates.map((d) => dateToAmount.get(d) ?? 0),
          labels: allDates,
        }
      })

      const title = `AWS Cost Trend — last 2 months  (${start} → ${end})`
      const rendered = flags.line ? lineChart(chartSeries, {title}) : barChart(chartSeries, {title})

      this.log(rendered)
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
        this.error(`No AWS credentials. Use: ${prefix}dvmi costs trend`)
      }
      throw err
    }
  }
}
