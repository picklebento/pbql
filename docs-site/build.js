// Builds the static docs site into docs-site/dist: renders the docs/*.md
// pages to HTML, copies llms.txt verbatim, copies the
// landing page and the playground, and bundles the library for the browser
// (docs-site/playground/entry.js → dist/playground/pbql.js). Run via
// `yarn build:site`, which compiles the nearley grammar first (the bundle
// includes src/lang/grammar-generated.js).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'
import { marked } from 'marked'

const siteDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(siteDir, '..')
const dist = path.join(siteDir, 'dist')

const NAV_LINKS = [
  ['index.html', 'PBQL'],
  ['language.html', 'Language'],
  ['data-dictionary.html', 'Data Dictionary'],
  ['playground/', 'Playground'],
  ['cli.html', 'CLI'],
  ['llms.txt', 'llms.txt']
]

// the tab for the page being rendered is marked so the stylesheet can
// underline it (the static landing/playground pages hardcode the same)
function nav (activeHref) {
  return NAV_LINKS.map(([href, label]) => href === activeHref
    ? `  <a href="${href}" aria-current="page">${label}</a>`
    : `  <a href="${href}">${label}</a>`).join('\n')
}

// wraps rendered markdown in the shared chrome (the landing page and the
// playground are authored as complete HTML files instead)
function page (title, body, activeHref) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="site.css">
</head>
<body>
<nav>
${nav(activeHref)}
</nav>
<main>
${body}
</main>
</body>
</html>
`
}

function renderDoc (mdName, outName, title) {
  const md = fs.readFileSync(path.join(repoRoot, 'docs', mdName), 'utf8')
  // cross-links between the docs point at the rendered pages
  const body = marked.parse(md)
    .replaceAll(/href="([a-z-]+)\.md"/g, 'href="$1.html"')
  fs.writeFileSync(path.join(dist, outName), page(title, body, outName))
}

fs.rmSync(dist, { recursive: true, force: true })
fs.mkdirSync(path.join(dist, 'playground'), { recursive: true })

renderDoc('language.md', 'language.html', 'The PBQL Language')
renderDoc('cli.md', 'cli.html', 'The PBQL CLI')
renderDoc('data-dictionary.md', 'data-dictionary.html', 'PBQL Data Dictionary')
for (const [from, to] of [
  [[repoRoot, 'docs', 'llms.txt'], ['llms.txt']],
  [[siteDir, 'assets', 'site.css'], ['site.css']],
  [[siteDir, 'index.html'], ['index.html']],
  [[siteDir, 'playground', 'index.html'], ['playground', 'index.html']],
  [[siteDir, 'playground', 'app.js'], ['playground', 'app.js']]
]) {
  fs.copyFileSync(path.join(...from), path.join(dist, ...to))
}

await build({
  entryPoints: [path.join(siteDir, 'playground', 'entry.js')],
  outfile: path.join(dist, 'playground', 'pbql.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  sourcemap: false
})

console.log(`wrote ${dist}`)
