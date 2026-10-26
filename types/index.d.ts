export type Mood = 'idle' | 'working' | 'waiting' | 'review' | 'wave' | 'failed' | 'sleep'

declare module 'claude-code' {
  interface PluginState {
    // frame: index into FRAMES[mood].frames (hooks/frames.ts)
    'yuyuko-companion': { mood: Mood; detail: string; frame: number }
  }
}
