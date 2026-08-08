// The browser-safe surface: everything in the package except filesystem
// source resolution (src/index.js adds resolveSources on top for Node).
// The package's "browser" export condition and the docs-site playground
// bundle both point here.

// language
export { parse } from './lang/parse.js'
export { print } from './lang/print.js'
export { validate } from './validate.js'

// Shot Explorer bridge (explore links carrying the query via ?q=)
export { toShotExplorerURLs } from './se/to-shot-explorer.js'

// source resolution (browser-safe half: vid parsing + production fetch)
export { parseVidSource } from './sources/vid.js'
export { fetchVidInsights } from './sources/fetch-vid.js'

// data model
export { Game, InvalidInsightsError, UnsupportedInsightsError, SUPPORTED_MAJOR } from './model/game.js'

// engine
export { runQuery } from './engine/run.js'

// outputs
export { toClips } from './output/clips.js'
export { toSelectedShotsJSON } from './output/json.js'
export { toCSV, shotsToCSV } from './output/csv.js'
export { toEDL } from './output/edl.js'
export { ffmpegCommands, toCommandString } from './output/ffmpeg.js'
export { LLM_GUIDE } from './llm/guide.js'
