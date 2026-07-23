import { z } from 'zod'

export const FilterDeltaAddSchema = z.object({
  kind: z.enum(['tag', 'origin', 'freeform']),
  label: z.string(),
  value: z.string(),
})
