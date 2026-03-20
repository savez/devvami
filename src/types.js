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
 * @property {string} serviceName
 * @property {number} amount
 * @property {string} unit
 * @property {{ start: string, end: string }} period
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
 * @typedef {Object} SearchMatch
 * @property {string} file - File path (e.g. "docs/deploy.md")
 * @property {number} line - Line number (1-based)
 * @property {string} context - Line text containing the match
 * @property {number} occurrences - Total number of occurrences in the file
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
