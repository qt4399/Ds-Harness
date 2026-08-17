/** Assistant reasoning disclosure, independent of Tool-call presentation. */
import { useEffect, useRef, useState } from 'react'
import { DisclosureRow, IconThinkOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import a11yCss from './accessibility.module.css'
import css from './ReasoningRow.module.css'

/**
 * Render one assistant reasoning block as the Think disclosure row.
 * @param props.text - complete or streaming reasoning text.
 * @param props.running - whether this block is the streaming tail.
 * @param props.t - conversation locale seat for the running status.
 * @returns the reasoning disclosure.
 */
function estimatedTokenCount(text: string): number {
  return Math.ceil([...text].length / 4)
}

function useAnimatedTokenCount(target: number, running: boolean): number {
  const [count, setCount] = useState(target)
  const displayed = useRef(target)
  useEffect(() => {
    if (!running || target <= displayed.current) {
      displayed.current = target
      setCount(target)
      return
    }
    const start = displayed.current
    const startedAt = performance.now()
    let frame = 0
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / 320)
      const next = Math.round(start + (target - start) * progress)
      displayed.current = next
      setCount(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame) }
  }, [running, target])
  return count
}

export function ReasoningRow({ text, running, t }: { text: string; running: boolean; t: ChatViewSlotProps['t'] }) {
  const [expanded, setExpanded] = useState(false)
  const tokenCount = useAnimatedTokenCount(estimatedTokenCount(text), running)

  return (
    <div className={css.root} data-variant="think" data-state={running ? 'running' : 'ok'}>
      {running && <span className={a11yCss.visuallyHidden}>{t('row.running')}</span>}
      <DisclosureRow
        rowClassName={css.row}
        leadingClassName={css.leading}
        titleClassName={css.title}
        chevronClassName={css.chevron}
        icon={<IconThinkOutline14 size={14} />}
        title="Think"
        open={expanded}
        expandable
        expandOnRowClick
        onToggle={() => { setExpanded(value => !value) }}
        collapsedContent={(
          <span className={css.count}>{t('chat.thinkTokens', { count: tokenCount })}</span>
        )}
      >
        <div className={css.thinkBody}>{text}</div>
      </DisclosureRow>
    </div>
  )
}
