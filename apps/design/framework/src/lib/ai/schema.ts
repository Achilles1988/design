import { z } from 'zod'

export const FilterDeltaAddSchema = z.object({
  kind: z.enum(['tag', 'origin', 'freeform']),
  label: z.string(),
  value: z.string(),
})

export const ReplySchema = z.object({
  is_relevant: z.boolean(),
  reply: z.string(),
  filter_delta: z
    .object({
      add: z.array(FilterDeltaAddSchema).default([]),
      remove: z.array(z.string()).default([]),
    })
    .default({ add: [], remove: [] }),
  match_hint: z.number().int().optional(),
})

export type Reply = z.infer<typeof ReplySchema>
