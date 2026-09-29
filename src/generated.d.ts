/**
 * Ambient types for the generated string modules.
 *
 * `scripts/gen-assets.mjs` writes `ofv-style.ts` and `pdfjs-worker.ts` as
 * multi-megabyte string literals. They are excluded from the TypeScript
 * program (checking megabytes of string literal buys nothing) and declared
 * here instead, so `import x from './ofv-style'` still types as `string`.
 */
declare module '*/ofv-style' {
  const css: string
  export default css
}

declare module '*/pdfjs-worker' {
  const source: string
  export default source
}
