/** Collapsed step-level presentation for a run of tool calls. */
import { memo, useEffect, useState } from 'react'
import type { ChatViewSlotProps, ChatNodeOwnerProps } from '../contract/slots.ts'
import { ChatNodeSeat } from './ChatNodeSeat.tsx'
import css from './ToolCallGroup.module.css'

function compactDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours > 0 ? `${hours}h` : ''}${minutes > 0 || hours > 0 ? `${minutes}m` : ''}${seconds}s`
}

interface ToolCallGroupProps {
  readonly nodeKeys: readonly string[]
  readonly running: boolean
  readonly durationMs: number | null
  readonly useSession: ChatViewSlotProps['useSession']
  readonly selectedCallId: ChatNodeOwnerProps['selectedCallId']
  readonly cwd: ChatNodeOwnerProps['cwd']
  readonly openFile: ChatNodeOwnerProps['openFile']
  readonly inspectCall: ChatNodeOwnerProps['inspectCall']
  readonly forkAt: ChatNodeOwnerProps['forkAt']
  readonly loadImage: ChatNodeOwnerProps['loadImage']
  readonly fileMentions: ChatNodeOwnerProps['fileMentions']
  readonly renderSlot: ChatViewSlotProps['renderSlot']
  readonly t: ChatViewSlotProps['t']
}

/** Renders one step's tools under a minimal native disclosure label. */
export const ToolCallGroup = memo(function ToolCallGroup({
  nodeKeys, running, durationMs, useSession, selectedCallId, cwd, openFile, inspectCall,
  forkAt, loadImage, fileMentions, renderSlot, t,
}: ToolCallGroupProps) {
  const [open, setOpen] = useState(running)

  useEffect(() => {
    setOpen(running)
  }, [running])

  return (
    <details
      className={css.root}
      data-tool-group
      data-running={running || undefined}
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary className={css.summary} role="status">
        {running
          ? t('chat.thinking')
          : durationMs === null
            ? t('chat.thought')
            : t('chat.thoughtDuration', {
              duration: compactDuration(durationMs),
            })}
      </summary>
      <div className={css.calls}>
        {nodeKeys.map(nodeKey => (
          <ChatNodeSeat
            key={nodeKey}
            nodeKey={nodeKey}
            useSession={useSession}
            selectedCallId={selectedCallId}
            cwd={cwd}
            openFile={openFile}
            inspectCall={inspectCall}
            forkAt={forkAt}
            loadImage={loadImage}
            fileMentions={fileMentions}
            renderSlot={renderSlot}
            t={t}
          />
        ))}
      </div>
    </details>
  )
})
