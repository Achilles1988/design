// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { useState } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasAssistantTools } from './CanvasAssistantTools'

const captured = vi.hoisted(() => ({
  tools: [] as Array<{
    toolName: string
    display?: string
    render: (props: Record<string, unknown>) => React.ReactNode
  }>,
}))

const mocks = vi.hoisted(() => ({
  applyAsset: vi.fn(),
  applyCanvasProposal: vi.fn(),
}))

vi.mock('@assistant-ui/react', async () => {
  const actual = await vi.importActual<typeof import('@assistant-ui/react')>(
    '@assistant-ui/react',
  )
  return {
    ...actual,
    useAssistantToolUI: vi.fn((tool) => {
      captured.tools.push(tool)
    }),
  }
})

vi.mock('@/lib/api', () => ({
  designApi: {
    applyAsset: mocks.applyAsset,
  },
}))

vi.mock('@/lib/canvasAssistantApi', () => ({
  applyCanvasProposal: mocks.applyCanvasProposal,
}))

const layoutArgs = {
  layoutId: 'sidebar-shell',
  title: 'Sidebar Shell',
  summary: 'A focused app shell.',
  reason: 'It matches the current navigation structure.',
  previewUrl: '/preview/sidebar-shell.png',
}

const proposalArgs = {
  proposalId: 'proposal-1',
  mode: 'create' as const,
  summary: ['Builds the dashboard shell.', 'Adds the overview content.'],
  styleId: 'dashboard',
  layout: {
    kind: 'installed' as const,
    id: 'sidebar-shell',
    reason: 'Already installed.',
  },
  changedFiles: ['src/canvases/home.tsx', 'src/components/Metric.tsx'],
  reusedComponents: ['Sidebar', 'Header'],
  newSharedComponents: ['Metric'],
  preserved: ['Existing app routes'],
  validationChecks: ['TypeScript build'],
  expiresAt: '2026-07-25T12:00:00.000Z',
}

function renderer(toolName: string) {
  const tool = captured.tools.find((candidate) => candidate.toolName === toolName)
  if (!tool) throw new Error(`Missing renderer for ${toolName}`)
  return tool.render as React.ComponentType<Record<string, unknown>>
}

function ToolHarness({
  toolName,
  args,
  addResult,
}: {
  toolName: string
  args: Record<string, unknown>
  addResult: (result: unknown) => void
}) {
  const [result, setResult] = useState<unknown>()
  const Tool = renderer(toolName)
  return (
    <Tool
      args={args}
      result={result}
      status={{ type: result ? 'complete' : 'running' }}
      addResult={(next: unknown) => {
        addResult(next)
        setResult(next)
      }}
      resume={vi.fn()}
      respondToApproval={vi.fn()}
      toolName={toolName}
      toolCallId={`${toolName}-1`}
      argsText={JSON.stringify(args)}
    />
  )
}

function registerTools() {
  render(<CanvasAssistantTools appId="design" canvasId="home" />)
  expect(captured.tools.map((tool) => [tool.toolName, tool.display])).toEqual([
    ['recommend_canvas_layout', 'standalone'],
    ['propose_canvas_change', 'standalone'],
  ])
}

function expectFocusedStatus(name: string, text: string) {
  const status = screen.getByRole('status', { name })
  expect(status.textContent).toBe(text)
  expect(status.getAttribute('aria-live')).toBe('polite')
  expect(status.getAttribute('aria-atomic')).toBe('true')
  expect(status.getAttribute('tabindex')).toBe('-1')
  expect(document.activeElement).toBe(status)
}

describe('CanvasAssistantTools', () => {
  afterEach(cleanup)

  beforeEach(() => {
    captured.tools = []
    mocks.applyAsset.mockReset()
    mocks.applyCanvasProposal.mockReset()
  })

  it('shows Not installed and installs a recommended Layout once', async () => {
    mocks.applyAsset.mockResolvedValue({ id: 'design', name: 'Design' })
    const addResult = vi.fn()
    registerTools()

    render(
      <ToolHarness
        toolName="recommend_canvas_layout"
        args={layoutArgs}
        addResult={addResult}
      />,
    )
    expect(screen.getByText('Not installed')).toBeTruthy()
    const install = screen.getByRole('button', { name: 'Install Layout' })
    fireEvent.click(install)
    fireEvent.click(install)

    await waitFor(() => expect(mocks.applyAsset).toHaveBeenCalledTimes(1))
    expect(mocks.applyAsset).toHaveBeenCalledWith(
      'layoutmd',
      'sidebar-shell',
      'design',
    )
    await waitFor(() =>
      expect(addResult).toHaveBeenCalledWith({
        status: 'installed',
        layoutId: 'sidebar-shell',
      }),
    )
    await waitFor(() =>
      expectFocusedStatus('Layout installation status', 'Installed'),
    )
  })

  it('adds an installed result only after designApi.applyAsset succeeds', async () => {
    let resolveInstall: ((value: unknown) => void) | undefined
    mocks.applyAsset.mockReturnValue(
      new Promise((resolve) => {
        resolveInstall = resolve
      }),
    )
    const addResult = vi.fn()
    registerTools()
    render(
      <ToolHarness
        toolName="recommend_canvas_layout"
        args={layoutArgs}
        addResult={addResult}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Install Layout' }))

    expect(addResult).not.toHaveBeenCalled()
    expect(
      (screen.getByRole('button', { name: 'Installing…' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    resolveInstall?.({ id: 'design' })
    await waitFor(() => expect(addResult).toHaveBeenCalledTimes(1))
  })

  it('adds a failed result and keeps the Canvas unchanged on install failure', async () => {
    mocks.applyAsset.mockRejectedValue(new Error('Layout archive is invalid.'))
    const addResult = vi.fn()
    registerTools()
    render(
      <ToolHarness
        toolName="recommend_canvas_layout"
        args={layoutArgs}
        addResult={addResult}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Install Layout' }))

    await waitFor(() =>
      expect(addResult).toHaveBeenCalledWith({
        status: 'failed',
        error: 'Layout archive is invalid.',
      }),
    )
    expect(screen.getByRole('alert').textContent).toContain(
      'Layout archive is invalid.',
    )
    await waitFor(() =>
      expectFocusedStatus('Layout installation status', 'Install failed'),
    )
    expect(mocks.applyCanvasProposal).not.toHaveBeenCalled()
  })

  it('shows Style, Layout, changed files, reused and new components', () => {
    registerTools()
    render(
      <ToolHarness
        toolName="propose_canvas_change"
        args={proposalArgs}
        addResult={vi.fn()}
      />,
    )

    expect(screen.getByText('Style')).toBeTruthy()
    expect(screen.getByText('dashboard')).toBeTruthy()
    expect(screen.getByText('Layout')).toBeTruthy()
    expect(screen.getByText('sidebar-shell')).toBeTruthy()
    expect(screen.getByText('Changed files')).toBeTruthy()
    expect(screen.getByText('src/canvases/home.tsx')).toBeTruthy()
    expect(screen.getByText('Reused components')).toBeTruthy()
    expect(screen.getByText('Sidebar')).toBeTruthy()
    expect(screen.getByText('New shared components')).toBeTruthy()
    expect(screen.getByText('Metric')).toBeTruthy()
  })

  it('applies a proposal once and disables buttons while pending', async () => {
    let resolveApply: ((value: unknown) => void) | undefined
    mocks.applyCanvasProposal.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = resolve
        }),
    )
    const addResult = vi.fn()
    registerTools()
    render(
      <ToolHarness
        toolName="propose_canvas_change"
        args={proposalArgs}
        addResult={addResult}
      />,
    )
    const apply = screen.getByRole('button', { name: 'Apply changes' })
    const reject = screen.getByRole('button', { name: 'Reject' })

    fireEvent.click(apply)
    fireEvent.click(apply)

    expect(mocks.applyCanvasProposal).toHaveBeenCalledTimes(1)
    expect(
      (screen.getByRole('button', { name: 'Applying…' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect((reject as HTMLButtonElement).disabled).toBe(true)
    expect(addResult).not.toHaveBeenCalled()
    resolveApply?.({
      ok: true,
      proposalId: 'proposal-1',
      repairAttempts: 0,
    })
    await waitFor(() =>
      expect(addResult).toHaveBeenCalledWith({
        status: 'applied',
        proposalId: 'proposal-1',
      }),
    )
    await waitFor(() =>
      expectFocusedStatus('Canvas proposal status', 'Applied'),
    )
  })

  it('marks only the last repair attempt as repaired on success', async () => {
    let resolveApply:
      | ((value: {
          ok: true
          proposalId: string
          repairAttempts: number
        }) => void)
      | undefined
    mocks.applyCanvasProposal.mockImplementation(
      ({ onEvent }: { onEvent: (event: unknown) => void }) => {
        onEvent({ type: 'status', phase: 'checking' })
        onEvent({ type: 'status', phase: 'writing' })
        onEvent({ type: 'status', phase: 'validating' })
        onEvent({ type: 'status', phase: 'repairing', attempt: 1 })
        onEvent({ type: 'status', phase: 'repairing', attempt: 2 })
        return new Promise((resolve) => {
          resolveApply = resolve
        })
      },
    )
    registerTools()
    const view = render(
      <ToolHarness
        toolName="propose_canvas_change"
        args={proposalArgs}
        addResult={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))

    await waitFor(() => {
      const statuses = Array.from(
        view.container.querySelectorAll<HTMLElement>(
          '.canvas-assistant-card__progress [role="status"]',
        ),
      )
      expect(statuses.map((status) => status.textContent)).toEqual([
        'Checking files',
        'Writing files',
        'Validating changes',
        'Repairing · attempt 1',
        'Repairing · attempt 2',
      ])
      expect(statuses.every((status) => status.dataset.state === 'pending')).toBe(
        true,
      )
    })

    resolveApply?.({
      ok: true,
      proposalId: 'proposal-1',
      repairAttempts: 2,
    })

    await waitFor(() => {
      const statuses = Array.from(
        view.container.querySelectorAll<HTMLElement>(
          '.canvas-assistant-card__progress [role="status"]',
        ),
      )
      expect(statuses.map((status) => status.textContent)).toEqual([
        'Checking files',
        'Writing files',
        'Validating changes',
        'Repairing · attempt 1',
        'Repairing · attempt 2',
        'Repaired · attempt 2',
        'Applied',
      ])
      expect(statuses.every((status) => status.dataset.state === 'success')).toBe(
        true,
      )
    })
  })

  it('adds applied or failed human-tool results', async () => {
    const addSuccess = vi.fn()
    mocks.applyCanvasProposal.mockResolvedValueOnce({
      ok: true,
      proposalId: 'proposal-1',
      repairAttempts: 0,
    })
    registerTools()
    const success = render(
      <ToolHarness
        toolName="propose_canvas_change"
        args={proposalArgs}
        addResult={addSuccess}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))
    await waitFor(() =>
      expect(addSuccess).toHaveBeenCalledWith({
        status: 'applied',
        proposalId: 'proposal-1',
      }),
    )
    await waitFor(() =>
      expectFocusedStatus('Canvas proposal status', 'Applied'),
    )
    success.unmount()

    const addFailure = vi.fn()
    mocks.applyCanvasProposal.mockImplementationOnce(
      async ({ onEvent }: { onEvent: (event: unknown) => void }) => {
        onEvent({ type: 'status', phase: 'writing' })
        return {
          ok: false,
          proposalId: 'proposal-1',
          error: 'Rollback could not restore every file.',
          rolledBack: false,
        }
      },
    )
    const failure = render(
      <ToolHarness
        toolName="propose_canvas_change"
        args={proposalArgs}
        addResult={addFailure}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))

    await waitFor(() =>
      expect(addFailure).toHaveBeenCalledWith({
        status: 'failed',
        proposalId: 'proposal-1',
        error:
          'Rollback could not restore every file. Manual file inspection is required because rollback was incomplete.',
      }),
    )
    expect(screen.getByRole('alert').textContent).toContain(
      'Manual file inspection is required',
    )
    await waitFor(() =>
      expectFocusedStatus('Canvas proposal status', 'Apply failed'),
    )
    expect(
      Array.from(
        failure.container.querySelectorAll<HTMLElement>(
          '.canvas-assistant-card__progress [role="status"]',
        ),
      ).every((status) => status.dataset.state === 'error'),
    ).toBe(true)
  })

  it('announces and focuses a generic proposal failure', async () => {
    mocks.applyCanvasProposal.mockRejectedValue(
      new Error('Apply request failed.'),
    )
    const addResult = vi.fn()
    registerTools()
    render(
      <ToolHarness
        toolName="propose_canvas_change"
        args={proposalArgs}
        addResult={addResult}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))

    await waitFor(() =>
      expect(addResult).toHaveBeenCalledWith({
        status: 'failed',
        proposalId: 'proposal-1',
        error: 'Apply request failed.',
      }),
    )
    expect(screen.getByRole('alert').textContent).toContain(
      'Apply request failed.',
    )
    await waitFor(() =>
      expectFocusedStatus('Canvas proposal status', 'Apply failed'),
    )
  })

  it('shows a rejected proposal as Rejected', async () => {
    const addResult = vi.fn()
    registerTools()
    render(
      <ToolHarness
        toolName="propose_canvas_change"
        args={proposalArgs}
        addResult={addResult}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    await waitFor(() =>
      expect(addResult).toHaveBeenCalledWith({
        status: 'rejected',
        reason: 'User declined the Canvas proposal.',
      }),
    )
    await waitFor(() =>
      expectFocusedStatus('Canvas proposal status', 'Rejected'),
    )
  })

  it('keeps readable card text, 14px controls, and complete interaction states', () => {
    registerTools()
    render(
      <ToolHarness
        toolName="recommend_canvas_layout"
        args={layoutArgs}
        addResult={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Install Layout' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeTruthy()
    const assistantStyles = readFileSync(
      'framework/src/shell/assistant/assistant.css',
      'utf8',
    )
    expect(assistantStyles).toContain(
      '.canvas-assistant-card__actions button:focus-visible',
    )
    expect(assistantStyles).toContain(
      '.canvas-assistant-card__actions button:active:not(:disabled)',
    )
    expect(assistantStyles).toContain(
      '.canvas-assistant-card__actions button:disabled',
    )
    expect(assistantStyles).toContain(
      '@media (prefers-reduced-motion: reduce)',
    )
    expect(assistantStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.canvas-assistant-card__actions button \{\s*transition: none;\s*\}[\s\S]*?\}/,
    )
    expect(assistantStyles).toMatch(
      /\.canvas-assistant-card \{[\s\S]*?font-size: 14px;/,
    )
    expect(assistantStyles).toMatch(
      /\.canvas-assistant-card h4,[\s\S]*?\.canvas-assistant-card__eyebrow \{[\s\S]*?color: var\(--color-text\);[\s\S]*?font-size: 12px;/,
    )
    expect(assistantStyles).toMatch(
      /\.canvas-assistant-card__reason \{\s*color: var\(--color-text\);/,
    )
    expect(assistantStyles).toMatch(
      /\.canvas-assistant-card__empty \{\s*color: var\(--color-text\);/,
    )
    expect(assistantStyles).toMatch(
      /\.canvas-assistant-card__actions button \{[\s\S]*?font-size: 14px;/,
    )
    expect(assistantStyles).toMatch(
      /\.canvas-assistant-card__actions \.canvas-assistant-card__primary:active:not\(:disabled\) \{\s*border-color: var\(--color-primary\);\s*background: var\(--color-primary\);\s*transform: translateY\(1px\);\s*\}/,
    )
    expect(assistantStyles).toMatch(
      /\.canvas-assistant-card__status \{[\s\S]*?color: var\(--color-text\);/,
    )
    expect(assistantStyles).toMatch(
      /\.canvas-assistant-card__status\[data-state='success'\]::before \{\s*background: var\(--color-success\);/,
    )
    expect(assistantStyles).toMatch(
      /\.canvas-assistant-card__error \{\s*color: var\(--color-text\);/,
    )
  })
})
