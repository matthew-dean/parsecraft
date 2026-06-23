/**
 * Chevrotain GraphQL executable-document parser for benchmark comparison.
 * Implements the same grammar as the official Chevrotain GraphQL example,
 * restricted to executable definitions (operations + fragments).
 */
import { CstParser, Lexer, createToken } from 'chevrotain'
import XRegExp from 'xregexp'

// ---------------------------------------------------------------------------
// Tokens — declared in precedence order (longer_alt before Name)
// ---------------------------------------------------------------------------
const WhiteSpace     = createToken({ name: 'WhiteSpace',     pattern: /[ \t]+/,    group: Lexer.SKIPPED })
const LineTerminator = createToken({ name: 'LineTerminator', pattern: /\n\r|\r|\n/, group: Lexer.SKIPPED })
const Comment        = createToken({ name: 'Comment',        pattern: /#[^\n\r]*/,  group: Lexer.SKIPPED })
const Comma          = createToken({ name: 'Comma',          pattern: ',',          group: Lexer.SKIPPED })

const Name = createToken({ name: 'Name', pattern: /[_A-Za-z][_0-9A-Za-z]*/ })

function keyword(word: string) {
  const cap = word[0].toUpperCase() + word.slice(1)
  return createToken({ name: cap, pattern: new RegExp(word), longer_alt: Name })
}

const Query        = keyword('query')
const Mutation     = keyword('mutation')
const Subscription = keyword('subscription')
const Fragment     = keyword('fragment')
const On           = keyword('on')
const True         = keyword('true')
const False        = keyword('false')
const Null         = keyword('null')

const Exclamation = createToken({ name: 'Exclamation', pattern: '!' })
const Dollar      = createToken({ name: 'Dollar',      pattern: '$' })
const LParen      = createToken({ name: 'LParen',      pattern: '(' })
const RParen      = createToken({ name: 'RParen',      pattern: ')' })
const DotDotDot   = createToken({ name: 'DotDotDot',   pattern: '...' })
const Colon       = createToken({ name: 'Colon',       pattern: ':' })
const Equals      = createToken({ name: 'Equals',      pattern: '=' })
const At          = createToken({ name: 'At',          pattern: '@' })
const LSquare     = createToken({ name: 'LSquare',     pattern: '[' })
const RSquare     = createToken({ name: 'RSquare',     pattern: ']' })
const LCurly      = createToken({ name: 'LCurly',      pattern: '{' })
const RCurly      = createToken({ name: 'RCurly',      pattern: '}' })

const frags: Record<string, RegExp> = {}
function F(k: string, v: string) { frags[k] = XRegExp.build(v, frags) }
function P(v: string) { return XRegExp.build(v, frags) }
F('IntPart',   '-?(0|[1-9][0-9]*)')
F('FracPart',  '\\.[0-9]+')
F('ExpPart',   '[eE][+-]?[0-9]+')
F('StrChar',   '(?:[^\\\\"\\n\\r]|\\\\(?:["\\\\\\/bfnrt]|u[0-9a-fA-F]{4}))')
F('BlockChar', '\\\\"""|[^"]|"(?!"")')
const IntValue    = createToken({ name: 'IntValue',    pattern: P('{{IntPart}}') })
const FloatValue  = createToken({ name: 'FloatValue',  pattern: P('{{IntPart}}{{FracPart}}({{ExpPart}})?|{{IntPart}}{{ExpPart}}') })
const StringValue = createToken({ name: 'StringValue', pattern: P('"""(?:{{BlockChar}})*"""|"(?:{{StrChar}})*"') })

const allTokens = [
  WhiteSpace, LineTerminator, Comment, Comma,
  Query, Mutation, Subscription, Fragment, On, True, False, Null,
  DotDotDot, Exclamation, Dollar, LParen, RParen, Colon, Equals,
  At, LSquare, RSquare, LCurly, RCurly,
  FloatValue, IntValue, StringValue, Name,
]

const GraphQLLexer = new Lexer(allTokens)

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------
class GQLParser extends CstParser {
  constructor() {
    super(allTokens)
    const $ = this

    $.RULE('Document', () => {
      $.AT_LEAST_ONE(() => $.SUBRULE($.Definition))
    })

    $.RULE('Definition', () => {
      $.OR([
        { ALT: () => $.SUBRULE($.OperationDefinition) },
        { ALT: () => $.SUBRULE($.FragmentDefinition) },
      ])
    })

    $.RULE('OperationDefinition', () => {
      $.OR([
        { ALT: () => $.SUBRULE($.SelectionSet) },
        { ALT: () => {
          $.SUBRULE($.OperationType)
          $.OPTION(() => $.CONSUME(Name))
          $.OPTION2(() => $.SUBRULE($.VariableDefinitions))
          $.OPTION3(() => $.SUBRULE($.Directives))
          $.SUBRULE2($.SelectionSet)
        }},
      ])
    })

    $.RULE('OperationType', () => {
      $.OR([
        { ALT: () => $.CONSUME(Query) },
        { ALT: () => $.CONSUME(Mutation) },
        { ALT: () => $.CONSUME(Subscription) },
      ])
    })

    $.RULE('SelectionSet', () => {
      $.CONSUME(LCurly)
      $.AT_LEAST_ONE(() => $.SUBRULE($.Selection))
      $.CONSUME(RCurly)
    })

    $.RULE('Selection', () => {
      $.OR([
        { ALT: () => $.SUBRULE($.Field) },
        { ALT: () => $.SUBRULE($.FragmentSpread) },
        { ALT: () => $.SUBRULE($.InlineFragment) },
      ])
    })

    $.RULE('Field', () => {
      $.OPTION(() => $.SUBRULE($.Alias))
      $.CONSUME(Name)
      $.OPTION2(() => $.SUBRULE($.Arguments))
      $.OPTION3(() => $.SUBRULE($.Directives))
      $.OPTION4(() => $.SUBRULE($.SelectionSet))
    })

    $.RULE('Alias', () => {
      $.CONSUME(Name)
      $.CONSUME(Colon)
    })

    $.RULE('Arguments', () => {
      $.CONSUME(LParen)
      $.AT_LEAST_ONE(() => $.SUBRULE($.Argument))
      $.CONSUME(RParen)
    })

    $.RULE('Argument', () => {
      $.CONSUME(Name)
      $.CONSUME(Colon)
      $.SUBRULE($.Value)
    })

    $.RULE('FragmentSpread', () => {
      $.CONSUME(DotDotDot)
      $.CONSUME(Name)
      $.OPTION(() => $.SUBRULE($.Directives))
    })

    $.RULE('InlineFragment', () => {
      $.CONSUME(DotDotDot)
      $.OPTION(() => $.SUBRULE($.TypeCondition))
      $.OPTION2(() => $.SUBRULE($.Directives))
      $.SUBRULE($.SelectionSet)
    })

    $.RULE('FragmentDefinition', () => {
      $.CONSUME(Fragment)
      $.CONSUME(Name)
      $.SUBRULE($.TypeCondition)
      $.OPTION(() => $.SUBRULE($.Directives))
      $.SUBRULE($.SelectionSet)
    })

    $.RULE('TypeCondition', () => {
      $.CONSUME(On)
      $.CONSUME(Name)
    })

    $.RULE('Value', () => {
      $.OR([
        { ALT: () => $.SUBRULE($.Variable) },
        { ALT: () => $.CONSUME(IntValue) },
        { ALT: () => $.CONSUME(FloatValue) },
        { ALT: () => $.CONSUME(StringValue) },
        { ALT: () => $.CONSUME(True) },
        { ALT: () => $.CONSUME(False) },
        { ALT: () => $.CONSUME(Null) },
        { ALT: () => $.CONSUME(Name) },
        { ALT: () => $.SUBRULE($.ListValue) },
        { ALT: () => $.SUBRULE($.ObjectValue) },
      ])
    })

    $.RULE('ListValue', () => {
      $.CONSUME(LSquare)
      $.MANY(() => $.SUBRULE($.Value))
      $.CONSUME(RSquare)
    })

    $.RULE('ObjectValue', () => {
      $.CONSUME(LCurly)
      $.MANY(() => $.SUBRULE($.ObjectField))
      $.CONSUME(RCurly)
    })

    $.RULE('ObjectField', () => {
      $.CONSUME(Name)
      $.CONSUME(Colon)
      $.SUBRULE($.Value)
    })

    $.RULE('VariableDefinitions', () => {
      $.CONSUME(LParen)
      $.AT_LEAST_ONE(() => $.SUBRULE($.VariableDefinition))
      $.CONSUME(RParen)
    })

    $.RULE('VariableDefinition', () => {
      $.SUBRULE($.Variable)
      $.CONSUME(Colon)
      $.SUBRULE($.Type)
      $.OPTION(() => $.SUBRULE($.DefaultValue))
    })

    $.RULE('Variable', () => {
      $.CONSUME(Dollar)
      $.CONSUME(Name)
    })

    $.RULE('DefaultValue', () => {
      $.CONSUME(Equals)
      $.SUBRULE($.Value)
    })

    $.RULE('Type', () => {
      $.OR([
        { ALT: () => { $.CONSUME(Name); $.OPTION(() => $.CONSUME(Exclamation)) } },
        { ALT: () => {
          $.CONSUME(LSquare)
          $.SUBRULE($.Type)
          $.CONSUME(RSquare)
          $.OPTION2(() => $.CONSUME2(Exclamation))
        }},
      ])
    })

    $.RULE('Directives', () => {
      $.AT_LEAST_ONE(() => $.SUBRULE($.Directive))
    })

    $.RULE('Directive', () => {
      $.CONSUME(At)
      $.CONSUME(Name)
      $.OPTION(() => $.SUBRULE($.Arguments))
    })

    this.performSelfAnalysis()
  }

  Document!: () => unknown
  Definition!: () => unknown
  OperationDefinition!: () => unknown
  OperationType!: () => unknown
  SelectionSet!: () => unknown
  Selection!: () => unknown
  Field!: () => unknown
  Alias!: () => unknown
  Arguments!: () => unknown
  Argument!: () => unknown
  FragmentSpread!: () => unknown
  InlineFragment!: () => unknown
  FragmentDefinition!: () => unknown
  TypeCondition!: () => unknown
  Value!: () => unknown
  ListValue!: () => unknown
  ObjectValue!: () => unknown
  ObjectField!: () => unknown
  VariableDefinitions!: () => unknown
  VariableDefinition!: () => unknown
  Variable!: () => unknown
  DefaultValue!: () => unknown
  Type!: () => unknown
  Directives!: () => unknown
  Directive!: () => unknown
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------
export function buildChevrotainGraphQL(): (input: string) => unknown {
  const parser = new GQLParser()
  return (input: string) => {
    const { tokens, errors } = GraphQLLexer.tokenize(input)
    if (errors.length) throw new Error(errors[0].message)
    parser.input = tokens
    const result = parser.Document()
    if (parser.errors.length) throw new Error(parser.errors[0].message)
    return result
  }
}
