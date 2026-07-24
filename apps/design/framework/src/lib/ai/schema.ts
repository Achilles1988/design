import { z } from 'zod'

export const FilterDeltaAddSchema = z.object({
  kind: z.enum(['tag', 'origin', 'freeform']),
  label: z.string(),
  value: z.string(),
})

export const ApplyFilterArgsSchema = z.object({
  add: z.array(FilterDeltaAddSchema).default([]),
  remove: z.array(z.string()).default([]),
})

const ApplyFilterAppliedSchema = z.object({
  add: z.array(FilterDeltaAddSchema),
  remove: z.array(z.string()),
})

export const ApplyFilterResultSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    applied: ApplyFilterAppliedSchema,
    matchCount: z.number().int().nonnegative(),
    changed: z.boolean(),
  }),
  z.object({
    success: z.literal(false),
    applied: z.object({
      add: z.array(FilterDeltaAddSchema).max(0),
      remove: z.array(z.string()).max(0),
    }),
    matchCount: z.number().int().nonnegative(),
    changed: z.literal(false),
    error: z.string(),
  }),
])
