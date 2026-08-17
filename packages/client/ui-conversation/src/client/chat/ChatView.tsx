// ChatView: the default conversation view — one stable keyed parent list over
// final business Nodes, plus paging, pending steering and bottom-follow.
// Each row dispatches through 'conversation.chat.node'; ui-tool owns the
// tool-call renderer and its recursive root/subcall composition.
//
// Scroll: when nested under `[data-conversation-scroll]` (active conversation
// column), that host is the scrollport and this view is flow content; when
// mounted alone (unit tests), `.scroll` owns overflow. Bottom-follow and
// prepend anchoring always target the resolved scrollport.
//
// Render economics: order changes only when rows enter, leave or move. Each
// ChatNodeSeat subscribes to one Node key, so Assistant deltas and Tool
// lifecycle updates replace only their own row without remounting it.

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChatConversationViewNode, ConversationTimelineSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { PendingSteeringBubble } from './MessageItem.tsx'
import { ChatNodeSeat } from './ChatNodeSeat.tsx'
import { ToolCallGroup } from './ToolCallGroup.tsx'
import { ReasoningRow } from './ReasoningRow.tsx'
import { formatRunDuration } from './message-chrome.ts'
import css from './ChatView.module.css'

const FOLLOW_THRESHOLD = 24

/** Active column host when present; otherwise the view-local scroller. */
function scrollerOf(from: HTMLElement): HTMLElement {
  return (from.closest('[data-conversation-scroll]')) ?? from
}

interface PagingAnchor {
  /** Stable node/call identity, independent of boundary-spanning group keys. */
  key: string
  /** Row top relative to the scrollport after the latest user scroll. */
  top: number
}

/** Find an already-rendered settled row without interpolating a selector. */
function anchorElement(list: HTMLElement, key: string): HTMLElement | null {
  for (const row of list.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')) {
    if (row.dataset.chatAnchorKey === key) return row
  }
  return null
}

/** Row position in scrollport coordinates (viewport-independent). */
function flowTop(row: HTMLElement, scrollport: HTMLElement): number {
  return row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top
}

/** Select a visible stable node/call identity, falling back only when layout
 * has not exposed a visible box yet. */
function pagingAnchor(list: HTMLElement, scrollport: HTMLElement): HTMLElement | null {
  const viewport = scrollport.getBoundingClientRect()
  const composer = scrollport.querySelector<HTMLElement>('[data-composer-seat]')
  const visibleBottom = composer?.getBoundingClientRect().top ?? viewport.bottom
  // Scroll events are hot: hit-test a few points through the stretched flow
  // rows before considering the full mounted set. The fallback keeps jsdom
  // and pre-layout states deterministic; a virtualizer naturally bounds it.
  if (typeof document.elementsFromPoint === 'function' && visibleBottom > viewport.top) {
    const content = list.getBoundingClientRect()
    const left = Math.max(viewport.left, content.left)
    const right = Math.min(viewport.right, content.right)
    const x = left + Math.max(0, right - left) / 2
    const height = visibleBottom - viewport.top
    const points = [1, Math.min(32, height / 3), height / 2, Math.max(1, height - 1)]
    for (const offset of points) {
      for (const element of document.elementsFromPoint(x, viewport.top + offset)) {
        const row = element instanceof HTMLElement
          ? element.closest<HTMLElement>('[data-chat-anchor-key]')
          : null
        if (row !== null && list.contains(row)) return row
      }
    }
  }
  const rows = [...list.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')]
  const visibleRows = rows.filter((row) => {
    const rect = row.getBoundingClientRect()
    return rect.bottom > viewport.top && rect.top < visibleBottom
  })
  return visibleRows[0] ?? rows[0] ?? null
}

type ChatScrollPosition = NonNullable<ReturnType<ChatViewSlotProps['chatScroll']['read']>>

/** Capture a reflow-resistant reader position from the current rendered window. */
function scrollPosition(list: HTMLElement, scrollport: HTMLElement): ChatScrollPosition | null {
  const row = pagingAnchor(list, scrollport)
  const anchorKey = row?.dataset.chatAnchorKey
  if (row === null || anchorKey === undefined) return null
  return {
    anchorKey,
    anchorTop: flowTop(row, scrollport),
    scrollTop: scrollport.scrollTop,
  }
}

function runningTurnStartTime(timeline: ConversationTimelineSnapshot): number | null {
  let latest: number | null = null
  for (const turn of timeline.turns.values()) {
    if (turn.status === 'open' && turn.start !== undefined) latest = turn.start.time
  }
  return latest
}

/**
 * One item in a tool group's disclosure body: either a tool call or a
 * hoisted reasoning block, in source order.
 */
export type ToolGroupItem =
  | { readonly kind: 'tool'; readonly nodeKey: string }
  | { readonly kind: 'reasoning'; readonly nodeKey: string; readonly blockIndex: number }

type FlowEntry =
  | { readonly kind: 'node'; readonly nodeKey: string }
  | { readonly kind: 'tools'; readonly items: readonly ToolGroupItem[]; readonly turn: number | null; readonly running: boolean }
  | { readonly kind: 'reasoning'; readonly nodeKey: string; readonly blockIndex: number }

export type FlowNode = ChatConversationViewNode & { readonly kind: string }

function assistantHasVisibleText(node: FlowNode): boolean {
  if (node.kind !== 'assistant-step') return false
  const data = node.data as { readonly blocks?: readonly { readonly kind?: string; readonly text?: string }[] }
  return data.blocks?.some(block => (
    block.kind === 'text' && typeof block.text === 'string' && block.text.trim() !== ''
  )) === true
}

/**
 * Read the reasoning block at a given index from an assistant node.
 * @param node - the assistant-step flow node.
 * @param blockIndex - index into the node's blocks array.
 * @returns the reasoning text, or null when the block is absent or not a non-empty reasoning block.
 */
export function assistantReasoningAt(node: FlowNode, blockIndex: number): string | null {
  if (node.kind !== 'assistant-step') return null
  const data = node.data as { readonly blocks?: readonly { readonly kind?: string; readonly text?: string }[] }
  const block = data.blocks?.[blockIndex]
  if (block === undefined || block.kind !== 'reasoning' || typeof block.text !== 'string' || block.text.trim() === '') return null
  return block.text
}

/**
 * Whether a reasoning block is the streaming tail: its owning node is in an
 * open turn and this is the last block in the node's block list.
 * @param node - the assistant-step flow node.
 * @param blockIndex - index into the node's blocks array.
 * @returns true when the block is actively streaming.
 */
export function reasoningIsStreamingTail(node: FlowNode, blockIndex: number): boolean {
  if (node.kind !== 'assistant-step') return false
  const data = node.data as { readonly status?: string; readonly blocks?: readonly { readonly kind?: string }[] }
  if (data.status !== 'running') return false
  const blocks = data.blocks ?? []
  return blockIndex === blocks.length - 1
}

function activeTurnNumber(timeline: ConversationTimelineSnapshot): number | null {
  let active: number | null = null
  for (const turn of timeline.turns.values()) {
    if (turn.status === 'open' && (active === null || turn.turn > active)) active = turn.turn
  }
  return active
}

function hasVisibleAssistantInOpenTurn(
  order: readonly string[],
  nodes: { get(key: string): ChatConversationViewNode | undefined },
  timeline: ConversationTimelineSnapshot,
): boolean {
  const activeTurn = activeTurnNumber(timeline)
  if (activeTurn === null) return false
  return order.some((nodeKey) => {
    const node = nodes.get(nodeKey) as FlowNode | undefined
    if (node === undefined || !assistantHasVisibleText(node)) return false
    if (node.location.kind !== 'step' && node.location.kind !== 'turn') return false
    return node.location.turn.turn === activeTurn
  })
}

function nodeTurn(node: FlowNode): number | null {
  if (node.location.kind !== 'step' && node.location.kind !== 'turn') return null
  return node.location.turn.turn
}

function flushTools(entries: FlowEntry[], items: ToolGroupItem[], turn: number | null): void {
  if (items.length === 0) return
  entries.push({ kind: 'tools', items: [...items], turn, running: false })
  items.length = 0
}

function toolCallId(node: FlowNode): string | null {
  if (node.kind !== 'tool-call') return null
  const root = (node.data as { readonly root?: { readonly callId?: string } }).root
  return typeof root?.callId === 'string' && root.callId !== '' ? root.callId : null
}

function assistantToolCallIds(node: FlowNode): ReadonlySet<string> {
  if (node.kind !== 'assistant-step') return new Set()
  const data = node.data as { readonly blocks?: readonly { readonly kind?: string; readonly callId?: string }[] }
  return new Set(data.blocks
    ?.filter((block): block is { readonly kind: 'tool-call'; readonly callId: string } => (
      block.kind === 'tool-call' && typeof block.callId === 'string' && block.callId !== ''
    ))
    .map(block => block.callId))
}

/**
 * Build one disclosure group for each uninterrupted tool phase. Assistant block
 * order places reasoning and its matching tool call together; a tool that is
 * absent from the Assistant blocks remains in durable event order.
 */
function flowEntries(
  order: readonly string[],
  nodes: { get(key: string): ChatConversationViewNode | undefined },
  timeline: ConversationTimelineSnapshot,
  sessionRunning: boolean,
): FlowEntry[] {
  const entries: FlowEntry[] = []
  const items: ToolGroupItem[] = []
  const toolsByCallId = new Map<string, string>()
  const referencedToolIds = new Set<string>()
  const consumedToolIds = new Set<string>()
  const activeTurn = activeTurnNumber(timeline)
  let toolTurn: number | null = null

  for (const nodeKey of order) {
    const node = nodes.get(nodeKey) as FlowNode | undefined
    const callId = node === undefined ? null : toolCallId(node)
    if (callId !== null) toolsByCallId.set(callId, nodeKey)
    if (node !== undefined) {
      for (const toolId of assistantToolCallIds(node)) referencedToolIds.add(toolId)
    }
  }

  for (const nodeKey of order) {
    const node = nodes.get(nodeKey) as FlowNode | undefined
    if (node === undefined) continue
    if (node.kind === 'tool-call') {
      const callId = toolCallId(node)
      if (callId !== null && referencedToolIds.has(callId)) continue
      const turn = nodeTurn(node)
      if (items.length > 0 && toolTurn !== turn) flushTools(entries, items, toolTurn)
      toolTurn = turn
      items.push({ kind: 'tool', nodeKey })
      continue
    }

    if (node.kind === 'assistant-step') {
      const data = node.data as {
        readonly blocks?: readonly { readonly kind?: string; readonly callId?: string; readonly text?: string }[]
      }
      const blocks = data.blocks ?? []
      const visibleText = assistantHasVisibleText(node)
      for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
        const block = blocks[blockIndex]
        if (block?.kind === 'reasoning' && typeof block.text === 'string' && block.text.trim() !== '') {
          toolTurn ??= nodeTurn(node)
          items.push({ kind: 'reasoning', nodeKey, blockIndex })
          continue
        }
        if (block?.kind !== 'tool-call' || typeof block.callId !== 'string') continue
        const toolNodeKey = toolsByCallId.get(block.callId)
        if (toolNodeKey === undefined || consumedToolIds.has(block.callId)) continue
        const toolNode = nodes.get(toolNodeKey) as FlowNode | undefined
        const turn = toolNode === undefined ? nodeTurn(node) : nodeTurn(toolNode)
        if (items.length > 0 && toolTurn !== null && toolTurn !== turn) flushTools(entries, items, toolTurn)
        toolTurn = turn
        items.push({ kind: 'tool', nodeKey: toolNodeKey })
        consumedToolIds.add(block.callId)
      }
      if (visibleText) {
        flushTools(entries, items, toolTurn)
        toolTurn = null
        entries.push({ kind: 'node', nodeKey })
      }
      continue
    }

    flushTools(entries, items, toolTurn)
    toolTurn = null
    entries.push({ kind: 'node', nodeKey })
  }
  flushTools(entries, items, toolTurn)

  const lastToolIndex = entries.findLastIndex(entry => entry.kind === 'tools')
  return entries.map((entry, index) => entry.kind === 'tools'
    ? {
      ...entry,
      running: sessionRunning
          && index === lastToolIndex
          && (entry.turn === null || entry.turn === activeTurn)
          && entry.items.some(item => item.kind === 'tool' || reasoningIsStreamingTail(
            nodes.get(item.nodeKey) as FlowNode ?? { kind: '' } as FlowNode,
            item.blockIndex,
          )),
    }
    : entry)
}

/** Turn-level model activity label retained across first-token, tool, and streaming phases. */
function TurnStatus({ startTime, exiting = false, t }: {
  /** The running turn's logged `turn/start` time; null falls back to mount
   *  time when that boundary is outside the window. */
  startTime: number | null
  /** Keeps the label mounted briefly while streaming prose fades in. */
  exiting?: boolean
  /** The owning view's locale seat. */
  t: ChatViewSlotProps['t']
}) {
  const [mountedAt] = useState(() => Date.now())
  // Anchored to turn/start so a mid-turn reload keeps the real
  // elapsed time and the final footer's Ran-for label matches this clock.
  const anchor = startTime ?? mountedAt
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - anchor))
  useEffect(() => {
    const tick = (): void => {
      setElapsedMs(Math.max(0, Date.now() - anchor))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => { clearInterval(id) }
  }, [anchor])
  // Short turns keep the plain label; the clock only appears once the turn
  // has clearly been running for a while.
  const showClock = elapsedMs >= 15_000
  return (
    <div className={css.turnStatus} data-exiting={exiting || undefined} role="status" aria-live="polite">
      {t('chat.thinking')}
      {showClock && (
        <span className={css.turnStatusClock} aria-hidden>
          {formatRunDuration(elapsedMs, t)}
        </span>
      )}
    </div>
  )
}

/**
 * The chat view slot entry: pure component over the composed props; each
 * ordered business Node crosses the keyed renderer seat.
 */
export function ChatView({
  useSession, useSessions, useStore, renderSlot, sessionId, openFile, loadOlder, loadImage, inspectCall, chatScroll, forkAt,
  fileMentions, t,
}: ChatViewSlotProps) {
  const order = useSession(s => s.chat.order)
  const nodeStore = useSession(s => s.chat.nodes)
  const timeline = useSession(s => s.chat.timeline)
  const inbox = useSession(s => s.queue)
  // Workspace root off the session list row: path summaries display relative to it.
  const cwd = useSessions(s => s.byId[sessionId]?.cwd)
  const running = useSession(s => s.running)
  const composerPhase = useSession(s => s.composerPhase)
  const openState = useSession(s => s.openState)
  const openError = useSession(s => s.openError)
  const hasMore = useSession(s => s.hasMore)
  const loadingOlder = useSession(s => s.loadingOlder)
  const selectedCallId = useStore(s => s.selection?.callId)

  const pendingSteering = useMemo(
    () => inbox.filter(item => item.placement === 'steering'),
    [inbox],
  )
  const runningTurnStart = useMemo(() => runningTurnStartTime(timeline), [timeline])

  const listRef = useRef<HTMLDivElement | null>(null)
  const columnRef = useRef<HTMLDivElement | null>(null)
  const atBottomRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  /** Last position delivered or written on the main thread. */
  const observedTopRef = useRef(0)
  /** Paging anchor: semantic row/position at click, updated by reader scrolls
   * while the request is pending and restored after the prepend lands. */
  const anchorRef = useRef<PagingAnchor | null>(null)
  const firstSeqRef = useRef<number | null>(null)
  const openedRef = useRef(false)
  const lastKeyRef = useRef<string | null>(null)
  const lastSteeringIdRef = useRef<string | null>(null)
  /** Flow tip signature — follow-scroll only when this moves, never on a
   *  scroll-driven at-bottom chrome re-render (which would snap inertial
   *  scrolls the rest of the way to the floor). */
  const followSigRef = useRef<string | null>(null)

  const firstKey = order[0]
  const firstSeq = firstKey === undefined ? null : nodeStore.get(firstKey)?.anchorSeq ?? null
  const lastKey = order.at(-1) ?? null
  const lastNode = lastKey === null ? undefined : nodeStore.get(lastKey)
  const activeTurn = useMemo(() => activeTurnNumber(timeline), [timeline])
  const hasVisibleAssistant = useMemo(
    () => hasVisibleAssistantInOpenTurn(order, nodeStore, timeline),
    [nodeStore, order, timeline],
  )
  const entries = useMemo(
    () => flowEntries(order, nodeStore, timeline, running),
    [nodeStore, order, running, timeline],
  )
  const activeTurnHasTools = useMemo(
    () => activeTurn !== null && entries.some(entry => entry.kind === 'tools' && entry.turn === activeTurn),
    [activeTurn, entries],
  )
  const streamingAssistantKey = useMemo(() => {
    const activeTurn = activeTurnNumber(timeline)
    if (activeTurn === null) return null
    return order.find((nodeKey) => {
      const node = nodeStore.get(nodeKey) as FlowNode | undefined
      if (node === undefined || !assistantHasVisibleText(node)) return false
      if (node.location.kind !== 'step' && node.location.kind !== 'turn') return false
      return node.location.turn.turn === activeTurn
    }) ?? null
  }, [nodeStore, order, timeline])
  const showPendingThinking = composerPhase === 'engaging' && !running
  const showTurnThinking = running && !activeTurnHasTools && !hasVisibleAssistant
  const thinkingVisible = showPendingThinking || showTurnThinking
  const [showThinking, setShowThinking] = useState(thinkingVisible)
  const [thinkingExiting, setThinkingExiting] = useState(false)
  const lastSteeringId = pendingSteering[pendingSteering.length - 1]?.id ?? null
  const followSig = `${openState}:${firstSeq}:${lastKey}:${order.length}:${running ? 1 : 0}:${lastSteeringId ?? ''}`

  useEffect(() => {
    if (thinkingVisible) {
      setShowThinking(true)
      setThinkingExiting(false)
      return
    }
    if (!showThinking) return
    setThinkingExiting(true)
    const id = window.setTimeout(() => {
      setShowThinking(false)
      setThinkingExiting(false)
    }, 320)
    return () => { window.clearTimeout(id) }
  }, [showThinking, thinkingVisible])

  const toBottom = (el: HTMLElement): void => {
    anchorRef.current = null
    el.scrollTop = el.scrollHeight
    observedTopRef.current = el.scrollTop
    atBottomRef.current = true
    setAtBottom(true)
    chatScroll.save(null)
  }

  useLayoutEffect(() => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: React attaches the ref before layout effects run. */
    if (local === null) return
    const el = scrollerOf(local)
    // Open completed: jump to the bottom once — unless a scroll position
    // survives from a previous mount (view-tab switch away and back), which
    // is restored instead of snapping the reader back to the floor.
    if (openState === 'open' && !openedRef.current) {
      openedRef.current = true
      const saved = chatScroll.read()
      if (saved === null) {
        toBottom(el)
      } else {
        el.scrollTop = saved.scrollTop
        const row = anchorElement(local, saved.anchorKey)
        if (row !== null) el.scrollTop += flowTop(row, el) - saved.anchorTop
        observedTopRef.current = el.scrollTop
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD + 1
        atBottomRef.current = isAtBottom
        setAtBottom(isAtBottom)
        const normalized = isAtBottom ? null : scrollPosition(local, el)
        if (isAtBottom) chatScroll.save(null)
        else if (normalized !== null) chatScroll.save(normalized)
      }
      firstSeqRef.current = firstSeq
      lastKeyRef.current = lastKey
      lastSteeringIdRef.current = lastSteeringId
      followSigRef.current = followSig
      return
    }
    // Prepend (head seq decreased): preserve the same settled row at the
    // position established by the reader's latest scroll. This excludes
    // unrelated tail/composer growth while the request was in flight.
    if (anchorRef.current !== null && firstSeq !== null && firstSeqRef.current !== null && firstSeq < firstSeqRef.current) {
      const anchor = anchorRef.current
      anchorRef.current = null
      const row = anchorElement(local, anchor.key)
      if (row !== null) el.scrollTop += flowTop(row, el) - anchor.top
      observedTopRef.current = el.scrollTop
      firstSeqRef.current = firstSeq
      /* v8 ignore next -- ?? arm: a prepend adds nodes, so the flow list here is never empty. */
      lastKeyRef.current = lastKey
      lastSteeringIdRef.current = lastSteeringId
      followSigRef.current = followSig
      return
    }
    firstSeqRef.current = firstSeq
    // Own words must be visible: a new trailing user node force-scrolls
    // (send lives in the composer, so arrival is detected here, not armed there).
    const appendedUser = lastKey !== lastKeyRef.current && lastNode?.kind === 'user'
    const appendedSteering = lastSteeringId !== null && lastSteeringId !== lastSteeringIdRef.current
    const tipMoved = followSigRef.current !== followSig
    lastKeyRef.current = lastKey
    lastSteeringIdRef.current = lastSteeringId
    followSigRef.current = followSig
    // Follow new flow content while pinned; do NOT re-pin on every render
    // merely because atBottomRef is true (scroll threshold → setState → snap).
    if (appendedUser || appendedSteering || (tipMoved && atBottomRef.current)) toBottom(el)
  })

  const onScrollRef = useRef(() => {})
  onScrollRef.current = () => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: the handler only fires while mounted. */
    if (local === null) return
    const el = scrollerOf(local)
    // Only reader input may make raw scroll geometry change follow ownership:
    // a delivered position that deviates from the observed-top ledger (every
    // programmatic write records itself there synchronously). This covers
    // wheel, touch, scrollbar, and keyboard alike without naming devices.
    // Browser shrink-clamps land exactly on the floor min and delayed
    // programmatic deliveries land on the ledger itself, so both preserve
    // the current ownership state.
    const floor = Math.max(0, el.scrollHeight - el.clientHeight)
    const movedByReader = Math.abs(el.scrollTop - Math.min(observedTopRef.current, floor)) > 0.5
    const isAtBottom = movedByReader
      ? floor - el.scrollTop <= FOLLOW_THRESHOLD + 1
      : atBottomRef.current
    if (!movedByReader && isAtBottom) {
      toBottom(el)
      return
    }
    atBottomRef.current = isAtBottom
    setAtBottom(isAtBottom)
    const position = isAtBottom ? null : scrollPosition(local, el)
    if (isAtBottom) {
      anchorRef.current = null
    } else if (anchorRef.current !== null && position !== null) {
      anchorRef.current = { key: position.anchorKey, top: position.anchorTop }
    }
    // Continuous save (unmount happens after ref detach, so saving there is
    // too late); pinned-to-bottom clears so a remount keeps following.
    if (isAtBottom) chatScroll.save(null)
    else if (position !== null) chatScroll.save(position)
    observedTopRef.current = el.scrollTop
  }

  // Bind the scroll listener on the resolved scrollport once per mount;
  // reader-input attribution rides the observed-top ledger, not per-device
  // input listeners.
  useEffect(() => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: effect runs after the list node commits. */
    if (local === null) return
    const el = scrollerOf(local)
    const onScroll = (): void => { onScrollRef.current() }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  // The ref starts null and is assigned every render, so the placeholder
  // initializer a function initial value would need never exists.
  const followRef = useRef<(() => void) | null>(null)
  followRef.current = () => {
    const local = listRef.current
    if (local !== null && atBottomRef.current) {
      const el = scrollerOf(local)
      el.scrollTop = el.scrollHeight
      observedTopRef.current = el.scrollTop
      chatScroll.save(null)
    }
  }
  // Streaming, tool disclosures, and other flow changes resize the column;
  // the sticky composer resizes outside it. This observer owns ChatView's
  // dynamic-height follow decisions and writes only while the reader is pinned.
  useEffect(() => {
    const column = columnRef.current
    const local = listRef.current
    if (column === null || local === null || typeof ResizeObserver === 'undefined') return
    const scrollport = scrollerOf(local)
    const composer = scrollport.querySelector<HTMLElement>('[data-composer-seat]')
    const observer = new ResizeObserver(() => { followRef.current?.() })
    observer.observe(column)
    if (composer !== null) observer.observe(composer)
    return () => { observer.disconnect() }
  }, [])

  // A failed/empty page leaves the head unchanged. Once the request leaves
  // its busy state there is no future prepend for the saved anchor to own.
  useEffect(() => {
    if (!loadingOlder) anchorRef.current = null
  }, [loadingOlder])

  const loadOlderAnchored = (): void => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: the paging button renders inside the list tree. */
    if (local !== null) {
      const el = scrollerOf(local)
      const row = pagingAnchor(local, el)
      if (row !== null && row.dataset.chatAnchorKey !== undefined) {
        anchorRef.current = {
          key: row.dataset.chatAnchorKey,
          top: flowTop(row, el),
        }
      }
    }
    loadOlder()
  }

  return (
    <div className={css.root}>
      <div ref={listRef} className={css.scroll}>
        <div ref={columnRef} className={css.column} data-chat-flow="">
          {openState === 'loading' && <div className={css.hint}>{t('chat.loadingHistory')}</div>}
          {openState === 'error' && openError !== null && (
            <div className={css.openError}>
              {t('chat.loadError', { message: openError.message, code: openError.code })}
            </div>
          )}
          {hasMore && (
            <div className={css.older}>
              <button type="button" disabled={loadingOlder} onClick={loadOlderAnchored}>
                {loadingOlder ? t('loading') : t('chat.loadOlder')}
              </button>
            </div>
          )}
          {entries.map((entry) => {
            if (entry.kind === 'reasoning') {
              const node = nodeStore.get(entry.nodeKey) as FlowNode | undefined
              const text = assistantReasoningAt(node ?? { kind: '' } as FlowNode, entry.blockIndex)
              if (text === null) return null
              const streaming = reasoningIsStreamingTail(node ?? { kind: '' } as FlowNode, entry.blockIndex)
              return (
                <Fragment key={`reasoning:${entry.nodeKey}:${entry.blockIndex}`}>
                  <ReasoningRow text={text} running={streaming} t={t} />
                </Fragment>
              )
            }
            if (entry.kind === 'tools') {
              const firstKey = entry.items.find(item => item.kind === 'tool')?.nodeKey ?? entry.items[0]?.nodeKey ?? ''
              return (
                <Fragment key={`tools:${firstKey}`}>
                  <ToolCallGroup
                    items={entry.items}
                    running={entry.running}
                    durationMs={entry.turn === null
                      ? null
                      : (() => {
                        const turn = timeline.turns.get(entry.turn)
                        return turn?.start === undefined || turn.end === undefined
                          ? null
                          : Math.max(0, turn.end.time - turn.start.time)
                      })()}
                    nodeStore={nodeStore}
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
                </Fragment>
              )
            }
            return (
              <Fragment key={entry.nodeKey}>
                {thinkingExiting && entry.nodeKey === streamingAssistantKey && (
                  <TurnStatus startTime={runningTurnStart} exiting t={t} />
                )}
                <ChatNodeSeat
                  nodeKey={entry.nodeKey}
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
              </Fragment>
            )
          })}
          {/* No pending placeholders: questions (ui-user-questions) and approvals
              (ApprovalPanel) both take over the composer, so a flow card would
              double-render the same wait. */}
          {/* Turn-level loading signal: rides the whole running turn (first-token
              wait, tool execution, streaming) so it never flickers per step. */}
          {showThinking && !thinkingExiting && (
            <TurnStatus startTime={runningTurnStart} t={t} />
          )}
          {pendingSteering.map(item => (
            <PendingSteeringBubble key={item.id} content={item.content} loadImage={loadImage} t={t} />
          ))}
        </div>
        {!atBottom && (
          <div className={css.toBottomSlot}>
            <button
              type="button"
              className={css.toBottom}
              aria-label={t('chat.toBottom')}
              onClick={() => {
                const local = listRef.current
                /* v8 ignore next -- ref-null guard: the button only renders alongside the mounted list. */
                if (local !== null) toBottom(scrollerOf(local))
              }}
            >
              <IconChevronDownOutline14 />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
