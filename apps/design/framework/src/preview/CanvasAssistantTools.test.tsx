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
    expect(screen.getByText('Installed')).toBeTruthy()
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
  })

  it('renders every streamed apply status in order', async () => {
    mocks.applyCanvasProposal.mockImplementation(
      async ({ onEvent }: { onEvent: (event: unknown) => void }) => {
        onEvent({ type: 'status', phase: 'checking' })
        onEvent({ type: 'status', phase: 'writing' })
        onEvent({ type: 'status', phase: 'validating' })
        onEvent({ type: 'status', phase: 'repairing', attempt: 1 })
        return {
          ok: true,
          proposalId: 'proposal-1',
          repairAttempts: 1,
        }
      },
    )
    registerTools()
    render(
      <ToolHarness
        toolName="propose_canvas_change"
        args={proposalArgs}
        addResult={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))

    await waitFor(() => {
      const statuses = screen.getAllByRole('status')
      expect(statuses.map((status) => status.textContent)).toEqual([
        'Checking files',
        'Writing files',
        'Validating changes',
        'Repairing · attempt 1',
        'Applied',
      ])
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
    success.unmount()

    const addFailure = vi.fn()
    mocks.applyCanvasProposal.mockResolvedValueOnce({
      ok: false,
      proposalId: 'proposal-1',
      error: 'Rollback could not restore every file.',
      rolledBack: false,
    })
    render(
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
    expect(screen.getByText('Rejected')).toBeTruthy()
  })

  it('uses English labels and focus-visible buttons', () => {
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
      '.canvas-assistant-card__status[data-state',
    )
  })
})
