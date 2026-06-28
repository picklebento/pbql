// shared test utilities (not a test file)

// deep-copies a node tree without the `loc` position annotations, for
// comparing ASTs from different source texts
export function stripLoc (node) {
  if (Array.isArray(node)) {
    return node.map(stripLoc)
  }
  if (node !== null && typeof node === 'object') {
    const out = {}
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'loc') {
        out[key] = stripLoc(value)
      }
    }
    return out
  }
  return node
}
