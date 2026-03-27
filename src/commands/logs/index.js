import { Command, Flags } from '@oclif/core'
import ora from 'ora'
import { search, input } from '@inquirer/prompts'
import { listLogGroups, filterLogEvents, sinceToEpochMs } from '../../services/cloudwatch-logs.js'
import { loadConfig } from '../../services/config.js'
import { DvmiError } from '../../utils/errors.js'

const SINCE_OPTIONS = ['1h', '24h', '7d']

export default class Logs extends Command {
  static description = 'Browse and query CloudWatch log groups interactively'

  static examples = [
    '<%= config.bin %> logs',
    '<%= config.bin %> logs --group /aws/lambda/my-fn',
    '<%= config.bin %> logs --group /aws/lambda/my-fn --filter "ERROR" --since 24h',
    '<%= config.bin %> logs --group /aws/lambda/my-fn --limit 50 --json',
  ]

  static enableJsonFlag = true

  static flags = {
    group: Flags.string({
      description: 'Log group name — bypasses interactive picker',
      char: 'g',
    }),
    filter: Flags.string({
      description: 'CloudWatch filter pattern (empty = all events)',
      char: 'f',
      default: '',
    }),
    since: Flags.string({
      description: 'Time window: 1h, 24h, 7d',
      default: '1h',
    }),
    limit: Flags.integer({
      description: 'Max log events to return (1–10000)',
      default: 100,
    }),
    region: Flags.string({
      description: 'AWS region (defaults to project config awsRegion)',
      char: 'r',
    }),
  }

  async run() {
    const { flags } = await this.parse(Logs)
    const isJson = flags.json

    // Validate --limit
    if (flags.limit < 1 || flags.limit > 10_000) {
      throw new DvmiError('--limit must be between 1 and 10000.', '')
    }

    // Validate --since
    if (!SINCE_OPTIONS.includes(flags.since)) {
      throw new DvmiError('--since must be one of: 1h, 24h, 7d.', '')
    }

    const config = await loadConfig()
    const region = flags.region ?? config.awsRegion ?? 'eu-west-1'

    let logGroupName = flags.group
    let filterPattern = flags.filter

    // Interactive mode: pick log group + filter pattern
    if (!logGroupName) {
      const spinner = ora('Loading log groups...').start()
      let groups
      try {
        groups = await listLogGroups(region)
      } catch (err) {
        spinner.stop()
        this._handleAwsError(err, region)
        throw err
      }
      spinner.stop()

      if (groups.length === 0) {
        this.log(`No log groups found in region ${region}. Check your AWS credentials and region.`)
        return
      }

      try {
        logGroupName = await search({
          message: 'Select a log group',
          source: async (input) => {
            const term = (input ?? '').toLowerCase()
            return groups
              .filter((g) => g.name.toLowerCase().includes(term))
              .map((g) => ({ name: g.name, value: g.name }))
          },
        })

        filterPattern = await input({
          message: 'Filter pattern (leave empty for all events)',
          default: '',
        })
      } catch {
        // Ctrl+C — clean exit with code 130
        process.exit(130)
      }
    }

    const { startTime, endTime } = sinceToEpochMs(/** @type {'1h'|'24h'|'7d'} */ (flags.since))

    const fetchSpinner = isJson ? null : ora('Fetching log events...').start()

    let result
    try {
      result = await filterLogEvents(logGroupName, filterPattern, startTime, endTime, flags.limit, region)
    } catch (err) {
      fetchSpinner?.stop()
      this._handleAwsError(err, region, logGroupName)
      throw err
    }
    fetchSpinner?.stop()

    if (isJson) {
      // NDJSON to stdout, summary to stderr
      for (const event of result.events) {
        this.log(
          JSON.stringify({
            eventId: event.eventId,
            logStreamName: event.logStreamName,
            timestamp: event.timestamp,
            message: event.message,
          }),
        )
      }
      process.stderr.write(
        JSON.stringify({
          logGroupName: result.logGroupName,
          filterPattern: result.filterPattern,
          startTime: result.startTime,
          endTime: result.endTime,
          truncated: result.truncated,
          count: result.events.length,
        }) + '\n',
      )
      return
    }

    // Table output
    const startIso = new Date(startTime).toISOString()
    const endIso = new Date(endTime).toISOString()
    const divider = '─'.repeat(74)

    this.log(`Log Group: ${logGroupName}`)
    this.log(`Period: last ${flags.since}  (${startIso} → ${endIso})`)
    this.log(`Filter: ${filterPattern ? `"${filterPattern}"` : '(none)'}`)
    this.log(divider)

    for (const event of result.events) {
      const ts = new Date(event.timestamp).toISOString()
      const msg = event.message.length > 200 ? event.message.slice(0, 200) + '…' : event.message
      this.log(`  ${ts}  ${event.logStreamName.slice(-20).padEnd(20)}  ${msg}`)
    }

    this.log(divider)
    const truncationNotice = result.truncated ? '  [Truncated — use --limit or a narrower --since to see more]' : ''
    this.log(`  ${result.events.length} events shown${truncationNotice}`)
  }

  /**
   * Handle common AWS errors and throw DvmiError with spec-defined messages.
   * @param {unknown} err
   * @param {string} _region
   * @param {string} [_logGroupName]
   */
  _handleAwsError(err, _region, _logGroupName) {
    const msg = String(err)
    if (msg.includes('AccessDenied') || msg.includes('UnauthorizedAccess')) {
      this.error(
        'Access denied. Ensure your role has logs:DescribeLogGroups and logs:FilterLogEvents permissions.',
      )
    }
    if (msg.includes('ResourceNotFoundException')) {
      this.error(
        `Log group not found. Check the name and confirm you are using the correct region (--region).`,
      )
    }
    if (msg.includes('InvalidParameterException')) {
      this.error('Invalid filter pattern or parameter. Check the pattern syntax and time range.')
    }
    if (msg.includes('CredentialsProviderError') || msg.includes('No credentials')) {
      this.error('No AWS credentials. Configure aws-vault and run `dvmi init` to set up your profile.')
    }
  }
}
