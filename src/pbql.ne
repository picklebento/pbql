@{%
  const pbqlLexer = require("./lexer.js");

  function firstValue(d) {
    return d[0].value
  }
  function makeContext(durationExpr, isSeconds) {
    return { durationExpr, isSeconds }
  }
  function makeFunctionCall(name, argsList) {
    return { kind: 'functionCall', name, argsList }
  }
%}
@lexer pbqlLexer
@preprocessor module

query -> from where shotContextBefore:? shotContextAfter:? orderBy:? limit:?
         {% d => ({
              sources: d[0],
              where: d[1],
              context: {
                before: d[2] ?? makeContext(0, true),
                after: d[3] ?? makeContext(0, true)
              },
              order: d[4],
              limit: d[5]
            })
          %}

# FROM clause selects videos and/or folders to search
from -> %kw_FROM fromList {% d => d[1] %}
fromList ->
    source                 {% d => [d[0]] %}
  | fromList %comma source {% d => [...d[0], d[2]] %}
source ->
    vid    {% id %}
  | folder {% id %}
vid -> %kw_video %leftParen string %rightParen  {% d => ({ vid: d[2] }) %}
folder -> %kw_folder %leftParen int %rightParen {% d => ({ fid: d[2] }) %}

# WHERE clause indicates what to select
where -> %kw_WHERE andOrExpression {% d => d[1] %}

# Precedence order from highest to lowest
# highest precedence: parentheses
parenthesizedExpression ->
    %leftParen andOrExpression %rightParen {% d => d[1] %}
  | value                                  {% d => ({ value: d[0] }) %}

# second highest precedence: logical not
notExpression ->
    %kw_NOT parenthesizedExpression {% d => ({ not: d[1] }) %}
  | parenthesizedExpression         {% id %}

# third highest precedence: comparison operators (=, !=, <=, etc.)
comparisonExpression ->
    comparisonExpression %comparisonOperator notExpression
    {% d => ({ compare: { op1: d[0], op2: d[2], op: d[1].text } }) %}
  | notExpression {% id %}

# fourth highest precedence: logical conjunction and disjunction
andOrExpression ->
    andOrExpression logicalAndOr comparisonExpression
    {% d => ({ junction: { op1: d[0], op2: d[2], op: d[1].text } }) %}
  | comparisonExpression {% id %}
logicalAndOr ->
    %kw_AND {% id %}
  | %kw_OR {% id %}

# just a plain value
literalValue ->
    intOrFloat                 {% id %}
  | string                     {% id %}
  | boolean                    {% id %}
nonLiteralValue ->
    propertyOfObject           {% id %}
  | functionName functionCall  {% d => makeFunctionCall(d[0], d[1]) %}
value -> literalValue {% id %} | nonLiteralValue {% id %}

# some attribute of some object, e.g., shot[-1].start.x
propertyOfObject -> object %dot propertyPath functionCall:?
  {% d => {
    const ret = { ...d[0], path: d[2] }
    if (d[3]) {
      ret.call = d[3]
    }
    return ret
  }
  %}
object ->
    shotObject   {% id %}
  | rallyObject  {% id %}
  | gameObject   {% id %}
  | playerObject {% id %}
shotObject -> %kw_shot currentOrRelative   {% d => ({ shotOffset: d[1] }) %}
rallyObject -> %kw_rally currentOrRelative {% d => ({ rallyOffset: d[1] }) %}
gameObject -> %kw_game {% () => ({ game: true }) %}  # there is no relative game access
playerObject -> %player {% d => ({ player: d[0].text }) %}
currentOrRelative ->
    indexIntoArray {% d => d[0] %}
  | null           {% d => 0 %}
indexIntoArray -> %leftBracket int %rightBracket {% d => d[1] %}
propertyPath ->
    %identifier                   {% d => [d[0].text] %}
  | propertyPath %dot %identifier {% d => [...d[0], d[2].text] %}

# function call
functionName ->
    %identifier          {% d => d[0].text %}
  | builtInFunctionName  {% id %}
builtInFunctionName -> minOrMax {% id %}
functionCall -> %leftParen functionArgsList %rightParen {% d => d[1] %}
functionArgsList ->
    value                         {% d => [d[0]] %}
  | functionArgsList %comma value {% d => [...d[0], d[2]] %}

# the context window includes shots before/after those selected in the WHERE clause
shotContextBefore -> %shotContextBefore duration {% d => d[1] %}
shotContextAfter -> %shotContextAfter duration   {% d => d[1] %}
duration ->
    intOrFloat %unitSeconds {% d => makeContext(d[0], true) %}
  | int %unitShots          {% d => makeContext(d[0], false) %}
  | minOrMax %leftParen duration %comma duration %rightParen
    {% d => makeContext(makeFunctionCall(d[0], [d[2], d[4]]), false) %}
    # note: doesn't make sense to have a list of durations longer than 2 (one for units in seconds and one for units in shots)
minOrMax ->
    %kw_min {% () => "min" %}
  | %kw_max {% () => "max" %}

# how to sort the results
orderBy -> %orderBy orderByArgsList {% d => d[1] %}
exprWithOrder -> nonLiteralValue %sortOrder:?
  {% d => ({ value: d[0], direction: d[1]?.text ?? 'ASC' }) %}
orderByArgsList ->
    exprWithOrder                         {% d => [d[0]] %}
  | functionArgsList %comma exprWithOrder {% d => [...d[0], d[2]] %}

# how to limit the results
limit -> %kw_LIMIT int
         {% d => ({ n: d[1] }) %}

# literals
boolean ->
    %true          {% firstValue %}
  | %false         {% firstValue %}
float -> %float    {% firstValue %}
int -> %int        {% firstValue %}
string -> %string  {% d => d[0].text.substring(1, d[0].text.length - 1) %}
intOrFloat ->
    int   {% id %}
  | float {% id %}
