// Prints an AST back to canonical PBQL text: minimal parentheses, canonical
// operator spellings and keyword casing. parse(print(ast)) yields the same
// AST (ignoring source locations) — the fuzz tests enforce this.

// binding strength; must mirror the grammar (docs/language.md §3)
function precOf (node) {
  switch (node.kind) {
    case 'or': return 1
    case 'and': return 2
    case 'not': return 3
    case 'cmp':
    case 'in': return 4
    case 'arith': return (node.op === '+' || node.op === '-') ? 5 : 6
    case 'neg': return 7
    default: return 8 // lit, prop, call, parenthesized atoms
  }
}

function quote (s) {
  return `"${s.replace(/[\\"]/g, ch => '\\' + ch)}"`
}

// Numbers print in plain decimal notation: JS renders extreme magnitudes
// with an exponent ("1e-7", "1e+21"), which the lexer does not admit, so
// the exponent is expanded. The expansion is exact (same digits, shifted
// point), so the printed text reparses to the identical value.
function printNumber (value) {
  const text = String(value)
  const match = text.match(/^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/)
  if (match === null) {
    return text
  }
  // JS e-notation always has a single integer digit, so the point lands
  // either at/below zero or at/past the end of the digits
  const [, sign, whole, frac = '', exp] = match
  const digits = whole + frac
  const point = whole.length + Number(exp)
  return point <= 0
    ? `${sign}0.${'0'.repeat(-point)}${digits}`
    : sign + digits + '0'.repeat(point - digits.length)
}

function printLiteral (value) {
  if (typeof value === 'string') {
    return quote(value)
  }
  return typeof value === 'number' ? printNumber(value) : String(value)
}

// prints child, parenthesized when its binding is too loose for the slot
function sub (child, minPrec) {
  const text = printExpr(child)
  return precOf(child) < minPrec ? `(${text})` : text
}

export function printExpr (node) {
  switch (node.kind) {
    case 'lit':
      return printLiteral(node.value)
    case 'prop': {
      const { base } = node
      // the only player root is `me`; hitter/teammate/opponent… are path
      // segments, so player navigation prints straight from base + path
      let text = base.object === 'player' ? base.root : base.object
      if ((base.object === 'shot' || base.object === 'rally') && base.offset !== 0) {
        text += `[${base.offset}]`
      }
      if (node.path.length > 0) {
        text += '.' + node.path.join('.')
      }
      if (node.args) {
        text += `(${node.args.map(printExpr).join(', ')})`
      }
      return text
    }
    case 'call':
      return `${node.name}(${node.args.map(printExpr).join(', ')})`
    case 'neg': {
      const arg = sub(node.arg, 7)
      // avoid "--x" (which still parses, but reads badly)
      return arg.startsWith('-') ? `- ${arg}` : `-${arg}`
    }
    case 'arith': {
      const prec = precOf(node)
      // left-associative: the right side needs parens at equal precedence
      return `${sub(node.lhs, prec)} ${node.op} ${sub(node.rhs, prec + 1)}`
    }
    case 'cmp':
      return `${sub(node.lhs, 5)} ${node.op} ${sub(node.rhs, 5)}`
    case 'in':
      return `${sub(node.lhs, 5)} IN (${node.list.map(printLiteral).join(', ')})`
    case 'not':
      return `NOT ${sub(node.arg, 3)}`
    case 'and':
      return node.args.map(a => sub(a, 3)).join(' AND ')
    case 'or':
      return node.args.map(a => sub(a, 2)).join(' OR ')
  }
}

export function printDuration (dur) {
  if (dur.kind === 'durfn') {
    return `${dur.fn}(${dur.args.map(printDuration).join(', ')})`
  }
  if (dur.unit === 'rally') {
    return 'rally'
  }
  return dur.unit === 'secs'
    ? `${printNumber(dur.value)}${dur.value === 1 ? 'sec' : 'secs'}`
    : `${printNumber(dur.value)} ${dur.value === 1 ? 'shot' : 'shots'}`
}

function isZeroDur (dur) {
  return dur.kind === 'dur' && dur.unit === 'secs' && dur.value === 0
}

export function print (query) {
  const lines = []
  if (query.select) {
    lines.push('SELECT ' + query.select.map(({ expr, label }) =>
      label === null ? printExpr(expr) : `${printExpr(expr)} AS ${quote(label)}`
    ).join(', '))
  }
  // sources are opaque strings; hosts interpret them
  lines.push('FROM ' + query.sources.map(quote).join(', '))
  lines.push('WHERE ' + printExpr(query.where))
  if (query.groupBy) {
    lines.push('GROUP BY ' + query.groupBy.map(printExpr).join(', '))
  }
  const { before, after } = query.context
  if (!isZeroDur(before)) {
    lines.push('CONTEXT BEFORE ' + printDuration(before))
  }
  if (!isZeroDur(after)) {
    lines.push('CONTEXT AFTER ' + printDuration(after))
  }
  if (query.orderBy) {
    lines.push('ORDER BY ' + query.orderBy.map(({ expr, dir }) =>
      dir === 'desc' ? `${printExpr(expr)} DESC` : printExpr(expr)
    ).join(', '))
  }
  if (query.limit !== null) {
    lines.push(`LIMIT ${printNumber(query.limit)}`)
  }
  return lines.join('\n')
}
