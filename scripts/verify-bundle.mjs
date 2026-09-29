/**
 * Materialize the built bundle the way the dsh client module system does, and
 * assert the STANDALONE document-preview contract.
 *
 * The plugin claims the document kind through the platform's own tab registry
 * and supplies its body on the platform's slot seat — no other preview plugin
 * participates. The assertions below are the ones whose absence let broken
 * builds ship: a missing `exports.inject`, a component reading props that the
 * seat never sends, and a string `style` prop.
 *
 * Run: node scripts/verify-bundle.mjs
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const source = readFileSync(new URL('../src/client.tsx', import.meta.url), 'utf8')

let registered = null
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(registration) {
        registered = registration
      },
    },
  },
  console,
  document: {
    createElement: () => ({ setAttribute() {}, set textContent(v) {} }),
    querySelector: () => null,
    head: { appendChild() {} },
  },
  requestAnimationFrame: () => 0,
  fetch: () => Promise.reject(new Error('not used in this test')),
  Blob,
  AbortController,
  URL: { createObjectURL: () => 'blob:test' },
}

// The factory's `require` is a module table: react is a platform seed.
//
// The hooks are STUBS, not React's: the body component is invoked directly
// (there is no renderer here), and real hooks throw outside a render context.
// What this exercises is the component's prop handling, which is exactly
// where a shipped crash lived.
const requireFn = (spec) => {
  if (spec === 'react') {
    return {
      createElement: (type, props, ...children) => ({ type, props, children }),
      useEffect: () => {},
      useRef: (initial) => ({ current: initial }),
      useState: (initial) => [initial, () => {}],
    }
  }
  throw new Error(`unexpected external require(${JSON.stringify(spec)})`)
}

const context = vm.createContext(sandbox)
vm.runInContext(bundle, context, { filename: 'client.js' })

// --- Standalone: no dependency on any other preview plugin ---
if (source.includes('dsh-client-ui-sidebar-documentpreview')) {
  console.error('FAIL: the plugin still references the documentpreview package')
  process.exit(1)
}
console.log('ok: no dependency on another preview plugin')

// A bare `import("pdfjs-dist")` cannot resolve in the browser, and the
// viewer's own fallback fetches the worker from a CDN. Both must be gone.
for (const specifier of ['pdfjs-dist', 'pdfjs-dist/legacy/build/pdf.mjs']) {
  if (bundle.includes(`import("${specifier}")`)) {
    console.error(`FAIL: bundle still resolves "${specifier}" at runtime`)
    process.exit(1)
  }
}
console.log('ok: pdfjs is bundled, no runtime specifier')

// The bug that broke every format at once: handing the viewer a Blob carrying
// `application/octet-stream`. `normalizeFile` resolves the MIME type as
// `mimeType || source.type || extensionMimeMap[extension]`, so a blob type
// short-circuits the extension fallback and every file loses its real type.
// Checked against the SOURCE: pdfjs and its dependencies legitimately mention
// this MIME type internally.
if (/type:\s*['"]application\/octet-stream['"]/.test(source)) {
  console.error('FAIL: bytes are wrapped in an application/octet-stream Blob')
  process.exit(1)
}
console.log('ok: no octet-stream Blob wrapping (MIME derives from the file name)')

if (registered === null) {
  console.error('FAIL: bundle did not call window.__ModuleLoader__.load')
  process.exit(1)
}
console.log(`ok: registered id=${JSON.stringify(registered.id)}`)

const exports = registered.factory(requireFn)
if (typeof exports.apply !== 'function') {
  console.error('FAIL: exports.apply is missing')
  process.exit(1)
}
console.log('ok: exports carry apply')

// The loader reads `exports.inject` to decide when to run `apply`. Without it,
// `apply` runs before the services exist, every `ctx.get` answers undefined,
// and the registration silently never happens.
if (!Array.isArray(exports.inject)) {
  console.error('FAIL: exports.inject is missing — apply() would run before its services exist')
  process.exit(1)
}
for (const service of ['slots', 'sidebarRightTabs', 'remote']) {
  if (!exports.inject.includes(service)) {
    console.error(`FAIL: inject must declare the "${service}" service`)
    process.exit(1)
  }
}
console.log(`ok: inject declares ${exports.inject.join(', ')}`)

// --- A host carrying the platform services ---
let tabDefinition = null
let slotDescriptor = null
let slotComponent = null
let disposedCount = 0

const slots = {
  inject(name, factory) {
    factory()
  },
  register(descriptor, component) {
    slotDescriptor = descriptor
    slotComponent = component
    return () => {
      disposedCount += 1
    }
  },
}
const tabs = {
  register(definition) {
    tabDefinition = definition
    return () => {
      disposedCount += 1
    }
  },
}
const remote = {
  workspaceFiles: {
    readBytes: async () => ({ data: new Uint8Array([1, 2, 3]), eof: true }),
  },
}

const ctx = {
  effect(fn) {
    const dispose = fn()
    if (typeof dispose === 'function') ctx.disposer = dispose
  },
  get(name) {
    if (name === 'slots') return slots
    if (name === 'sidebarRightTabs') return tabs
    if (name === 'remote') return remote
    return undefined
  },
}
ctx.effect(() => {
  exports.apply(ctx)
}, 'test')

if (tabDefinition === null) {
  console.error('FAIL: did not register a tab type')
  process.exit(1)
}
if (tabDefinition.kind !== 'open-file-viewer') {
  console.error(`FAIL: kind must be this plugin's OWN kind, got ${JSON.stringify(tabDefinition.kind)}`)
  process.exit(1)
}
// The collision that broke the shipped preview: a tab kind admits one
// `builtin` and one `extension`, and a `fallback` shares its kind with
// NOTHING (ui-sidebar-right's `coexists`). The shipped document preview holds
// the `text` kind in the `fallback` band, so registering that kind here — in
// any band — makes whichever registers second throw, and the loser is
// reported as a plugin that failed to load.
if (tabDefinition.kind === 'text') {
  console.error("FAIL: kind must not be the shipped preview's 'text' kind — registering it throws for one of the two")
  process.exit(1)
}
console.log(`ok: registered tab type id=${tabDefinition.id} kind=${tabDefinition.kind} (own kind, no collision)`)

if (!tabDefinition.patterns?.includes('dsh-resource://file/**')) {
  console.error('FAIL: tab type must recognise workspace file addresses')
  process.exit(1)
}
if (tabDefinition.priority !== 'extension') {
  console.error(`FAIL: priority must be 'extension', got ${JSON.stringify(tabDefinition.priority)}`)
  process.exit(1)
}
console.log('ok: recognises dsh-resource://file/** at extension priority')

// The veto is what keeps Day-1 behaviour for suffixes the viewer cannot
// render; it must accept a claimed suffix and decline everything else.
const address = (name) =>
  `dsh-resource://file/session/s1/${encodeURIComponent('/tmp/' + name)}`
for (const [name, expected] of [
  ['report.pdf', true],
  ['photo.png', true],
  ['clip.mp4', true],
  ['model.glb', true],
  ['part.stp', true],
  ['notes.md', true],
  ['binary.bin', false],
  ['no-extension', false],
]) {
  const got = tabDefinition.canOpen(address(name))
  if (got !== expected) {
    console.error(`FAIL: canOpen(${name}) = ${got}, expected ${expected}`)
    process.exit(1)
  }
}
console.log('ok: canOpen accepts claimed suffixes and declines the rest')

if (tabDefinition.title(address('report.pdf')) !== 'report.pdf') {
  console.error('FAIL: title must be the file name')
  process.exit(1)
}
console.log('ok: title is the file name')

if (slotDescriptor === null) {
  console.error('FAIL: did not register the pane body')
  process.exit(1)
}
if (slotDescriptor.name !== 'sidebar.right.pane.tab') {
  console.error(`FAIL: wrong slot name ${slotDescriptor.name}`)
  process.exit(1)
}
if (slotDescriptor.key !== tabDefinition.id) {
  console.error(`FAIL: slot key ${slotDescriptor.key} must equal the type id ${tabDefinition.id}`)
  process.exit(1)
}
console.log('ok: pane body keyed to the tab type id')

if (typeof slotComponent !== 'function') {
  console.error('FAIL: pane body is not a function')
  process.exit(1)
}

// The crash that shipped: reading `props.owner.*`. The seat injects the tab
// hook and the session identity; there is no `owner` prop at this seat.
let renderError = null
let rendered = null
try {
  rendered = slotComponent({ useTabInfo: () => ({ tab: { contentId: address('report.pdf') } }) })
} catch (error) {
  renderError = error
}
if (renderError !== null) {
  console.error(`FAIL: pane body threw on contract props: ${renderError.message}`)
  process.exit(1)
}
console.log('ok: pane body renders from the injected tab hook')

// Minified React error #62 is "The `style` prop expects a mapping from style
// properties to values, not a string".
function assertNoStringStyle(node, path) {
  if (node === null || typeof node !== 'object') return
  if (typeof node.props?.style === 'string') {
    console.error(`FAIL: string \`style\` prop at ${path} — React requires an object (error #62)`)
    process.exit(1)
  }
  for (const [index, child] of (node.children ?? []).entries()) {
    assertNoStringStyle(child, `${path}.children[${index}]`)
  }
}
assertNoStringStyle(rendered, 'root')
console.log('ok: no string `style` prop (React #62)')

ctx.disposer?.()
if (disposedCount < 2) {
  console.error(`FAIL: teardown left a registration behind (${disposedCount})`)
  process.exit(1)
}
console.log('ok: teardown unregisters both seats')

// --- dsh-better-sidebar integration: the previewer registers into its
// viewer registry with the non-host-owned extensions and a working loader. ---
{
  let viewerDescriptor = null
  let viewerDisposed = false
  let readCalls = 0
  const betterSidebarCtx = {
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') betterSidebarCtx.disposer = dispose
    },
    get(name) {
      if (name === 'slots') return slots
      if (name === 'sidebarRightTabs') return tabs
      if (name === 'remote') return remote
      if (name === 'betterSidebar') {
        return {
          registerFileViewer(descriptor) {
            viewerDescriptor = descriptor
            return () => { viewerDisposed = true }
          },
        }
      }
      return undefined
    },
  }
  // The readBytes stub counts calls; the loader must page through it. The
  // stub answers in the wire's RemoteResult envelope, which readWindow unwraps.
  remote.workspaceFiles.readBytes = async (_scope, _path, options) => {
    readCalls += 1
    const offset = options?.range?.offset ?? 0
    return { ok: true, value: { data: new Uint8Array([9, 9, 9]), eof: offset > 0 } }
  }
  betterSidebarCtx.effect(() => { exports.apply(betterSidebarCtx) }, 'test')
  if (viewerDescriptor === null) {
    console.error('FAIL: did not register a file viewer with dsh-better-sidebar')
    process.exit(1)
  }
  if (viewerDescriptor.id !== 'dsh-open-file-viewer:preview') {
    console.error(`FAIL: better-sidebar viewer id is ${JSON.stringify(viewerDescriptor.id)}`)
    process.exit(1)
  }
  if (!viewerDescriptor.exts.includes('glb') || viewerDescriptor.exts.includes('pdf')) {
    console.error('FAIL: better-sidebar viewer exts must claim glb and yield pdf to the host')
    process.exit(1)
  }
  if (viewerDescriptor.exts.includes('txt') || viewerDescriptor.exts.includes('py')) {
    console.error('FAIL: better-sidebar viewer must yield text/code files to the editable editor')
    process.exit(1)
  }
  if (viewerDescriptor.fetchStrategy !== 'custom' || typeof viewerDescriptor.load !== 'function') {
    console.error('FAIL: better-sidebar viewer must fetch through a custom load()')
    process.exit(1)
  }
  const bytes = await viewerDescriptor.load('/x.glb', { sessionId: 's1' })
  // Structural check on purpose: the bundle runs in a vm realm, so an
  // `instanceof Uint8Array` against this realm's constructor always fails.
  if (!bytes || typeof bytes.length !== 'number' || bytes.length === 0 || !ArrayBuffer.isView(bytes)) {
    console.error('FAIL: better-sidebar load() did not return the file bytes')
    process.exit(1)
  }
  if (readCalls < 2) {
    console.error(`FAIL: load() did not page through the remote (${readCalls} reads)`)
    process.exit(1)
  }
  betterSidebarCtx.disposer?.()
  if (!viewerDisposed) {
    console.error('FAIL: teardown did not dispose the better-sidebar registration')
    process.exit(1)
  }
  console.log('ok: registered with dsh-better-sidebar (exts yield host-owned, load pages)')
}

// Without the platform services the effect must no-op rather than throw.
const bareCtx = {
  effect(fn) {
    fn()
  },
  get() {
    return undefined
  },
}
try {
  bareCtx.effect(() => {
    exports.apply(bareCtx)
  }, 'test')
} catch (error) {
  console.error(`FAIL: threw without the platform services: ${error.message}`)
  process.exit(1)
}
console.log('ok: no-op (no throw) while the platform services are absent')

console.log('\nPASS: bundle satisfies the standalone document-preview contract')
