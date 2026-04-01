import {Command, Args, Flags} from '@oclif/core'
import ora from 'ora'
import {getCveDetail} from '../../services/nvd.js'
import {formatCveDetail} from '../../formatters/vuln.js'
import {openBrowser} from '../../utils/open-browser.js'
import {ValidationError} from '../../utils/errors.js'

export default class VulnDetail extends Command {
  static description = 'View full details for a specific CVE'

  static examples = [
    '<%= config.bin %> vuln detail CVE-2021-44228',
    '<%= config.bin %> vuln detail CVE-2021-44228 --open',
    '<%= config.bin %> vuln detail CVE-2021-44228 --json',
  ]

  static enableJsonFlag = true

  static args = {
    cveId: Args.string({description: 'CVE identifier (e.g. CVE-2021-44228)', required: true}),
  }

  static flags = {
    open: Flags.boolean({
      char: 'o',
      description: 'Open the first reference URL in the default browser',
      default: false,
    }),
  }

  async run() {
    const {args, flags} = await this.parse(VulnDetail)
    const isJson = flags.json
    const {cveId} = args

    if (!cveId || !/^CVE-\d{4}-\d{4,}$/i.test(cveId)) {
      throw new ValidationError(
        `Invalid CVE ID: ${cveId}`,
        'CVE IDs must match the format CVE-YYYY-NNNNN (e.g. CVE-2021-44228)',
      )
    }

    const spinner = isJson ? null : ora(`Fetching ${cveId.toUpperCase()}...`).start()

    try {
      const detail = await getCveDetail(cveId)
      spinner?.stop()

      if (isJson) return detail

      this.log(formatCveDetail(detail))

      if (flags.open && detail.references.length > 0) {
        const firstUrl = detail.references[0].url
        this.log(`\nOpening ${firstUrl} ...`)
        await openBrowser(firstUrl)
      }

      return detail
    } catch (err) {
      spinner?.stop()
      throw err
    }
  }
}
