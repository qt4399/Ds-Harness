// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { ReasoningRow } from '../src/client/chat/ReasoningRow.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
})

const t = makeTranslate(zh, commonZh)

describe('ReasoningRow', () => {
  it('shows a compact token count while collapsed and prose after expansion', () => {
    const view = render(
      <ReasoningRow text={'Inspect the session\nCheck persistence'} running t={t} />,
    )
    const row = view.getByRole('button')
    expect(view.getByText('运行中')).toBeTruthy()
    expect(view.getByText('· 10 tokens')).toBeTruthy()
    expect(view.queryByText('Inspect the session')).toBeNull()

    fireEvent.click(view.getByText('Think'))
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(view.getByText(/Inspect the session/)).toBeTruthy()
    expect(view.getByText(/Check persistence/)).toBeTruthy()
  })

  it('expanded Think drops the inline summary and renders plain prose, no IN card', () => {
    const view = render(
      <ReasoningRow text={'Inspect the session\nCheck persistence'} running={false} t={t} />,
    )
    fireEvent.click(view.getByText('Think'))
    expect(view.getAllByText(/Inspect the session/)).toHaveLength(1)
    expect(view.queryByText('IN')).toBeNull()
    expect(view.container.querySelector('[class*="ioCard"]')).toBeNull()
    expect(view.container.querySelector('[class*="thinkBody"]')).not.toBeNull()
  })
})
