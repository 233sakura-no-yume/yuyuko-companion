# yuyuko-companion

A Claude Code mod that keeps Yuyuko Saigyouji in a pane beside the chat and
reacts to what the session is doing, the way Codex pets react to Codex:

| Session | Yuyuko |
| --- | --- |
| a turn runs, a tool is called | working (fan fidget), the tool's name below her |
| Claude Code asks you to allow a tool | waiting (fan to face) |
| the turn finishes | "review" fidget for 8 s, then resting |
| the turn ends in an error or refusal | the "failed" row (she sinks down), resting after a minute |
| you interrupt the turn | resting |
| 5 minutes of quiet | asleep |

`/yuyuko` reopens the pane. In the desktop app and editors she is drawn as
still SVG frames swapped on a timer (at most 10 per second); a terminal shows
her state as text. Turns inside subagents are ignored. The mod only watches:
every hook passes its event on unchanged, so it never blocks or alters Claude.

## Install

At the prompt of a terminal session:

```
/plugin install yuyuko-companion --marketplace 233sakura-no-yume/yuyuko-companion
```

Answer `y` to add the marketplace, then pick a scope (Enter takes the user
scope). From a shell:

```bash
claude plugin install yuyuko-companion --marketplace 233sakura-no-yume/yuyuko-companion
```

In the desktop app, where `/plugin` does not run: click **+** next to the
prompt box, then **Plugins**, **Add marketplace** with
`233sakura-no-yume/yuyuko-companion`, then **Add plugin**. A mod installed from
a terminal at the user scope also loads in the desktop app's sessions.

## Notes

- Mods are an early-access Claude Code feature and their API changes between
  releases; this mod was built and tested on Claude Code 2.1.308.
- `claude plugin test .` runs the tests in `hooks/register.test.tsx`.
- The pictures in `assets/frames/` (one still SVG per frame, 96×104 px) and
  the frame table `hooks/frames.ts` were generated from the author's Codex pet
  sprite sheet.

## License and artwork

The code is MIT-licensed (see `LICENSE`). The character artwork in
`assets/frames/` is fan art of a Touhou Project character (© Team Shanghai
Alice); it is not covered by the MIT license and is shared for non-commercial
fan use only.
