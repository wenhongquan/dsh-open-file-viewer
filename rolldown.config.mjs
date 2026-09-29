import { defineConfig } from 'rolldown'

/**
 * Build the client bundle the dsh client-module system expects.
 *
 * Three constraints shape this file:
 *
 * 1. The bundle must EXECUTE to a call of
 *    `window.__ModuleLoader__.load({id, factory})`. The host fetches the file
 *    as a script and checks that the factory registered itself; a plain IIFE
 *    that never registers is reported as "loaded without registering".
 *
 * 2. The factory's `require` is a MODULE-TABLE require, not Node's: it only
 *    resolves platform seed words (react, react-dom, …) and other registered
 *    packages. Everything else must be inlined, so the whole
 *    `@open-file-viewer/core` tree (three, jszip, xlsx, …) is bundled and
 *    `react` is the single external.
 *
 * 3. The host serves ONE file per bundle, so the output is a single
 *    self-contained script — no relative chunk requires, which the factory's
 *    `require` could not satisfy anyway.
 *
 * The stylesheet is handled by `scripts/gen-css.mjs`, which turns it into a
 * string module (`src/ofv-style.ts`); rolldown's CSS pipeline is not used.
 */

const PLUGIN_ID = 'dsh-open-file-viewer'

/** Shared banner/footer wrapping the client half in the loader's envelope. */
const BANNER = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(PLUGIN_ID)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });`
const FOOTER = `
    return module.exports;
  }
});`

export default defineConfig([
  {
    input: 'src/index.ts',
    external: ['react', 'react-dom'],
    platform: 'node',
    output: { file: 'lib/index.js', format: 'esm' },
  },
  {
    input: 'src/client.tsx',
    external: ['react', 'react-dom'],
    platform: 'browser',
    output: {
      // The inner chunk is CJS so the external `react` import lowers to
      // `require("react")`, which the factory's parameter supplies.
      format: 'cjs',
      exports: 'named',
      dir: 'lib',
      entryFileNames: 'client.js',
      codeSplitting: false,
      banner: BANNER,
      footer: FOOTER,
    },
  },
])
