/**
 * Check the extensions this plugin CLAIMS against what the viewer can
 * actually match.
 *
 * The failure this exists for: the plugin replaces the native preview for
 * every extension it declares, so a claimed extension that no format plugin
 * matches does not "fall through" anywhere — it renders the viewer's own
 * fallback (or throws), and the user sees a file that used to preview fine
 * stop working.
 *
 * Run: node scripts/verify-capabilities.mjs
 */
import { readFileSync } from 'node:fs'
import {
  imagePlugin,
  videoPlugin,
  audioPlugin,
  textPlugin,
  pdfPlugin,
  officePlugin,
  archivePlugin,
  emailPlugin,
  drawingPlugin,
  xmindPlugin,
  cadPlugin,
  model3dPlugin,
  gisPlugin,
  fallbackPlugin,
} from '@open-file-viewer/core'

// The claimed extension list, read from the source so this cannot drift.
const source = readFileSync(new URL('../src/client.tsx', import.meta.url), 'utf8')
const block = /const EXTENSIONS = \[([\s\S]*?)\] as const/.exec(source)
if (block === null) {
  console.error('FAIL: could not read EXTENSIONS from src/client.tsx')
  process.exit(1)
}
const claimed = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1])

const plugins = [
  imagePlugin(),
  videoPlugin(),
  audioPlugin(),
  pdfPlugin(),
  officePlugin(),
  archivePlugin(),
  emailPlugin(),
  drawingPlugin(),
  xmindPlugin(),
  cadPlugin(),
  model3dPlugin(),
  gisPlugin(),
  textPlugin(),
]

/**
 * MIME type the viewer would derive for a file of this extension, mirroring
 * `normalizeFile`: the extension map decides, and an unknown extension yields
 * an empty string.
 */
const extMime = (extension) => {
  const probe = { extension, mimeType: '', name: `probe.${extension}`, size: 0 }
  const named = plugins
    .map((plugin) => plugin.name)
    .filter((name) => name !== undefined)
  void named
  return probe
}

/** First plugin that claims this extension, mirroring `match()` order. */
function firstMatch(extension) {
  // A plausible MIME per family, so `mimeType`-based matchers get a fair shot.
  const guesses = {
    mp4: 'video/mp4',
    m4v: 'video/x-m4v',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    stp: 'model/step',
    step: 'model/step',
    iges: 'model/iges',
    igs: 'model/iges',
    ifc: 'application/x-step',
    pdf: 'application/pdf',
  }
  const file = {
    extension,
    mimeType: guesses[extension] ?? '',
    name: `probe.${extension}`,
    size: 1,
    blob: new Blob([new Uint8Array([0])]),
  }
  for (const plugin of plugins) {
    try {
      if (plugin.match(file)) return plugin.name ?? '(unnamed)'
    } catch (error) {
      return `match() threw: ${error.message}`
    }
  }
  return null
}

const unmatched = []
const matched = new Map()
for (const extension of claimed) {
  const plugin = firstMatch(extension)
  if (plugin === null) unmatched.push(extension)
  else matched.set(extension, plugin)
}

// Without a MIME guess the viewer relies on the extension map; report those
// that only match because of a MIME type we injected above.
const extensionOnly = claimed.filter((extension) => {
  const file = { extension, mimeType: '', name: `probe.${extension}`, size: 0 }
  return !plugins.some((plugin) => {
    try {
      return plugin.match(file)
    } catch {
      return false
    }
  })
})

console.log(`claimed extensions: ${claimed.length}`)
const byPlugin = {}
for (const [extension, plugin] of matched) {
  ;(byPlugin[plugin] ??= []).push(extension)
}
for (const [plugin, extensions] of Object.entries(byPlugin).sort()) {
  console.log(`  ${plugin.padEnd(12)} ${extensions.length}`)
}

if (unmatched.length > 0) {
  console.error(`\nFAIL: ${unmatched.length} claimed extension(s) no plugin matches:`)
  console.error(`  ${unmatched.join(', ')}`)
  console.error('These must be removed from EXTENSIONS (let the native preview handle them).')
  process.exit(1)
}

if (extensionOnly.length > 0) {
  console.error(`\nFAIL: ${extensionOnly.length} extension(s) only match via a MIME type:`)
  console.error(`  ${extensionOnly.join(', ')}`)
  process.exit(1)
}

console.log('\nPASS: every claimed extension is handled by a format plugin')
void extMime
void fallbackPlugin
