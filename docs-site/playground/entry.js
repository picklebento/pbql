// Browser bundle entry for the playground: the package's browser-safe
// surface (src/browser.js — no node:fs, so no resolveSources; app.js
// loads games via fetchVidInsights or a local file picker). esbuild
// bundles this into dist/playground/pbql.js.
export * from '../../src/browser.js'
