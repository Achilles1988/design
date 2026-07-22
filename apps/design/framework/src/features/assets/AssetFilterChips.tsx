import type { Filter } from '@/lib/ai/filterState'

type Props = {
  filter: Filter
  onRemove: (chipId: string) => void
  onReset: () => void
}

export function AssetFilterChips({ filter, onRemove, onReset }: Props) {
  if (filter.chips.length === 0) return null
  return (
    <div className="assets-chips" role="list" aria-label="Active filters">
      {filter.chips.map((chip) => (
        <span
          key={chip.id}
          role="listitem"
          className={`assets-chip assets-chip--${chip.kind} assets-chip--by-${chip.addedBy}`}
          title={chip.value}
        >
          <span className="assets-chip__label">{chip.label}</span>
          <button
            type="button"
            className="assets-chip__remove"
            aria-label={`Remove ${chip.label}`}
            onClick={() => onRemove(chip.id)}
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        className="assets-chips__reset"
        onClick={onReset}
      >
        Reset all
      </button>
    </div>
  )
}
