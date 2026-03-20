import { Octokit } from 'octokit'
import { exec } from './shell.js'
import { AuthError } from '../utils/errors.js'

/** @import { Template, Repository, PullRequest, PRComment, QAStep, PRDetail, PipelineRun } from '../types.js' */

/**
 * Get GitHub token from gh CLI.
 * @returns {Promise<string>}
 */
async function getToken() {
  const result = await exec('gh', ['auth', 'token'])
  if (!result.stdout) throw new AuthError('GitHub')
  return result.stdout
}

/**
 * Create an authenticated Octokit instance using gh CLI token.
 * @returns {Promise<Octokit>}
 */
export async function createOctokit() {
  const token = await getToken()
  return new Octokit({ auth: token })
}

/**
 * List all repositories in an org the user has access to.
 * @param {string} org
 * @param {{ language?: string, topic?: string }} [filters]
 * @returns {Promise<Repository[]>}
 */
export async function listRepos(org, filters = {}) {
  const octokit = await createOctokit()
  const repos = await octokit.paginate(octokit.rest.repos.listForOrg, {
    org,
    type: 'all',
    per_page: 100,
  })
  let results = repos.map((r) => ({
    name: r.name,
    description: r.description ?? '',
    language: r.language ?? '',
    htmlUrl: r.html_url,
    pushedAt: r.pushed_at ?? '',
    topics: r.topics ?? [],
    isPrivate: r.private,
  }))
  if (filters.language) {
    results = results.filter(
      (r) => r.language?.toLowerCase() === filters.language?.toLowerCase(),
    )
  }
  if (filters.topic) {
    results = results.filter((r) => r.topics.includes(filters.topic ?? ''))
  }
  return results
}

/**
 * List template repositories in an org.
 * @param {string} org
 * @returns {Promise<Template[]>}
 */
export async function listTemplates(org) {
  const octokit = await createOctokit()
  const repos = await octokit.paginate(octokit.rest.repos.listForOrg, {
    org,
    type: 'all',
    per_page: 100,
  })
  return repos
    .filter((r) => r.is_template)
    .map((r) => ({
      name: r.name,
      description: r.description ?? '',
      language: r.language ?? '',
      htmlUrl: r.html_url,
      updatedAt: r.updated_at ?? '',
    }))
}

/**
 * Create a repository from a template.
 * @param {{ templateOwner: string, templateRepo: string, name: string, org: string, description: string, isPrivate: boolean }} opts
 * @returns {Promise<{ name: string, htmlUrl: string, cloneUrl: string }>}
 */
export async function createFromTemplate(opts) {
  const octokit = await createOctokit()
  const { data } = await octokit.rest.repos.createUsingTemplate({
    template_owner: opts.templateOwner,
    template_repo: opts.templateRepo,
    name: opts.name,
    owner: opts.org,
    description: opts.description,
    private: opts.isPrivate,
    include_all_branches: false,
  })
  return { name: data.name, htmlUrl: data.html_url, cloneUrl: data.clone_url }
}

/**
 * Configure branch protection on main.
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<void>}
 */
export async function setBranchProtection(owner, repo) {
  const octokit = await createOctokit()
  await octokit.rest.repos.updateBranchProtection({
    owner,
    repo,
    branch: 'main',
    required_status_checks: null,
    enforce_admins: false,
    required_pull_request_reviews: { required_approving_review_count: 0 },
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
  })
}

/**
 * Enable Dependabot alerts on a repo.
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<void>}
 */
export async function enableDependabot(owner, repo) {
  const octokit = await createOctokit()
  await octokit.rest.repos.enableAutomatedSecurityFixes({ owner, repo })
  await octokit.rest.repos.enableVulnerabilityAlerts({ owner, repo })
}

/**
 * Create a pull request.
 * @param {{ owner: string, repo: string, title: string, body: string, head: string, base: string, draft: boolean, labels: string[], reviewers: string[] }} opts
 * @returns {Promise<{ number: number, htmlUrl: string }>}
 */
export async function createPR(opts) {
  const octokit = await createOctokit()
  const { data } = await octokit.rest.pulls.create({
    owner: opts.owner,
    repo: opts.repo,
    title: opts.title,
    body: opts.body,
    head: opts.head,
    base: opts.base,
    draft: opts.draft,
  })
  if (opts.labels?.length) {
    await octokit.rest.issues.addLabels({
      owner: opts.owner,
      repo: opts.repo,
      issue_number: data.number,
      labels: opts.labels,
    })
  }
  if (opts.reviewers?.length) {
    await octokit.rest.pulls.requestReviewers({
      owner: opts.owner,
      repo: opts.repo,
      pull_number: data.number,
      reviewers: opts.reviewers,
    })
  }
  return { number: data.number, htmlUrl: data.html_url }
}

/**
 * List PRs authored by or reviewing the current user.
 * @param {string} org
 * @returns {Promise<{ authored: PullRequest[], reviewing: PullRequest[] }>}
 */
export async function listMyPRs(org) {
  const octokit = await createOctokit()
  const { data: user } = await octokit.rest.users.getAuthenticated()
  const login = user.login

  const [authoredRes, reviewingRes] = await Promise.all([
    octokit.rest.search.issuesAndPullRequests({
      q: `is:pr is:open author:${login} org:${org}`,
      per_page: 30,
    }),
    octokit.rest.search.issuesAndPullRequests({
      q: `is:pr is:open review-requested:${login} org:${org}`,
      per_page: 30,
    }),
  ])

  /**
   * @param {object[]} items
   * @returns {PullRequest[]}
   */
  const mapItems = (items) =>
    items.map((item) => ({
      number: item.number,
      title: item.title,
      state: item.state,
      htmlUrl: item.html_url,
      headBranch: item.pull_request?.head?.ref ?? '',
      baseBranch: item.pull_request?.base?.ref ?? '',
      isDraft: item.draft ?? false,
      ciStatus: 'pending',
      reviewStatus: 'pending',
      mergeable: true,
      author: item.user?.login ?? '',
      reviewers: [],
    }))

  return {
    authored: mapItems(authoredRes.data.items),
    reviewing: mapItems(reviewingRes.data.items),
  }
}

/**
 * List workflow runs for a repo.
 * @param {string} owner
 * @param {string} repo
 * @param {{ branch?: string, limit?: number }} [filters]
 * @returns {Promise<PipelineRun[]>}
 */
export async function listWorkflowRuns(owner, repo, filters = {}) {
  const octokit = await createOctokit()
  const params = {
    owner,
    repo,
    per_page: filters.limit ?? 10,
    ...(filters.branch ? { branch: filters.branch } : {}),
  }
  const { data } = await octokit.rest.actions.listWorkflowRunsForRepo(params)
  return data.workflow_runs.map((run) => {
    const start = new Date(run.created_at)
    const end = run.updated_at ? new Date(run.updated_at) : new Date()
    const duration = Math.round((end.getTime() - start.getTime()) / 1000)
    return {
      id: run.id,
      name: run.name ?? run.display_title,
      status: /** @type {import('../types.js').RunStatus} */ (run.status ?? 'queued'),
      conclusion: /** @type {import('../types.js').RunConclusion} */ (run.conclusion ?? null),
      branch: run.head_branch ?? '',
      duration,
      actor: run.actor?.login ?? '',
      createdAt: run.created_at,
      htmlUrl: run.html_url,
    }
  })
}

/**
 * Rerun a workflow run.
 * @param {string} owner
 * @param {string} repo
 * @param {number} runId
 * @param {boolean} [failedOnly]
 * @returns {Promise<void>}
 */
export async function rerunWorkflow(owner, repo, runId, failedOnly = false) {
  const octokit = await createOctokit()
  if (failedOnly) {
    await octokit.rest.actions.reRunWorkflowFailedJobs({ owner, repo, run_id: runId })
  } else {
    await octokit.rest.actions.reRunWorkflow({ owner, repo, run_id: runId })
  }
}

/**
 * Search code across the org.
 * @param {string} org
 * @param {string} query
 * @param {{ language?: string, repo?: string, limit?: number }} [opts]
 * @returns {Promise<Array<{ repo: string, file: string, line: number, match: string, htmlUrl: string }>>}
 */
export async function searchCode(org, query, opts = {}) {
  const octokit = await createOctokit()
  let q = `${query} org:${org}`
  if (opts.language) q += ` language:${opts.language}`
  if (opts.repo) q += ` repo:${org}/${opts.repo}`
  const { data } = await octokit.rest.search.code({ q, per_page: opts.limit ?? 20 })
  return data.items.map((item) => ({
    repo: item.repository.name,
    file: item.path,
    line: 0,
    match: item.name,
    htmlUrl: item.html_url,
  }))
}

/**
 * Estrae gli step QA (checklist markdown) dal corpo di un commento.
 * @param {string} body
 * @returns {QAStep[]}
 */
export function extractQASteps(body) {
  const steps = []
  for (const line of body.split('\n')) {
    const match = line.match(/^\s*-\s*\[([xX ])\]\s+(.+)/)
    if (match) {
      steps.push({ text: match[2].trim(), checked: match[1].toLowerCase() === 'x' })
    }
  }
  return steps
}

/**
 * Determina se un commento è relativo a QA.
 * @param {string} body
 * @param {string} [author]
 * @returns {boolean}
 */
export function isQAComment(body, author = '') {
  const bodyLower = body.toLowerCase()
  return (
    author.toLowerCase().includes('qa') ||
    bodyLower.startsWith('qa:') ||
    bodyLower.includes('qa review') ||
    bodyLower.includes('qa step') ||
    /^\s*-\s*\[[x ]\]/im.test(body)
  )
}

/**
 * Recupera i dettagli completi di una PR inclusi commenti e step QA.
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @returns {Promise<PRDetail>}
 */
export async function getPRDetail(owner, repo, prNumber) {
  const octokit = await createOctokit()

  const [prRes, commentsRes, reviewsRes] = await Promise.all([
    octokit.rest.pulls.get({ owner, repo, pull_number: prNumber }),
    octokit.rest.issues.listComments({ owner, repo, issue_number: prNumber, per_page: 100 }),
    octokit.rest.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 100 }),
  ])

  const pr = prRes.data

  /** @type {PRComment[]} */
  const allComments = [
    ...commentsRes.data.map((c) => ({
      id: c.id,
      author: c.user?.login ?? '',
      body: c.body ?? '',
      createdAt: c.created_at,
      type: /** @type {'issue'} */ ('issue'),
    })),
    ...reviewsRes.data
      .filter((r) => r.body?.trim())
      .map((r) => ({
        id: r.id,
        author: r.user?.login ?? '',
        body: r.body ?? '',
        createdAt: r.submitted_at ?? '',
        type: /** @type {'review'} */ ('review'),
      })),
  ]

  const qaComments = allComments.filter((c) => isQAComment(c.body, c.author))
  const qaSteps = qaComments.flatMap((c) => extractQASteps(c.body))

  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    htmlUrl: pr.html_url,
    author: pr.user?.login ?? '',
    headBranch: pr.head.ref,
    baseBranch: pr.base.ref,
    isDraft: pr.draft ?? false,
    labels: pr.labels.map((l) => l.name),
    reviewers: pr.requested_reviewers?.map((r) => r.login) ?? [],
    qaComments,
    qaSteps,
  }
}
