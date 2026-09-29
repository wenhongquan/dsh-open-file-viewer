/**
 * Reproduce better-sidebar's viewer matching against a REAL descriptor set.
 *
 * Why this exists: the previous `verify-bundle.mjs` proved the registration
 * CALL happened, which is not the same as the registration SURVIVING. This
 * script lifts better-sidebar's actual `matchFileViewer` algorithm out of its
 * shipped bundle and runs OUR descriptor through it, so a priority or
 * catch-all mistake shows up here instead of in the browser.
 *
 * Run: node scripts/verify-matching.mjs
 */
import { readFileSync } from 'node:fs'

// --- The real algorithm, transcribed from dsh-better-sidebar 0.22.1 ---
// client.js:1152 matchFileViewer, client.js:1150 isViewerEnabled,
// client.js:3650 planFirstMatch.
const extOf = (path) => {
  const base = path.split(/[\\/]/).pop() ?? path
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

function makeMatcher(viewers, prefs = {}) {
  const isViewerEnabled = (id) => prefs.viewersEnabled?.[id] !== false
  return function matchFileViewer(path, head) {
    const ext = extOf(path)
    for (const v of [...viewers].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))) {
      if (!isViewerEnabled(v.id)) continue
      if (head !== undefined && v.detect !== undefined) {
        if (v.detect(path, head)) return v
        if (v.exts.length === 0) continue
      } else if (v.exts.length === 0) {
        if (v.detect === undefined) return v
        continue
      }
      if (v.exts.includes(ext)) return v
    }
  }
}

function planFirstMatch(viewer) {
  if (viewer === undefined || viewer.fetchStrategy === 'binary-download') return { kind: 'binary' }
  switch (viewer.fetchStrategy) {
    case 'mediaUrl':
    case 'none':
      return { kind: 'render' }
    case 'custom':
      return { kind: 'customLoad' }
    case 'fsRead':
      return { kind: 'fetchFsRead' }
  }
}

// --- better-sidebar's three built-ins, transcribed from client.js:16661 ---
const builtins = [
  { id: 'markdown', exts: ['md', 'markdown'], priority: 0, fetchStrategy: 'fsRead' },
  { id: 'html', exts: ['html', 'htm'], priority: 0, fetchStrategy: 'fsRead' },
  { id: 'code', exts: [], priority: -100, fetchStrategy: 'fsRead' },
]

// --- our descriptor, as built into lib/client.js ---
const ours = JSON.parse(
  readFileSync(new URL('./descriptor.json', import.meta.url), 'utf8'),
)

const match = makeMatcher([...builtins, ours])

const cases = [
  ['/tmp/report.pdf', 'render', 'dsh-open-file-viewer:preview'],
  ['/tmp/a.docx', 'render', 'dsh-open-file-viewer:preview'],
  ['/tmp/a.xlsx', 'render', 'dsh-open-file-viewer:preview'],
  ['/tmp/a.png', 'render', 'dsh-open-file-viewer:preview'],
  ['/tmp/a.zip', 'render', 'dsh-open-file-viewer:preview'],
  ['/tmp/a.ts', 'render', 'dsh-open-file-viewer:preview'],
  // Files the built-ins should keep when ours is DISABLED:
]

let failures = 0
console.log('with our viewer ENABLED (it must win every format):')
for (const [path, expectKind, expectId] of cases) {
  const viewer = match(path)
  const plan = planFirstMatch(viewer)
  const ok = plan.kind === expectKind && viewer?.id === expectId
  if (!ok) failures++
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'} ${path.padEnd(16)} -> ${viewer?.id ?? '(none)'} [${plan.kind}]`,
  )
}

// With ours disabled, the host's own behaviour must be unchanged.
const matchDisabled = makeMatcher([...builtins, ours], {
  viewersEnabled: { 'dsh-open-file-viewer:preview': false },
})
console.log('\nwith our viewer DISABLED (host behaviour must be intact):')
for (const [path, expectId] of [
  ['/tmp/a.md', 'markdown'],
  ['/tmp/a.html', 'html'],
  ['/tmp/a.ts', 'code'],
]) {
  const viewer = matchDisabled(path)
  const ok = viewer?.id === expectId
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${path.padEnd(16)} -> ${viewer?.id ?? '(none)'}`)
}

if (failures > 0) {
  console.error(`\nFAIL: ${failures} case(s) did not match expectations`)
  process.exit(1)
}
console.log('\nPASS: our descriptor wins every format and defers cleanly when disabled')
