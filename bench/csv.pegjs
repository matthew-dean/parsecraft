CSV
  = lines:CompleteLine* last:Row
  {
    if (last.length === 1 && last[0] === '') return lines
    return [...lines, last]
  }

CompleteLine
  = row:Row nl:("\r\n" / "\n") { return row }

Row = head:Field tail:("," f:Field { return f })*
  { return [head, ...tail] }

Field
  = QuotedField
  / UnquotedField

QuotedField
  = '"' parts:QuotedChar* '"'
  { return parts.join('') }

QuotedChar
  = '""' { return '"' }
  / c:[^"] { return c }

UnquotedField
  = chars:[^,\r\n]* { return chars.join('') }
