// One-call validation for hosts and LLM self-repair loops:
// lex + parse + normalize + analyze, returning every error found.
import { analyze, normalize } from './analyze/analyze.js'
import { parse } from './lang/parse.js'

/**
 * @param {string} text a PBQL query
 * @returns {{errors: Array, ast?: object}} errors is empty when the query
 *   is valid; ast (canonicalized) is present whenever parsing succeeded
 */
export function validate (text) {
  const parsed = parse(text)
  if (parsed.errors) {
    return { errors: parsed.errors }
  }
  const ast = normalize(parsed.ast)
  return { errors: analyze(ast).errors, ast }
}
