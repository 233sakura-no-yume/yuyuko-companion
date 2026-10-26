import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'yuyuko-companion',
  component: 'Pane',
  requestId: 'yuyuko',
  props: {
    title: 'Yuyuko',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const SVG = (m: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="104"><title>${m}</title></svg>`

function engine(on: Parameters<Parameters<typeof test>[1]>[1], files = true) {
  on('command.register', () => ({ value: { command: 'yuyuko' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('fs.read', (_, e) => {
    if (!files) throw new Error('missing')
    const m = /frames[\\/]([\w-]+)\.svg$/.exec(String(e.path)) // the engine passes Windows separators
    return { value: SVG(m ? m[1] : '?') }
  })
}

const done = (turnId: string, reason: string, agentId?: string) =>
  ({ turnId, reason, answer: '', durationMs: 1, isAborted: reason === 'aborted', agentId }) as any

async function label($: any, surface: 'desktop' | 'terminal') {
  const ui = await $.ui.mount({ ...PANE, surface })
  const text = (await ui.find({ type: 'Text', text: /resting|working|waiting|done|hello|wrong|asleep/ }))?.text
  const svg = await ui.find({ type: 'Svg' }).catch(() => undefined)
  await ui.unmount()
  return { text, svg }
}

test('moods follow the session, with timed settling', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await label($, 'desktop')).text).toBe('hello')
  await clock.advance(2_500)
  expect((await label($, 'desktop')).text).toBe('resting')

  await $.turn.start({ text: 'hi', turnId: 't1' } as any)
  expect((await label($, 'desktop')).text).toBe('working')
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect((await label($, 'desktop')).text).toBe('working · Bash')

  await $.turn.start({ text: 'sub', turnId: 's1', agentId: 'a1' } as any)
  await $.turn.complete(done('s1', 'answer', 'a1'))
  expect((await label($, 'desktop')).text).toBe('working · Bash') // a subagent finishing is not "done"

  await $.turn.complete(done('t1', 'answer'))
  expect((await label($, 'desktop')).text).toBe('done; have a look')
  await clock.advance(8_100)
  expect((await label($, 'desktop')).text).toBe('resting')
  await clock.advance(5 * 60_000 + 100)
  expect((await label($, 'desktop')).text).toBe('asleep')

  await $.turn.start({ text: '', turnId: 't2' } as any)
  await $.turn.complete(done('t2', 'error'))
  expect((await label($, 'desktop')).text).toBe('something went wrong · error')
})

test('she animates by swapping still frames on their own timing', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2_500) // wave -> idle
  const frameOf = async () => /<title>([\w-]+)</.exec(String((await label($, 'desktop')).svg?.props?.source))?.[1]
  expect(await frameOf()).toBe('0-0') // idle frame 0 holds 1600 ms
  await clock.advance(1_560) // idle began at 2400 ms: now 1660 ms in, inside the blink (1600-1720)
  expect(await frameOf()).toBe('0-1')

  await $.turn.start({ text: 'hi', turnId: 't1' } as any)
  await clock.advance(250) // working frames 120 ms each: now at frame 2
  const before = await frameOf()
  await $.tool.call({ tool: 'Read', file_path: '/x' } as any)
  expect(await frameOf()).toBe(before) // another tool call does not restart the loop
  expect(before).toBe('7-2')

  await $.turn.complete(done('t1', 'error'))
  await clock.advance(10_000) // "failed" plays once and holds its last frame
  expect(await frameOf()).toBe('5-7')
})

test('desktop draws her picture, the terminal her state as text', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const desk = await label($, 'desktop')
  expect(desk.svg).toBeTruthy()
  const term = await label($, 'terminal')
  expect(term.svg).toBeFalsy()
  expect(term.text).toBe('hello')
})

test('a missing picture falls back to text', async ($, on) => {
  mock.clock(on)
  engine(on, false)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const desk = await label($, 'desktop')
  expect(desk.svg).toBeFalsy()
  expect(desk.text).toBe('hello')
})
