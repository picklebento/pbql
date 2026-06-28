import nearley from 'nearley'

import grammar from './grammar-generated.js'

function locOfEnd (text) {
  const lines = text.split('\n')
  return { line: lines.length, col: lines[lines.length - 1].length + 1 }
}

/**
 * Parses PBQL query text.
 * @param {string} text the query
 * @returns {{ast: object}|{errors: Array<{code: string, message: string,
 *   line: number, col: number, length: number}>}} the AST, or one or more
 *   errors with 1-indexed positions
 */
export function parse (text) {
  const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar))
  try {
    parser.feed(text)
  } catch (err) {
    const { token } = err
    /* istanbul ignore next -- nearley attaches the offending token to every
       error it or the lexer's error token can produce */
    if (!token) {
      throw err
    }
    const isLexError = token.type === 'error'
    return {
      errors: [{
        code: isLexError ? 'PBQL_LEX_ERROR' : 'PBQL_PARSE_ERROR',
        message: isLexError
          ? 'unrecognized text'
          : `unexpected "${token.text}"`,
        line: token.line,
        col: token.col,
        length: token.text.length
      }]
    }
  }
  const { results } = parser
  if (results.length === 0) {
    const { line, col } = locOfEnd(text)
    return {
      errors: [{
        code: 'PBQL_UNEXPECTED_END',
        message: 'query ended unexpectedly (incomplete statement)',
        line,
        col,
        length: 0
      }]
    }
  }
  /* istanbul ignore next -- the grammar is unambiguous; the test corpus
     exists to keep it that way */
  if (results.length > 1) {
    return {
      errors: [{
        code: 'PBQL_AMBIGUOUS',
        message: `grammar bug: query has ${results.length} parses`,
        line: 1,
        col: 1,
        length: 0
      }]
    }
  }
  return { ast: results[0] }
}
