// Reads a Pixel Quest project: the variable values written into index.html
// by apply-brief.mjs, and the art module (quest-art.js) the film is drawn
// from, so the checks and the cue sheet use exactly what renders.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import vm from 'node:vm'

export function loadProject(dir) {
  dir = resolve(dir || '.')
  const htmlPath = join(dir, 'index.html')
  const artPath = join(dir, 'quest-art.js')
  for (const p of [htmlPath, artPath])
    if (!existsSync(p))
      throw new Error(`${p} not found: run this on the project folder copied from template/`)
  const html = readFileSync(htmlPath, 'utf8')
  const m = html.match(/data-composition-variables='([\s\S]*?)'/)
  if (!m) throw new Error(`${htmlPath} declares no data-composition-variables`)
  const decls = JSON.parse(m[1].replace(/&#39;/g, "'"))
  const values = Object.fromEntries(decls.map((d) => [d.id, d.default]))
  const ctx = {}
  vm.runInNewContext(readFileSync(artPath, 'utf8'), ctx, { filename: artPath })
  return { dir, decls, values, Q: ctx.QUEST }
}
