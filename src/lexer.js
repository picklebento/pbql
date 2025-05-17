import moo from 'moo'

const relativePlayers = ['Teammate', 'Opponent1', 'Opponent2', 'OpponentLHS', 'OpponentRHS']
function makePlayers (referencePlayer) {
  const rootString = (referencePlayer === 'me') ? 'my' : (referencePlayer + 's')
  return [referencePlayer, ...relativePlayers.map(x => rootString + x)]
}

const lexer = moo.compile({
  whitespace: { match: /\s+/, lineBreaks: true },
  comment: /#.*?$/,
  float: { match: /[-]?[0-9]+[.][0-9]+/, value: parseFloat },
  int: { match: /[-]?[0-9]+/, value: parseInt },
  true: { match: 'true', value: () => true },
  false: { match: 'false', value: () => false },
  string: /".*?"/,
  leftParen: '(',
  rightParen: ')',
  leftBracket: '[',
  rightBracket: ']',
  dot: '.',
  comma: ',',
  comparisonOperator: ['=', '!=', '<', '<=', '>', '>='],
  shotContextBefore: 'SHOT CONTEXT BEFORE',
  shotContextAfter: 'SHOT CONTEXT AFTER',
  orderBy: 'ORDER BY',
  sortOrder: ['ASC', 'DESC'],
  unitSeconds: 'secs',
  unitShots: 'shots',
  player: [
    ...makePlayers('hitter'), // player who hit the ball and players relative to them
    ...makePlayers('me') // myself and players relative to me
  ],
  identifier: {
    match: /[a-zA-Z_]+/,
    type: moo.keywords(Object.fromEntries([
      // keywords designating different sections (multi-word section keywords
      // are above since they aren't identifiers since they contain whitespace)
      'FROM',
      'WHERE',
      'LIMIT',
      // boolean logic keywords
      'AND',
      'OR',
      'NOT',
      // source selection functions
      'folder',
      'video',
      // built-in functions
      'min',
      'max',
      // objects that can be referenced (player objects are defined above)
      'shot',
      'rally',
      'game'
    ].map(k => ['kw_' + k, k])))
  }
})

// ignore comments and whitespace
const ignoredTokens = new Set(['comment', 'whitespace'])
lexer.next = (next => () => {
  let tok
  while ((tok = next.call(lexer)) && ignoredTokens.has(tok.type)) {
    // skip ignored tokens
  }
  return tok
})(lexer.next)

export default lexer
