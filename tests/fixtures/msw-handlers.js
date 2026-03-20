import { http, HttpResponse } from 'msw'

export const handlers = [
  // GitHub: authenticated user
  http.get('https://api.github.com/user', () =>
    HttpResponse.json({ login: 'testdev', name: 'Test Dev', id: 1 }),
  ),

  // GitHub: list org repos (includes templates)
  http.get('https://api.github.com/orgs/:org/repos', () =>
    HttpResponse.json([
      { name: 'template-lambda', is_template: true, language: 'JavaScript', description: 'Lambda starter', html_url: 'https://github.com/acme/template-lambda', pushed_at: '2026-03-01T00:00:00Z', topics: ['template'], private: true, updated_at: '2026-03-01T00:00:00Z' },
      { name: 'template-microservice', is_template: true, language: 'JavaScript', description: 'Microservice starter', html_url: 'https://github.com/acme/template-microservice', pushed_at: '2026-03-01T00:00:00Z', topics: ['template'], private: true, updated_at: '2026-03-01T00:00:00Z' },
      { name: 'my-api', is_template: false, language: 'JavaScript', description: 'Main API', html_url: 'https://github.com/acme/my-api', pushed_at: '2026-03-15T00:00:00Z', topics: ['microservice'], private: true, updated_at: '2026-03-15T00:00:00Z' },
    ]),
  ),

  // GitHub: workflow runs
  http.get('https://api.github.com/repos/:owner/:repo/actions/runs', () =>
    HttpResponse.json({
      workflow_runs: [
        { id: 12345, name: 'CI/CD', status: 'completed', conclusion: 'success', head_branch: 'main', created_at: '2026-03-18T10:00:00Z', updated_at: '2026-03-18T10:03:00Z', actor: { login: 'testdev' }, html_url: 'https://github.com/acme/my-api/actions/runs/12345', display_title: 'CI/CD' },
        { id: 12344, name: 'CI/CD', status: 'completed', conclusion: 'failure', head_branch: 'feature/x', created_at: '2026-03-18T08:00:00Z', updated_at: '2026-03-18T08:01:00Z', actor: { login: 'testdev' }, html_url: 'https://github.com/acme/my-api/actions/runs/12344', display_title: 'CI/CD' },
      ],
    }),
  ),

  // GitHub: PR detail
  http.get('https://api.github.com/repos/:owner/:repo/pulls/:pull_number', ({ params }) =>
    HttpResponse.json({
      number: Number(params.pull_number),
      title: 'Feature: user auth',
      state: 'open',
      html_url: `https://github.com/${params.owner}/${params.repo}/pull/${params.pull_number}`,
      draft: false,
      user: { login: 'developer1' },
      head: { ref: 'feature/user-auth' },
      base: { ref: 'main' },
      labels: [{ name: 'feature' }],
      requested_reviewers: [{ login: 'qa-engineer' }],
    }),
  ),

  // GitHub: PR issue comments
  http.get('https://api.github.com/repos/:owner/:repo/issues/:issue_number/comments', () =>
    HttpResponse.json([
      {
        id: 1001,
        user: { login: 'developer1' },
        body: 'Implementazione completata.',
        created_at: '2026-03-17T09:00:00Z',
      },
      {
        id: 1002,
        user: { login: 'qa-engineer' },
        body: 'QA: review in corso\n- [x] Testare flusso login\n- [ ] Verificare logout',
        created_at: '2026-03-17T10:00:00Z',
      },
    ]),
  ),

  // GitHub: PR reviews
  http.get('https://api.github.com/repos/:owner/:repo/pulls/:pull_number/reviews', () =>
    HttpResponse.json([
      {
        id: 2001,
        user: { login: 'qa-engineer' },
        body: 'QA review completata parzialmente.',
        submitted_at: '2026-03-17T11:00:00Z',
        state: 'CHANGES_REQUESTED',
      },
    ]),
  ),

  // GitHub: search issues/PRs (authored + review-requested)
  http.get('https://api.github.com/search/issues', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q') ?? ''
    const items = q.includes('review-requested')
      ? [
          {
            number: 42,
            title: 'Feature: user auth',
            state: 'open',
            html_url: 'https://github.com/acme/my-api/pull/42',
            draft: false,
            user: { login: 'developer1' },
            pull_request: { head: { ref: 'feature/user-auth' }, base: { ref: 'main' } },
          },
        ]
      : [
          {
            number: 10,
            title: 'Fix: login timeout',
            state: 'open',
            html_url: 'https://github.com/acme/my-api/pull/10',
            draft: false,
            user: { login: 'testdev' },
            pull_request: { head: { ref: 'fix/login-timeout' }, base: { ref: 'main' } },
          },
        ]
    return HttpResponse.json({ items, total_count: items.length })
  }),

  // GitHub: search code
  http.get('https://api.github.com/search/code', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q') ?? ''
    return HttpResponse.json({
      items: q
        ? [{ repository: { name: 'my-api' }, path: 'src/services/user.js', name: 'user.js', html_url: 'https://github.com/acme/my-api/blob/main/src/services/user.js' }]
        : [],
    })
  }),

  // ClickUp: get user
  http.get('https://api.clickup.com/api/v2/user', () =>
    HttpResponse.json({ user: { id: 42, username: 'testdev' } }),
  ),

  // ClickUp: list teams/workspaces
  http.get('https://api.clickup.com/api/v2/team', () =>
    HttpResponse.json({ teams: [{ id: '12345', name: 'Acme' }] }),
  ),

  // ClickUp: OAuth token exchange
  http.post('https://api.clickup.com/api/v2/oauth/token', () =>
    HttpResponse.json({ access_token: 'test-token' }),
  ),

  // ClickUp: get tasks (team-wide, supports pagination and due_date_lt)
  http.get('https://api.clickup.com/api/v2/team/:teamId/task', ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '0')

    // Pagination fixture: page 0 has 3 tasks + has_more=true, page 1 has 2 tasks + has_more=false
    if (page === 1) {
      return HttpResponse.json({
        tasks: [
          {
            id: 'def456', name: 'Fix login bug', status: { status: 'in progress', type: 'in_progress' }, priority: { id: '2' },
            due_date: null, url: 'https://app.clickup.com/t/def456', assignees: [{ username: 'testdev' }],
            list: { id: 'L1', name: 'Sprint 42' }, folder: { id: 'F1', name: 'Backend', hidden: false },
          },
          {
            id: 'ghi789', name: 'Write unit tests', status: { status: 'todo', type: 'open' }, priority: { id: '3' },
            due_date: null, url: 'https://app.clickup.com/t/ghi789', assignees: [{ username: 'testdev' }],
            list: { id: 'L2', name: 'Backlog' }, folder: { hidden: true },
          },
        ],
        has_more: false,
      })
    }

    // Default page 0 response
    return HttpResponse.json({
      tasks: [
        {
          id: 'abc123', name: 'Implement user auth', status: { status: 'in progress', type: 'in_progress' }, priority: { id: '2' },
          due_date: null, url: 'https://app.clickup.com/t/abc123', assignees: [{ username: 'testdev' }],
          list: { id: 'L1', name: 'Sprint 42' }, folder: { id: 'F1', name: 'Backend', hidden: false },
        },
      ],
      has_more: false,
    })
  }),

  // ClickUp: get tasks by list (specific list endpoint)
  http.get('https://api.clickup.com/api/v2/list/:listId/task', ({ params }) => {
    if (params.listId === 'NOTFOUND') {
      return HttpResponse.json({ err: 'List not found' }, { status: 404 })
    }
    return HttpResponse.json({
      tasks: [
        {
          id: 'list-task-1', name: 'List task alpha', status: { status: 'in progress', type: 'in_progress' }, priority: { id: '2' },
          due_date: null, url: 'https://app.clickup.com/t/list-task-1', assignees: [{ username: 'testdev' }],
          list: { id: String(params.listId), name: 'Sprint 42' }, folder: { id: 'F1', name: 'Backend', hidden: false },
        },
        {
          id: 'list-task-2', name: 'List task beta (root list)', status: { status: 'todo', type: 'open' }, priority: { id: '3' },
          due_date: null, url: 'https://app.clickup.com/t/list-task-2', assignees: [{ username: 'testdev' }],
          list: { id: String(params.listId), name: 'Sprint 42' }, folder: { hidden: true },
        },
      ],
      has_more: false,
    })
  }),

  // AWS Cost Explorer
  http.post('https://ce.us-east-1.amazonaws.com/', () =>
    HttpResponse.json({
      ResultsByTime: [{
        TimePeriod: { Start: '2026-02-01', End: '2026-03-01' },
        Groups: [
          { Keys: ['AWS Lambda'], Metrics: { UnblendedCost: { Amount: '12.34', Unit: 'USD' } } },
          { Keys: ['Amazon API Gateway'], Metrics: { UnblendedCost: { Amount: '5.67', Unit: 'USD' } } },
        ],
      }],
    }),
  ),

  // npm registry version check
  http.get('https://npm.pkg.github.com/devvami', () =>
    HttpResponse.json({ 'dist-tags': { latest: '1.0.0' } }),
  ),
]
