/**
 * @module types
 * Shared JSDoc typedefs for the devvami CLI.
 */

/**
 * @typedef {Object} CLIConfig
 * @property {string} org - GitHub org name (e.g. "devvami")
 * @property {string} awsProfile - Default aws-vault profile name
 * @property {string} [awsRegion] - Default AWS region (fallback: eu-west-1)
 * @property {string} [shell] - Detected shell: bash | zsh | fish
 * @property {{ teamId?: string, teamName?: string, authMethod?: 'oauth' | 'personal_token' }} [clickup] - ClickUp workspace config
 * @property {string} [lastVersionCheck] - ISO8601 timestamp of last version check
 * @property {string} [latestVersion] - Latest known CLI version
 * @property {'opencode'|'copilot'} [aiTool] - Preferred AI tool for running prompts
 * @property {string} [promptsDir] - Local directory for downloaded prompts (default: .prompts)
 * @property {DotfilesConfig} [dotfiles] - Chezmoi dotfiles configuration
 */

/**
 * @typedef {Object} DotfilesConfig
 * @property {boolean} enabled - Whether chezmoi dotfiles management is active
 * @property {string} [repo] - Remote dotfiles repository URL
 * @property {string[]} [customSensitivePatterns] - User-added sensitive path patterns
 */

/**
 * @typedef {Object} DotfileEntry
 * @property {string} path - Target file path (e.g. "/home/user/.zshrc")
 * @property {string} sourcePath - Source path in chezmoi state
 * @property {boolean} encrypted - Whether the file is stored with encryption
 * @property {'file'|'dir'|'symlink'} type - Entry type
 */

/**
 * @typedef {Object} DotfileRecommendation
 * @property {string} path - File path to recommend (e.g. "~/.zshrc")
 * @property {'shell'|'git'|'editor'|'package'|'security'} category - Display grouping
 * @property {Platform[]} platforms - Platforms this file applies to
 * @property {boolean} autoEncrypt - Whether to encrypt by default
 * @property {string} description - Human-readable description
 */

/**
 * @typedef {Object} DotfilesSetupResult
 * @property {Platform} platform - Detected platform
 * @property {boolean} chezmoiInstalled - Whether chezmoi was found
 * @property {boolean} encryptionConfigured - Whether age encryption is set up
 * @property {string|null} sourceDir - Chezmoi source directory path
 * @property {string|null} publicKey - Age public key
 * @property {'success'|'skipped'|'failed'} status - Overall setup outcome
 * @property {string} [message] - Human-readable outcome message
 */

/**
 * @typedef {Object} DotfilesStatusResult
 * @property {Platform} platform - Detected platform
 * @property {boolean} enabled - Whether dotfiles management is active
 * @property {boolean} chezmoiInstalled - Whether chezmoi binary exists
 * @property {boolean} encryptionConfigured - Whether age encryption is set up
 * @property {string|null} repo - Remote dotfiles repo URL
 * @property {string|null} sourceDir - Chezmoi source directory
 * @property {DotfileEntry[]} files - All managed files
 * @property {{ total: number, encrypted: number, plaintext: number }} summary - File counts
 */

/**
 * @typedef {Object} DotfilesAddResult
 * @property {{ path: string, encrypted: boolean }[]} added - Successfully added files
 * @property {{ path: string, reason: string }[]} skipped - Skipped files
 * @property {{ path: string, reason: string }[]} rejected - Rejected files
 */

/**
 * @typedef {Object} DotfilesSyncResult
 * @property {'push'|'pull'|'init-remote'|'skipped'} action - Sync action performed
 * @property {string|null} repo - Remote repository URL
 * @property {'success'|'skipped'|'failed'} status - Outcome
 * @property {string} [message] - Human-readable outcome
 * @property {string[]} [conflicts] - Conflicting file paths
 */

/**
 * @typedef {Object} Prompt
 * @property {string} path - Relative path in the repo (e.g. "coding/refactor-prompt.md")
 * @property {string} title - Human-readable title (from frontmatter or filename)
 * @property {string} [category] - Category derived from parent directory (e.g. "coding")
 * @property {string} [description] - Short description from frontmatter
 * @property {string[]} [tags] - Tags from frontmatter
 * @property {string} body - Full prompt content (without frontmatter)
 * @property {string} [author] - Author from frontmatter
 * @property {string} [version] - Version string from frontmatter
 */

/**
 * @typedef {Object} Skill
 * @property {string} id - Unique skill identifier on skills.sh
 * @property {string} name - Display name
 * @property {number} installs - Install count
 * @property {string} source - Source URL or identifier
 */

/**
 * @typedef {Object} AwesomeEntry
 * @property {string} name - Entry name
 * @property {string} description - Short description
 * @property {string} url - Link to the resource
 * @property {string} category - Category (agents, instructions, skills, plugins, hooks, workflows)
 */

/**
 * @typedef {'opencode'|'copilot'} AITool
 */

/**
 * @typedef {'ok'|'warn'|'fail'} CheckStatus
 */

/**
 * @typedef {Object} DoctorCheck
 * @property {string} name - Component name (e.g. "Node.js")
 * @property {CheckStatus} status - Check result
 * @property {string|null} version - Found version (if applicable)
 * @property {string|null} required - Minimum required version (if applicable)
 * @property {string|null} hint - Actionable hint to fix the issue
 */

/**
 * @typedef {Object} BranchName
 * @property {'feature'|'fix'|'chore'|'hotfix'} type - Branch type
 * @property {string} description - kebab-case description
 * @property {string} full - Full branch name: `{type}/{description}`
 */

/**
 * @typedef {Object} Developer
 * @property {string} githubUsername
 * @property {string} githubName
 * @property {string[]} githubOrgs
 * @property {string[]} githubTeams
 * @property {string} [awsAccountId]
 * @property {string} [awsArn]
 * @property {string} [awsRegion]
 * @property {string} cliVersion
 */

/**
 * @typedef {Object} Template
 * @property {string} name
 * @property {string} description
 * @property {string} language
 * @property {string} htmlUrl
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} Repository
 * @property {string} name
 * @property {string} description
 * @property {string} language
 * @property {string} htmlUrl
 * @property {string} pushedAt
 * @property {string[]} topics
 * @property {boolean} isPrivate
 */

/**
 * @typedef {'pass'|'fail'|'pending'} CIStatus
 * @typedef {'approved'|'changes_requested'|'pending'} ReviewStatus
 */

/**
 * @typedef {Object} PullRequest
 * @property {number} number
 * @property {string} title
 * @property {string} state
 * @property {string} htmlUrl
 * @property {string} headBranch
 * @property {string} baseBranch
 * @property {boolean} isDraft
 * @property {CIStatus} ciStatus
 * @property {ReviewStatus} reviewStatus
 * @property {boolean} mergeable
 * @property {string} author
 * @property {string[]} reviewers
 */

/**
 * @typedef {Object} PRComment
 * @property {number} id
 * @property {string} author - GitHub login dell'autore
 * @property {string} body - Corpo del commento in markdown
 * @property {string} createdAt - ISO8601 timestamp
 * @property {'issue'|'review'} type - Sorgente del commento
 */

/**
 * @typedef {Object} QAStep
 * @property {string} text - Testo dello step
 * @property {boolean} checked - true se completato (`[x]`)
 */

/**
 * @typedef {Object} PRDetail
 * @property {number} number
 * @property {string} title
 * @property {string} state
 * @property {string} htmlUrl
 * @property {string} author
 * @property {string} headBranch
 * @property {string} baseBranch
 * @property {boolean} isDraft
 * @property {string[]} labels
 * @property {string[]} reviewers
 * @property {PRComment[]} qaComments - Commenti identificati come QA
 * @property {QAStep[]} qaSteps - Step QA estratti dai commenti
 */

/**
 * @typedef {'completed'|'in_progress'|'queued'} RunStatus
 * @typedef {'success'|'failure'|'cancelled'|null} RunConclusion
 */

/**
 * @typedef {Object} PipelineRun
 * @property {number} id
 * @property {string} name
 * @property {RunStatus} status
 * @property {RunConclusion} conclusion
 * @property {string} branch
 * @property {number} duration - seconds
 * @property {string} actor
 * @property {string} createdAt
 * @property {string} htmlUrl
 */

/**
 * @typedef {Object} ClickUpTask
 * @property {string} id
 * @property {string} name
 * @property {string} status
 * @property {string} statusType - ClickUp internal status type: 'open' | 'in_progress' | 'review' | 'custom' | 'closed'
 * @property {number} priority - 1=urgent, 2=high, 3=normal, 4=low
 * @property {string|null} startDate - YYYY-MM-DD local date, null if not set
 * @property {string|null} dueDate - YYYY-MM-DD local date, null if not set
 * @property {string} url
 * @property {string[]} assignees
 * @property {string|null} listId - ClickUp list ID the task belongs to
 * @property {string|null} listName - ClickUp list name the task belongs to
 * @property {string|null} folderId - ClickUp folder ID, null if list is at root level
 * @property {string|null} folderName - ClickUp folder name, null if list is at root level
 */

/**
 * @typedef {Object} AWSCostEntry
 * @property {string} serviceName        - AWS service name (e.g. "Amazon EC2"), or tag value label for tag grouping
 * @property {string} [tagValue]         - Tag value when grouping by TAG or BOTH (e.g. "prod"); undefined for service-only grouping
 * @property {number} amount             - Cost amount (USD)
 * @property {string} unit               - Currency unit (always "USD")
 * @property {{ start: string, end: string }} period - ISO date range (YYYY-MM-DD)
 */

/**
 * @typedef {'service' | 'tag' | 'both'} CostGroupMode
 * The dimension used to group cost entries.
 * - 'service': group by AWS service name (default, backward-compatible)
 * - 'tag': group by a tag key's values (requires tagKey)
 * - 'both': group by AWS service + tag value simultaneously
 */

/**
 * @typedef {Object} CostTrendPoint
 * @property {string} date     - ISO date (YYYY-MM-DD) for this data point
 * @property {number} amount   - Total cost for this day (USD)
 * @property {string} [label]  - Display label: serviceName for service/both grouping,
 *                               tag value for tag grouping; omitted when not multi-series
 */

/**
 * @typedef {Object} CostTrendSeries
 * @property {string} name          - Series label (service name or tag value)
 * @property {CostTrendPoint[]} points - Ordered daily data points (ascending by date)
 */

/**
 * @typedef {Object} LogGroup
 * @property {string} name              - Full log group name (e.g. "/aws/lambda/my-fn")
 * @property {number} [storedBytes]     - Total stored bytes (may be absent for empty groups)
 * @property {number} [retentionDays]   - Retention policy in days; undefined = never expire
 * @property {string} [creationTime]    - ISO8601 creation timestamp
 */

/**
 * @typedef {Object} LogEvent
 * @property {string} eventId         - Unique event ID assigned by CloudWatch
 * @property {string} logStreamName   - Stream within the log group (e.g. "2026/03/26/[$LATEST]abc")
 * @property {number} timestamp       - Event time as epoch milliseconds
 * @property {string} message         - Raw log message text
 */

/**
 * @typedef {Object} LogFilterResult
 * @property {LogEvent[]} events      - Matched log events (up to --limit)
 * @property {boolean} truncated      - True when the result was capped by --limit or AWS pagination
 * @property {string} logGroupName    - The log group that was queried
 * @property {number} startTime       - Query start as epoch milliseconds
 * @property {number} endTime         - Query end as epoch milliseconds
 * @property {string} filterPattern   - The pattern used ('' = no filter)
 */

/**
 * @typedef {Object} ChartBarData
 * @property {string} name    - Row label (service name, tag value, or "service / tag")
 * @property {number} value   - Cost amount (USD)
 */

/**
 * @typedef {Object} ChartSeries
 * @property {string} name      - Series label displayed in legend
 * @property {number[]} values  - Ordered numeric values (one per day, ~60 for 2 months)
 * @property {string[]} labels  - Date labels matching values array (YYYY-MM-DD)
 */

/**
 * @typedef {Object} ExecResult
 * @property {string} stdout
 * @property {string} stderr
 * @property {number} exitCode
 */

/**
 * @typedef {'macos'|'wsl2'|'linux'} Platform
 */

// ──────────────────────────────────────────────────────────────────────────────
// AI Config Sync TUI types
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {'mcp'|'command'|'rule'|'skill'|'agent'} CategoryType
 */

/**
 * @typedef {'vscode-copilot'|'claude-code'|'claude-desktop'|'opencode'|'gemini-cli'|'copilot-cli'|'cursor'|'windsurf'|'continue-dev'|'zed'|'amazon-q'} EnvironmentId
 */

/**
 * @typedef {Object} MCPParams
 * @property {'stdio'|'sse'|'streamable-http'} transport - MCP transport type
 * @property {string} [command] - Command to execute (required for stdio transport)
 * @property {string[]} [args] - Command arguments
 * @property {Record<string, string>} [env] - Environment variables
 * @property {string} [url] - Server URL (required for sse/streamable-http transport)
 */

/**
 * @typedef {Object} CommandParams
 * @property {string} content - Prompt/command text content (multi-line)
 * @property {string} [description] - Short description of the command
 */

/**
 * @typedef {Object} RuleParams
 * @property {string} content - Rules/instructions content (multi-line Markdown)
 * @property {string} [description] - Short description of the rule
 */

/**
 * @typedef {Object} SkillParams
 * @property {string} content - Skill definition content (multi-line)
 * @property {string} [description] - Short description of the skill
 */

/**
 * @typedef {Object} AgentParams
 * @property {string} instructions - Agent instructions (multi-line)
 * @property {string} [description] - Short description of the agent
 */

/**
 * @typedef {Object} CategoryEntry
 * @property {string} id - UUID v4, auto-generated
 * @property {string} name - Unique within its type; used as filename/key when deploying
 * @property {CategoryType} type - Category type
 * @property {boolean} active - true = deployed to environments, false = removed but kept in store
 * @property {EnvironmentId[]} environments - Target environments for deployment
 * @property {MCPParams|CommandParams|RuleParams|SkillParams|AgentParams} params - Type-specific parameters
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} updatedAt - ISO 8601 timestamp
 */

/**
 * @typedef {Object} AIConfigStore
 * @property {number} version - Schema version
 * @property {CategoryEntry[]} entries - All managed configuration entries
 */

/**
 * @typedef {Object} PathStatus
 * @property {string} path - Absolute path
 * @property {boolean} exists - Whether the path exists on disk
 * @property {boolean} readable - Whether the file could be parsed (for JSON/TOML files)
 */

/**
 * @typedef {Object} CategoryCounts
 * @property {number} mcp
 * @property {number} command
 * @property {number} rule
 * @property {number} skill
 * @property {number} agent
 */

/**
 * @typedef {Object} NativeEntry
 * Runtime only — not persisted. Represents an item found in an environment's config
 * file that is NOT managed by dvmi.
 * @property {string} name - Entry name (extracted from config key or filename)
 * @property {CategoryType} type - Category type
 * @property {EnvironmentId} environmentId - Source environment
 * @property {'project'|'global'} level - Whether from project-level or global-level config
 * @property {string} sourcePath - Absolute path to the source config file
 * @property {object} params - Normalized parameters (same structure as managed entry params)
 */

/**
 * @typedef {Object} DriftInfo
 * Runtime only — not persisted. Describes a managed entry whose deployed state
 * diverges from dvmi's stored expected state.
 * @property {string} entryId - ID of the managed CategoryEntry that drifted
 * @property {EnvironmentId} environmentId - Environment where drift was detected
 * @property {object} expected - What dvmi expects (from store)
 * @property {object} actual - What was found in the file
 */

/**
 * @typedef {Object} DetectedEnvironment
 * @property {EnvironmentId} id - Environment identifier
 * @property {string} name - Display name (e.g. "Claude Code")
 * @property {boolean} detected - Whether any config files were found
 * @property {PathStatus[]} projectPaths - Project-level paths and their existence status
 * @property {PathStatus[]} globalPaths - Global-level paths and their existence status
 * @property {string[]} unreadable - Paths that exist but failed to parse
 * @property {CategoryType[]} supportedCategories - Category types this environment supports
 * @property {CategoryCounts} counts - Per-category item counts from dvmi-managed entries
 * @property {CategoryCounts} nativeCounts - Per-category native item counts (items in config files)
 * @property {NativeEntry[]} nativeEntries - All native entries found for this environment
 * @property {DriftInfo[]} driftedEntries - Managed entries that have drifted from expected state
 * @property {'project'|'global'|'both'} scope - Where detection occurred
 */

/**
 * @typedef {Object} PlatformInfo
 * @property {Platform} platform
 * @property {string} openCommand - Command to open browser
 * @property {string} credentialHelper - Git credential helper
 */

/**
 * @typedef {Object} DocumentEntry
 * @property {string} name - File name (e.g. "README.md")
 * @property {string} path - Relative path in repo (e.g. "docs/architecture.md")
 * @property {'readme'|'doc'|'swagger'|'asyncapi'} type - Classified doc type
 * @property {number} size - File size in bytes
 */

/**
 * @typedef {Object} RepoDocsIndex
 * @property {string} repo - Repository name
 * @property {boolean} hasReadme - Has at least one README file
 * @property {number} docsCount - Number of files in docs/ folder
 * @property {boolean} hasSwagger - Has at least one OpenAPI/Swagger file
 * @property {boolean} hasAsyncApi - Has at least one AsyncAPI file
 * @property {DocumentEntry[]} entries - Full list of DocumentEntry found
 */

/**
 * @typedef {Object} CveSearchResult
 * Represents a single CVE returned from a search query. Used by `dvmi vuln search`.
 * @property {string} id
 * @property {string} description
 * @property {'Critical'|'High'|'Medium'|'Low'|'Unknown'} severity
 * @property {number|null} score
 * @property {string} publishedDate
 * @property {string} lastModified
 * @property {string|null} firstReference - First reference URL from the CVE record, or null
 */

/**
 * @typedef {Object} APIEndpoint
 * @property {string} method - HTTP method (GET, POST, PUT, PATCH, DELETE…)
 * @property {string} path - Endpoint path (e.g. "/users/{id}")
 * @property {string} summary - Operation summary
 * @property {string} parameters - Comma-separated params; required ones marked with *
 */

/**
 * @typedef {Object} AsyncChannel
 * @property {string} channel - Channel name (e.g. "user/created")
 * @property {string} operation - publish | subscribe | send | receive
 * @property {string} summary - Operation summary
 * @property {string} message - Message name/title or "—"
 */

/**
 * @typedef {Object} DetectedRepo
 * @property {string} owner - GitHub owner (org or user)
 * @property {string} repo - Repository name
 */

/**
 * @typedef {Object} SecurityTool
 * @property {string} id - Unique identifier (e.g., "aws-vault", "pass", "gpg", "gcm", "osxkeychain")
 * @property {string} displayName - Human-readable name for UI output
 * @property {'aws'|'git'|'dependency'} role - What the tool protects; 'dependency' = required by another tool
 * @property {'not-installed'|'installed'|'misconfigured'|'skipped'|'n/a'} status - Status after check phase
 * @property {Platform[]} platforms - Platforms where this tool applies
 * @property {string|null} version - Detected version string, if available
 * @property {string|null} hint - Actionable message when status is 'misconfigured' or 'not-installed'
 */

/**
 * @typedef {Object} SetupStep
 * @property {string} id - Unique step identifier (e.g., "install-aws-vault", "init-pass")
 * @property {string} label - Human-readable description shown to the developer
 * @property {string} toolId - The SecurityTool this step belongs to
 * @property {'check'|'install'|'configure'|'verify'} type - Step category
 * @property {() => Promise<StepResult>} run - Async function that executes the step
 * @property {boolean} requiresConfirmation - True for 'install' and 'configure' steps
 * @property {boolean} [skippable] - True if the developer can skip this step without breaking subsequent steps
 * @property {boolean} [gpgInteractive] - True if the step spawns GPG interactively (requires stdio:inherit)
 */

/**
 * @typedef {Object} StepResult
 * @property {'success'|'skipped'|'failed'} status
 * @property {string} [message] - Human-readable outcome message
 * @property {string} [hint] - Actionable recovery suggestion shown only when status is 'failed'
 * @property {string} [hintUrl] - Documentation URL to include with the hint
 */

/**
 * @typedef {Object} SetupSession
 * @property {Platform} platform - Detected platform for this run
 * @property {'aws'|'git'|'both'} selection - What the developer chose to set up
 * @property {SetupStep[]} steps - Ordered list of steps for this session
 * @property {Map<string, StepResult>} results - Map of stepId → StepResult
 * @property {'in-progress'|'completed'|'failed'|'cancelled'} overallStatus - Aggregate status
 */

/**
 * @typedef {Object} GpgKey
 * @property {string} id - Long key ID (16-character hex)
 * @property {string} fingerprint - Full 40-character fingerprint
 * @property {string} name - Associated name from the key's UID
 * @property {string} email - Associated email from the key's UID
 * @property {string|null} expiry - Expiry date as ISO8601 string, or null if no expiry
 */

/**
 * @typedef {Object} SecurityToolStatus
 * @property {string} id - Tool id
 * @property {string} displayName - Human-readable name
 * @property {'not-installed'|'installed'|'misconfigured'|'n/a'} status - Current status
 * @property {string|null} version - Detected version, if any
 * @property {string|null} hint - Recovery hint if misconfigured
 */

/**
 * @typedef {Object} SecuritySetupJsonResult
 * @property {Platform} platform - Detected platform
 * @property {'aws'|'git'|'both'|null} selection - Selection made (null for --json health check)
 * @property {SecurityToolStatus[]} tools - Status of each applicable tool
 * @property {'success'|'partial'|'not-configured'} overallStatus - Aggregate status
 */
