#!/usr/bin/env node
// Writes the film's beat map as a cue sheet, for whoever scores it or cuts
// it to a track: every beat of the 120 BPM grid, and every on-screen hit
// (cuts, jumps, coin pickups, the block, fireworks) on the beat it lands on.
//
//   node scripts/cues.mjs <project-dir> [-o cues.csv]
//
// Columns: time_s, bar, beat, event, detail. Bars and beats count from 1.
import { writeFileSync } from 'node:fs'
import { loadProject } from './load-project.mjs'

const args = process.argv.slice(2)
const oi = args.indexOf('-o')
const out = oi >= 0 ? args[oi + 1] : null
const dir = args.find((a, i) => !a.startsWith('-') && !(oi >= 0 && i === oi + 1))
let project
try {
  project = loadProject(dir)
} catch (e) {
  console.error(`cues: ${e.message}`)
  process.exit(1)
}
const { values: v, Q } = project
const B = Q.BEAT
const rows = []
const add = (t, event, detail = '') => rows.push({ t, event, detail })

for (let b = 0; b < Q.DURATION / B; b++)
  add(b * B, b % 4 === 0 ? 'downbeat' : 'beat')

const names = { title: 'title screen', l1: 'stage 1', l2: 'stage 2', l3: 'stage 3', end: 'ending' }
Q.SCENES.forEach((s, i) => {
  add(s.start, 'scene', names[s.id])
  if (i) add(s.start - 0.25, 'wipe', `pixel wipe into ${names[s.id]} (closes 0.25 s before, opens 0.25 s after)`)
})
add(0, "prompt", `"${v.cta}" blinks on every beat`)
add(6 * B, 'prompt', `"${v.cta}" pressed: fast blink`)
for (let n = 1; n <= 3; n++) {
  const L0 = Q.SCENES[n].start
  const L = Q.LEVEL
  add(L0 + L.banner * B, 'banner', `STAGE ${n} · ${v[`level${n}Name`]}`)
  if (v[`level${n}Text`])
    add(L0 + L.type * B, 'dialog', `types "${v[`level${n}Text`]}" over ${L.typeBeats} beats`)
  L.coins.forEach((c, k) => add(L0 + c * B, 'coin', `pickup ${k + 1} of 3, +100`))
  add(L0 + L.jump * B, 'jump', 'hero takes off')
  add(L0 + L.hit * B, 'block', `hits the ? block: ${v[`level${n}Item`]} power-up, +1000`)
  add(L0 + L.stop * B, 'stop', 'scrolling stops, hero lands')
  add(L0 + 7 * B, 'hop', 'little hop')
}
const E0 = Q.SCENES[4].start
add(E0 + 0.25, 'headline', `"${v.headline}"`)
Q.END.fireworks.forEach((f) => add(E0 + f * B, 'firework', 'burst'))
Q.END.jumps.forEach((j) => add(E0 + j * B, 'jump', 'hero jumps'))

rows.sort((a, b) => a.t - b.t || (a.event.endsWith('beat') ? -1 : 1))
const esc = (s) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
const lines = ['time_s,bar,beat,event,detail']
for (const r of rows) {
  const beatNo = Math.floor(r.t / B + 1e-6)
  lines.push(
    [r.t.toFixed(3), Math.floor(beatNo / 4) + 1, (beatNo % 4) + 1, r.event, esc(r.detail)].join(','),
  )
}
const csv = lines.join('\n') + '\n'
if (out) {
  writeFileSync(out, csv)
  console.log(
    `Wrote ${rows.length} cues to ${out}: ${Q.BPM} BPM, 4/4, ${Q.DURATION / B / 4} bars, first downbeat at 0.000 s.`,
  )
} else process.stdout.write(csv)
