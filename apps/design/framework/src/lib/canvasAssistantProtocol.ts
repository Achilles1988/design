import { z } from 'zod'

const AiConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai']),
  baseURL: z.string().url().optional(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
})

const MessagePartSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('tool-call'),
    toolCallId: z.string().min(1),
    toolName: z.string().min(1),
    args: z.unknown(),
    result: z.unknown().optional(),
    isError: z.boolean().optional(),
  }),
])

export const CanvasChatRequestSchema = z.object({
  appId: z.string().min(1),
  canvasId: z.string().min(1),
  aiConfig: AiConfigSchema,
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.array(MessagePartSchema),
      }),
    )
    .max(40),
})

export const CanvasApplyRequestSchema = z.object({
  aiConfig: AiConfigSchema,
})

export const CanvasContextRequestSchema = z.object({
  appId: z.string().min(1),
  canvasId: z.string().min(1),
})

export const CanvasCaptureRequestSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(4),
}).strict()

export const CanvasCaptureResultSchema = z.object({
  url: z.string(),
  finalUrl: z.string().optional(),
  ok: z.boolean(),
  mimeType: z.literal('image/png').optional(),
  base64: z.string().optional(),
  error: z.string().optional(),
}).strict()

export const CanvasCaptureResponseSchema = z.object({
  results: z.array(CanvasCaptureResultSchema).min(1).max(4),
}).strict()

export const CanvasPreviewSessionRequestSchema = z.object({
  appId: z.string().regex(/^[a-z][a-z0-9-]*$/),
  canvasId: z.string().regex(/^[a-z][a-z0-9-]*$/),
}).strict()

export const CanvasPreviewSessionResponseSchema = z.object({
  moduleBase: z
    .string()
    .regex(
      /^\/__design_canvas_preview\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/$/,
    ),
  componentFile: z
    .string()
    .regex(/^[^/\\\0-\x1f\x7f?#]+\.tsx$/),
  expiresAt: z.string().datetime(),
}).strict()

const LayoutDecisionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('installed'),
    id: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.object({
    kind: z.literal('temporary'),
    reason: z.string().min(1),
  }),
])

export const RawCanvasProposalSchema = z.object({
  mode: z.enum(['create', 'update']),
  summary: z.array(z.string().min(1)).min(1),
  layout: LayoutDecisionSchema,
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        source: z.string(),
      }),
    )
    .min(1),
  reusedComponents: z.array(z.string()),
  newSharedComponents: z.array(z.string()),
  preserved: z.array(z.string()),
  validationChecks: z.array(z.string().min(1)).min(1),
})

export const LayoutRecommendationArgsSchema = z.object({
  layoutId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  reason: z.string().min(1),
  previewUrl: z.string().min(1),
})

export const CanvasProposalCardArgsSchema = z.object({
  proposalId: z.string().min(1),
  mode: z.enum(['create', 'update']),
  summary: z.array(z.string().min(1)).min(1),
  styleId: z.string().min(1),
  layout: LayoutDecisionSchema,
  changedFiles: z.array(z.string().min(1)).min(1),
  reusedComponents: z.array(z.string()),
  newSharedComponents: z.array(z.string()),
  preserved: z.array(z.string()),
  validationChecks: z.array(z.string().min(1)).min(1),
  candidateFiles: z
    .array(
      z.object({
        path: z.string().min(1),
        source: z.string(),
      }),
    )
    .min(1),
  expiresAt: z.string().datetime(),
})

export const CanvasToolResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('installed'), layoutId: z.string().min(1) }),
  z.object({ status: z.literal('rejected'), reason: z.string().min(1) }),
  z.object({ status: z.literal('applied'), proposalId: z.string().min(1) }),
  z.object({
    status: z.literal('failed'),
    proposalId: z.string().optional(),
    error: z.string().min(1),
  }),
])

export const CanvasRunEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run-result'),
    value: z.object({
      content: z.array(z.unknown()),
      status: z.unknown().optional(),
      metadata: z.unknown().optional(),
    }),
  }),
  z.object({ type: z.literal('error'), error: z.string().min(1) }),
])

export const CanvasApplyEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('status'),
    phase: z.enum(['checking', 'writing', 'validating', 'repairing']),
    attempt: z.number().int().min(1).max(2).optional(),
  }),
  z.object({
    type: z.literal('complete'),
    result: z.discriminatedUnion('ok', [
      z.object({
        ok: z.literal(true),
        proposalId: z.string().min(1),
        repairAttempts: z.number().int().min(0).max(2),
      }),
      z.object({
        ok: z.literal(false),
        proposalId: z.string().min(1),
        error: z.string().min(1),
        rolledBack: z.boolean(),
      }),
    ]),
  }),
])

export type CanvasChatRequest = z.infer<typeof CanvasChatRequestSchema>
export type CanvasCaptureRequest = z.infer<
  typeof CanvasCaptureRequestSchema
>
export type CanvasCaptureResponse = z.infer<
  typeof CanvasCaptureResponseSchema
>
export type CanvasApplyEvent = z.infer<typeof CanvasApplyEventSchema>
export type CanvasPreviewSessionRequest = z.infer<
  typeof CanvasPreviewSessionRequestSchema
>
export type CanvasPreviewSessionResponse = z.infer<
  typeof CanvasPreviewSessionResponseSchema
>
export type RawCanvasProposal = z.infer<typeof RawCanvasProposalSchema>
export type CanvasProposalCardArgs = z.infer<
  typeof CanvasProposalCardArgsSchema
>
export type LayoutRecommendationArgs = z.infer<
  typeof LayoutRecommendationArgsSchema
>
export type CanvasToolResult = z.infer<typeof CanvasToolResultSchema>
