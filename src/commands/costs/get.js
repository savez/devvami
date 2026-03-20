import { Command, Args, Flags } from '@oclif/core'
import ora from 'ora'
import { getServiceCosts } from '../../services/aws-costs.js'
import { loadConfig } from '../../services/config.js'
import { formatCostTable, calculateTotal } from '../../formatters/cost.js'

export default class CostsGet extends Command {
  static description = 'Stima costi AWS per un servizio (via Cost Explorer API)'

  static examples = [
    '<%= config.bin %> costs get my-service',
    '<%= config.bin %> costs get my-api --period mtd',
    '<%= config.bin %> costs get my-service --json',
  ]

  static enableJsonFlag = true

  static args = {
    service: Args.string({ description: 'Nome del servizio', required: true }),
  }

  static flags = {
    period: Flags.string({
      description: 'Periodo: last-month, last-week, mtd',
      default: 'last-month',
      options: ['last-month', 'last-week', 'mtd'],
    }),
  }

  async run() {
    const { args, flags } = await this.parse(CostsGet)
    const isJson = flags.json

    const spinner = isJson ? null : ora(`Fetching costs for ${args.service}...`).start()

    // Get project tags from config
    const config = await loadConfig()
    const tags = config.projectTags ?? { project: args.service }

    try {
      const { entries, period } = await getServiceCosts(args.service, tags, /** @type {any} */ (flags.period))
      spinner?.stop()

      const total = calculateTotal(entries)
      const result = {
        service: args.service,
        period,
        items: entries,
        total: { amount: total, unit: 'USD' },
      }

      if (isJson) return result

      if (entries.length === 0) {
        this.log(`No costs found for service "${args.service}".`)
        this.log('Check service name and tagging convention.')
        return result
      }

      this.log(formatCostTable(entries, args.service))
      return result
    } catch (err) {
      spinner?.stop()
      if (String(err).includes('AccessDenied') || String(err).includes('UnauthorizedAccess')) {
        this.error('Missing IAM permission: ce:GetCostAndUsage\nContact your AWS admin to grant Cost Explorer access.')
      }
       if (String(err).includes('CredentialsProviderError') || String(err).includes('No credentials')) {
         this.error('No AWS credentials. Use: aws-vault exec <profile> -- dvmi costs get ' + args.service)
       }
      throw err
    }
  }
}
