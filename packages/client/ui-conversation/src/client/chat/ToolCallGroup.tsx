/** Collapsed step-level presentation for a run of tool calls and reasoning blocks. */
import { memo, useEffect, useState } from 'react'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatViewSlotProps, ChatNodeOwnerProps } from '../contract/slots.ts'
import { ChatNodeSeat } from './ChatNodeSeat.tsx'
import { ReasoningRow } from './ReasoningRow.tsx'
import {
  assistantReasoningAt, reasoningIsStreamingTail, type FlowNode, type ToolGroupItem,
} from './ChatView.tsx'
import css from './ToolCallGroup.module.css'

function compactDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours > 0 ? `${hours}h` : ''}${minutes > 0 || hours > 0 ? `${minutes}m` : ''}${seconds}s`
}

interface ToolCallGroupProps {
  readonly items: readonly ToolGroupItem[]
  readonly running: boolean
  readonly durationMs: number | null
  readonly nodeStore: { get(key: string): ChatConversationViewNode | undefined }
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

/** Renders one step's tools and reasoning blocks under a minimal native disclosure label. */
export const ToolCallGroup = memo(function ToolCallGroup({
  items, running, durationMs, nodeStore, useSession, selectedCallId, cwd, openFile, inspectCall,
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
        {items.map((item) => {
          if (item.kind === 'reasoning') {
            const node = nodeStore.get(item.nodeKey) as FlowNode | undefined
            const text = assistantReasoningAt(node ?? { kind: '' } as FlowNode, item.blockIndex)
            if (text === null) return null
            const streaming = reasoningIsStreamingTail(node ?? { kind: '' } as FlowNode, item.blockIndex)
            return <ReasoningRow key={`reasoning:${item.nodeKey}:${item.blockIndex}`} text={text} running={streaming} t={t} />
          }
          return (
            <ChatNodeSeat
              key={item.nodeKey}
              nodeKey={item.nodeKey}
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
          )
        })}
      </div>
    </details>
  )
})
