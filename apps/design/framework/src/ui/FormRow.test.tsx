// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FormRow } from './FormRow'

afterEach(cleanup)

describe('FormRow', () => {
  it('keeps consumer-provided label semantics and renders the control', () => {
    render(
      <FormRow label={<label htmlFor="model">Model</label>}>
        <input id="model" />
      </FormRow>,
    )

    expect(screen.getByLabelText('Model')).toBeTruthy()
  })

  it('renders optional hint and error content in the control column', () => {
    render(
      <FormRow
        label={<span>API key</span>}
        hint="Stored locally"
        hintId="api-key-hint"
        error="Required"
        errorId="api-key-error"
      >
        <input aria-label="API key" aria-describedby="api-key-hint api-key-error" />
      </FormRow>,
    )

    expect(screen.getByText('Stored locally').id).toBe('api-key-hint')
    expect(screen.getByRole('alert').id).toBe('api-key-error')
    expect(screen.getByLabelText('API key').getAttribute('aria-describedby')).toBe(
      'api-key-hint api-key-error',
    )
  })
})
