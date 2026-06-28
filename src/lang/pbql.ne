@{%
  const pbqlLexer = require("./lexer.js");
  const { CANONICAL_PLAYERS } = require("./lexer.js");

  function loc (tok) {
    return { line: tok.line, col: tok.col }
  }

  // AND/OR are n-ary in the AST: nested same-kind junctions flatten
  function junction (kind, lhs, rhs) {
    const args = []
    for (const side of [lhs, rhs]) {
      if (side.kind === kind) {
        args.push(...side.args)
      } else {
        args.push(side)
      }
    }
    return { kind, args }
  }

  // accepted alias spellings canonicalize in the AST (D15)
  const CANON_OPS = { '<>': '!=', '==': '=' }

  function unescapeString (tok) {
    return tok.text.slice(1, -1).replace(/\\(["\\])/g, '$1')
  }

  const ZERO_DUR = () => ({ kind: 'dur', unit: 'secs', value: 0 })
%}
@lexer pbqlLexer
@preprocessor module

query -> select:? from where ctxBefore:? ctxAfter:? orderBy:? limit:?
  {% d => ({
       kind: 'query',
       select: d[0],
       sources: d[1],
       where: d[2],
       context: { before: d[3] ?? ZERO_DUR(), after: d[4] ?? ZERO_DUR() },
       orderBy: d[5],
       limit: d[6]
     }) %}

# ---- SELECT (parsed since M2; evaluated starting M6) --------------------
select -> %kw_select selectList {% d => d[1] %}
selectList ->
    selectItem                    {% d => [d[0]] %}
  | selectList %comma selectItem  {% d => [...d[0], d[2]] %}
selectItem ->
    expr                 {% d => ({ expr: d[0], label: null }) %}
  | expr %kw_as string   {% d => ({ expr: d[0], label: d[2] }) %}

# ---- FROM ----------------------------------------------------------------
from -> %kw_from sourceList {% d => d[1] %}
sourceList ->
    source                    {% d => [d[0]] %}
  | sourceList %comma source  {% d => [...d[0], d[2]] %}
source ->
    %kw_video %leftParen string %rightParen
    {% d => ({ kind: 'video', vid: d[2] }) %}
  | %kw_video %leftParen string %comma int %rightParen
    {% d => ({ kind: 'video', vid: d[2], sessionNum: d[4] }) %}
  | %kw_folder %leftParen int %rightParen
    {% d => ({ kind: 'folder', fid: d[2] }) %}

# ---- WHERE ---------------------------------------------------------------
where -> %kw_where expr {% d => d[1] %}

# ---- expressions, loosest to tightest binding (D1) ------------------------
expr -> orExpr {% id %}
orExpr ->
    orExpr %kw_or andExpr {% d => junction('or', d[0], d[2]) %}
  | andExpr               {% id %}
andExpr ->
    andExpr %kw_and notExpr {% d => junction('and', d[0], d[2]) %}
  | notExpr                 {% id %}
notExpr ->
    %kw_not notExpr {% d => ({ kind: 'not', arg: d[1] }) %}
  | cmpExpr         {% id %}
# comparisons do not chain: both sides are additive expressions
cmpExpr ->
    addExpr %comparisonOperator addExpr
    {% d => ({
         kind: 'cmp',
         op: CANON_OPS[d[1].text] ?? d[1].text,
         lhs: d[0],
         rhs: d[2],
         loc: loc(d[1])
       }) %}
  | addExpr %kw_in %leftParen literalList %rightParen
    {% d => ({ kind: 'in', lhs: d[0], list: d[3], loc: loc(d[1]) }) %}
  | addExpr {% id %}
literalList ->
    literal                    {% d => [d[0]] %}
  | literalList %comma literal {% d => [...d[0], d[2]] %}
addExpr ->
    addExpr addOp mulExpr {% d => ({ kind: 'arith', op: d[1], lhs: d[0], rhs: d[2] }) %}
  | mulExpr               {% id %}
addOp -> %plus {% () => '+' %} | %minus {% () => '-' %}
mulExpr ->
    mulExpr mulOp unaryExpr {% d => ({ kind: 'arith', op: d[1], lhs: d[0], rhs: d[2] }) %}
  | unaryExpr               {% id %}
mulOp -> %star {% () => '*' %} | %slash {% () => '/' %}
unaryExpr ->
    %minus unaryExpr {% d => ({ kind: 'neg', arg: d[1] }) %}
  | postfix          {% id %}
postfix ->
    literalNode                  {% id %}
  | propExpr                     {% id %}
  | callExpr                     {% id %}
  | %leftParen expr %rightParen  {% d => d[1] %}

# ---- properties, methods, functions (D16) ---------------------------------
# object[.seg[.seg…]][(args)] — args make the last segment a method call
propExpr -> objectRef segs callArgs:?
  {% (d, _, reject) => {
       if (d[2] && d[1].length === 0) {
         return reject  // an object is not callable: shot("x") is an error
       }
       const node = { kind: 'prop', base: d[0], path: d[1], loc: d[0].loc }
       if (d[2]) {
         node.args = d[2]
       }
       return node
     } %}
objectRef ->
    %kw_shot index:?  {% d => ({ object: 'shot', offset: d[1] ?? 0, loc: loc(d[0]) }) %}
  | %kw_rally index:? {% d => ({ object: 'rally', offset: d[1] ?? 0, loc: loc(d[0]) }) %}
  | %kw_game          {% d => ({ object: 'game', loc: loc(d[0]) }) %}
  | %player
    {% d => ({
         object: 'player',
         name: CANONICAL_PLAYERS.get(d[0].text.toLowerCase()),
         loc: loc(d[0])
       }) %}
index -> %leftBracket %minus:? int %rightBracket
  {% d => d[1] ? -d[2] : d[2] %}
segs ->
    null                {% () => [] %}
  | segs %dot segName   {% d => [...d[0], d[2]] %}
# keywords are legal property names after a dot (research-notes issue 5)
segName ->
    %identifier {% d => d[0].text %}
  | %kw_select  {% d => d[0].text %}
  | %kw_from    {% d => d[0].text %}
  | %kw_where   {% d => d[0].text %}
  | %kw_limit   {% d => d[0].text %}
  | %kw_as      {% d => d[0].text %}
  | %kw_in      {% d => d[0].text %}
  | %kw_and     {% d => d[0].text %}
  | %kw_or      {% d => d[0].text %}
  | %kw_not     {% d => d[0].text %}
  | %kw_true    {% d => d[0].text %}
  | %kw_false   {% d => d[0].text %}
  | %kw_asc     {% d => d[0].text %}
  | %kw_desc    {% d => d[0].text %}
  | %kw_video   {% d => d[0].text %}
  | %kw_folder  {% d => d[0].text %}
  | %kw_shot    {% d => d[0].text %}
  | %kw_rally   {% d => d[0].text %}
  | %kw_game    {% d => d[0].text %}
  | %unit_secs  {% d => d[0].text %}
  | %unit_shots {% d => d[0].text %}
callExpr -> %identifier callArgs
  {% d => ({ kind: 'call', name: d[0].text, args: d[1], loc: loc(d[0]) }) %}
callArgs ->
    %leftParen %rightParen          {% () => [] %}
  | %leftParen argList %rightParen  {% d => d[1] %}
argList ->
    expr                 {% d => [d[0]] %}
  | argList %comma expr  {% d => [...d[0], d[2]] %}

# ---- SHOT CONTEXT (D3/D4: positive magnitudes; min = cap, max = floor) ----
ctxBefore -> %shotContextBefore duration {% d => d[1] %}
ctxAfter -> %shotContextAfter duration   {% d => d[1] %}
duration ->
    number %unit_secs  {% d => ({ kind: 'dur', unit: 'secs', value: d[0] }) %}
  | int shotsUnit      {% d => ({ kind: 'dur', unit: 'shots', value: d[0] }) %}
  | %kw_rally          {% () => ({ kind: 'dur', unit: 'rally' }) %}
  | %identifier %leftParen duration %comma duration %rightParen
    {% (d, _, reject) => {
         const fn = d[0].text.toLowerCase()
         if (fn !== 'min' && fn !== 'max') {
           return reject
         }
         return { kind: 'durfn', fn, args: [d[2], d[4]] }
       } %}
# the singular "shot" is an accepted alias for the shots unit (D15)
shotsUnit -> %unit_shots {% id %} | %kw_shot {% id %}

# ---- ORDER BY / LIMIT ------------------------------------------------------
orderBy -> %orderBy orderList {% d => d[1] %}
orderList ->
    orderItem                    {% d => [d[0]] %}
  | orderList %comma orderItem   {% d => [...d[0], d[2]] %}
orderItem -> expr sortDir:? {% d => ({ expr: d[0], dir: d[1] ?? 'asc' }) %}
sortDir -> %kw_asc {% () => 'asc' %} | %kw_desc {% () => 'desc' %}
limit -> %kw_limit int {% d => d[1] %}

# ---- literals ---------------------------------------------------------------
literalNode -> literal {% d => ({ kind: 'lit', value: d[0] }) %}
literal ->
    number  {% id %}
  | string  {% id %}
  | boolean {% id %}
number -> int {% id %} | float {% id %}
int -> %int      {% d => d[0].value %}
float -> %float  {% d => d[0].value %}
string -> %string {% d => unescapeString(d[0]) %}
boolean -> %kw_true {% () => true %} | %kw_false {% () => false %}
