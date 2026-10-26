// Yuyuko beside the chat, showing what the session is doing, like Codex pets:
// working while a turn runs, fan to face while a permission is waiting on you,
// a "review" fidget when a turn ends, the "failed" row on errors, asleep after
// a long quiet spell. Every hook passes its event on unchanged, so the mod
// never blocks or alters Claude; a hook that fails is simply skipped.
//
// Pictures: assets/frames/*.svg, one still frame each, and hooks/frames.ts,
// the frame sequence per mood, both generated (build_svgs.py) from the
// accepted v2.8.7 atlas. The desktop app draws still
// Svgs but did not run SMIL animation (tested 2026-10-26), so she is animated
// here by swapping frames on a timer.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Mood } from '../types'
import { FRAMES, SIZE } from './frames'

const PANE = 'yuyuko'
const TITLE = 'Yuyuko'
const REVIEW_MS = 8_000 // "done" fidget before settling to idle
const SLEEP_MS = 5 * 60_000 // quiet time before she falls asleep
const MIN_FRAME_MS = 100 // never redraw faster than 10 times a second

const mood = atom({ plugin: 'yuyuko-companion', key: 'mood' } as const, 'idle' as Mood)
const detail = atom({ plugin: 'yuyuko-companion', key: 'detail' } as const, '')
const frame = atom({ plugin: 'yuyuko-companion', key: 'frame' } as const, 0)

const LABEL: Record<Mood, string> = {
  idle: 'resting',
  working: 'working',
  waiting: 'waiting for you',
  review: 'done; have a look',
  wave: 'hello',
  failed: 'something went wrong',
  sleep: 'asleep',
}

// Module variables start over on every reload; the atoms survive it.
const svgs = new Map<string, string>()
let settle: Timer | undefined
let anim: Timer | undefined
let playing: Mood | undefined

async function svgOf($: EngineInterface, file: string): Promise<string | undefined> {
  if (!svgs.has(file)) {
    try {
      svgs.set(file, await $.fs.read(`${$.plugin.root}/assets/frames/${file}`))
    } catch {
      return undefined // missing asset: the pane falls back to text
    }
  }
  return svgs.get(file)
}

/** Step through the mood's frames on its own timing; a play-once mood holds its last. */
function play($: EngineInterface, m: Mood) {
  anim?.cancel()
  playing = m
  const { frames, loops } = FRAMES[m]
  let i = 0
  const schedule = () => {
    anim = $.clock.after(Math.max(MIN_FRAME_MS, frames[i][1]), () => {
      if (playing !== m) return
      if (i + 1 >= frames.length && !loops) return
      i = (i + 1) % frames.length
      void update($, frame, () => i)
      schedule()
    })
  }
  void update($, frame, () => 0)
  if (frames.length > 1) schedule()
}

/** Set the mood; `then` is where she drifts to after `ms` without news. */
async function setMood($: EngineInterface, m: Mood, text = '', then?: { mood: Mood; ms: number }) {
  settle?.cancel()
  if (m !== playing) play($, m) // repeated tool calls keep the loop running
  await update($, mood, () => m)
  await update($, detail, () => text)
  const next = then ?? (m === 'idle' ? { mood: 'sleep' as Mood, ms: SLEEP_MS } : undefined)
  if (next) {
    settle = $.clock.after(next.ms, () => {
      void setMood($, next.mood)
    })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'yuyuko', description: 'Show Yuyuko in a pane beside the chat' })
    void $.ui.open({ id: PANE, title: TITLE })
    await setMood($, 'wave', '', { mood: 'idle', ms: 2_400 })
    return next(e)
  })

  on('command.run', { command: 'yuyuko' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Yuyuko is in the pane beside the chat.' }
  })

  // Turns also start and end inside subagents' runs (agentId set); she
  // follows the main conversation only, or a subagent finishing would read
  // as "done" while the main turn still runs.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await setMood($, 'working')
    return next(e)
  })

  // These three sit where an answer could refuse something. `.catch` makes a
  // failure here pass the event on (or replay what it already settled to),
  // never refuse it or run it twice.
  on('tool.call', async ($, e, next) => {
    if ((await read($, mood)) !== 'waiting') await setMood($, 'working', String(e.tool))
    return next(e)
  }).catch(($, e, next) => next(e))

  // Raised when Claude Code is about to ask you to allow a tool.
  on('classic.PermissionRequest', async ($, e, next) => {
    await setMood($, 'waiting', `may I use ${String(e.tool_name)}?`)
    const answered = await next(e)
    await setMood($, 'working')
    return answered
  }).catch(($, e, next) => next(e))

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type.includes('permission')) await setMood($, 'waiting', e.message)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    if (e.reason === 'answer') await setMood($, 'review', '', { mood: 'idle', ms: REVIEW_MS })
    else if (e.reason === 'aborted') await setMood($, 'idle')
    else await setMood($, 'failed', e.reason, { mood: 'idle', ms: 60_000 })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text } = table
    const m = await read($, mood)
    const d = await read($, detail)
    const frames = FRAMES[m].frames
    const file = frames[(await read($, frame)) % frames.length][0]
    const label = d ? `${LABEL[m]} · ${d}` : LABEL[m]
    // Only the remote surfaces (desktop, editor, mobile) draw Svg; the
    // terminal gets her state as text.
    const Svg = 'Svg' in table ? table.Svg : undefined
    const source = Svg ? await svgOf($, file) : undefined

    return (
      <Box flexDirection="column" alignItems="center">
        {Svg && source ? <Svg source={source} alt={`Yuyuko: ${label}`} {...SIZE} /> : <Text>Yuyuko</Text>}
        <Text dimColor>{label}</Text>
      </Box>
    )
  })
}
