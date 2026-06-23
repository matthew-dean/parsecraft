/**
 * parseman unplugin — macro transform
 *
 * Handles:  import { ... } from 'parseman' with { type: 'macro' }
 *
 * For each such import, walks the file's AST, finds variable declarations
 * whose RHS is a pure parseman combinator call, evaluates them at build time,
 * compiles the result to an optimized inline function, and replaces the
 * declaration — removing the import entirely.
 *
 * Usage:
 *   // vite.config.ts
 *   import parseman from 'parseman/plugin'
 *   export default { plugins: [parseman()] }
 *
 *   // rollup.config.js
 *   import parseman from 'parseman/plugin'
 *   export default { plugins: [parseman.rollup()] }
 */
import { createUnplugin } from 'unplugin'
import { parseSync } from 'oxc-parser'
import MagicString from 'magic-string'
import { evaluateExpr, evaluateParserFactory, referencesAny, type Scope, type ScopeEntry } from './evaluator.ts'
import { compile } from '../compiler/codegen.ts'
import type { Combinator } from '../types.ts'
import type {
  ImportDeclaration,
  VariableDeclarator,
  VariableDeclaration,
  Expression,
  Statement,
  ExportNamedDeclaration,
} from '@oxc-project/types'

export type ParsecraftPluginOptions = {
  /** Extra module specifiers to treat as parseman re-exports */
  moduleAliases?: string[]
}

const PARSEMAN_MODULE = 'parseman'

export default createUnplugin((opts: ParsecraftPluginOptions = {}) => ({
  name: 'parseman',

  transformInclude(id: string) {
    return /\.[jt]sx?$/.test(id) && !id.includes('node_modules')
  },

  transform(code: string, id: string) {
    if (!code.includes('parseman')) return null
    if (!code.includes('macro')) return null
    const moduleAliases = new Set([PARSEMAN_MODULE, ...(opts.moduleAliases ?? [])])
    return transformMacro(code, id, moduleAliases)
  },
}))

// ---------------------------------------------------------------------------
// Core transform (exported for testing)
// ---------------------------------------------------------------------------

type ImportInfo = {
  start: number
  end: number
  names: Set<string>
  fullyResolved: boolean   // mutated after evaluation
}

export function transformMacro(
  code: string,
  id: string,
  moduleAliases = new Set([PARSEMAN_MODULE]),
): { code: string; map: ReturnType<MagicString['generateMap']> } | null {
  let result: ReturnType<typeof parseSync>
  try {
    result = parseSync(id, code)
  } catch {
    return null
  }
  if (result.errors.length > 0) return null

  const body = result.program.body

  // --- Pass 1: collect macro imports ---
  const macroImports: ImportInfo[] = []
  const allNames = new Set<string>()

  for (const stmt of body) {
    if (stmt.type !== 'ImportDeclaration') continue
    const s = stmt as ImportDeclaration
    if (!moduleAliases.has(s.source.value)) continue

    // Check `with { type: 'macro' }` — oxc exposes this as ImportDeclaration.attributes
    const isMacro = s.attributes.some(a => {
      const key = a.key.type === 'Identifier' ? a.key.name : String(a.key.value)
      return key === 'type' && a.value.value === 'macro'
    })
    if (!isMacro) continue

    const names = new Set<string>()
    for (const spec of s.specifiers) {
      if (spec.type === 'ImportSpecifier') names.add(spec.local.name)
    }
    macroImports.push({ start: s.start, end: s.end, names, fullyResolved: false })
    for (const n of names) allNames.add(n)
  }

  if (macroImports.length === 0) return null

  // --- Pass 2: evaluate declarations in source order ---
  // Scope stores enriched ScopeEntry objects so evaluateParserFactory can
  // replay mfSrcs when outer-scope combinators are referenced inside factories.
  const scope: Scope = new Map<string, ScopeEntry>()
  const replacements: Array<{ start: number; end: number; replacement: string }> = []
  let anyUnresolved = false

  for (const stmt of body as Statement[]) {
    // Handle both direct VariableDeclarations and exported ones
    let vd: VariableDeclaration | null = null
    let stmtStart = stmt.start
    let stmtEnd = stmt.end
    let exportPrefix = ''

    if (stmt.type === 'VariableDeclaration') {
      vd = stmt as unknown as VariableDeclaration
    } else if (stmt.type === 'ExportNamedDeclaration') {
      const expStmt = stmt as unknown as ExportNamedDeclaration
      if (expStmt.declaration?.type === 'VariableDeclaration') {
        vd = expStmt.declaration as unknown as VariableDeclaration
        exportPrefix = 'export '
      }
    }

    if (!vd) continue

    for (const decl of vd.declarations) {
      const d = decl as VariableDeclarator
      if (!d.init) continue
      const init = d.init as Expression
      const kind = (vd as unknown as { kind: string }).kind ?? 'const'

      if ((d.id as unknown as { type: string }).type === 'Identifier') {
        // ── Simple binding: const name = <expr> ──────────────────────────
        const varName = (d.id as unknown as { name: string }).name
        if (!referencesAny(init, allNames, scope)) continue

        const mapFnSources: string[] = []
        const parser = evaluateExpr(init, scope, code, mapFnSources)
        if (parser === null) { anyUnresolved = true; continue }

        const compiled = compile(parser, mapFnSources.length ? mapFnSources : undefined)
        if (compiled.inlineExpression === null) { anyUnresolved = true; continue }

        replacements.push({
          start: init.start,
          end: init.end,
          replacement: compiled.inlineExpression,
        })

        // Store enriched scope entry so factories can replay mfSrcs
        scope.set(varName, { combi: parser, mfSrcs: mapFnSources })

      } else if ((d.id as unknown as { type: string }).type === 'ObjectPattern') {
        // ── Destructured binding: const { a, b } = rules(g => { ... }) ──
        // Only handle rules() factory calls
        if (init.type !== 'CallExpression') continue
        const calleeType = (init as unknown as { callee: { type: string; name?: string } }).callee
        if (calleeType.type !== 'Identifier' || calleeType.name !== 'rules') continue
        if (!referencesAny(init, allNames, scope)) continue

        const args = (init as unknown as { arguments: unknown[] }).arguments
        const factoryArg = args[0] as Expression | undefined
        if (!factoryArg) { anyUnresolved = true; continue }

        const mapFnSources: string[] = []
        const ruleMap = evaluateParserFactory(factoryArg, scope, code, mapFnSources)
        if (!ruleMap) { anyUnresolved = true; continue }

        // Walk the ObjectPattern properties and compile each rule
        const pattern = d.id as unknown as { properties: unknown[] }
        const lines: string[] = []
        let allOk = true
        let mfOffset = 0  // mapFnSources is shared; each rule uses a sub-slice

        for (const prop of pattern.properties) {
          const p = prop as { type: string; key: { type: string; name?: string; value?: unknown }; value: { type: string; name?: string } }
          if (p.type === 'RestElement' || p.type === 'BindingRestElement') { allOk = false; break }

          const ruleKey = p.key.type === 'Identifier' ? p.key.name!
            : p.key.type === 'StringLiteral' ? String(p.key.value)
            : null
          const localName = (p.value.type === 'Identifier' || p.value.type === 'BindingIdentifier') ? p.value.name!
            : ruleKey
          if (!ruleKey || !localName) { allOk = false; break }

          const rule = ruleMap.get(ruleKey)
          if (!rule) { allOk = false; break }

          const compiled = compile(rule, mapFnSources.length ? mapFnSources : undefined)
          if (compiled.inlineExpression === null) { allOk = false; break }

          lines.push(`${exportPrefix}${kind} ${localName} = ${compiled.inlineExpression}`)
          // Store in scope so subsequent declarations can reference compiled rules
          scope.set(localName, { combi: rule, mfSrcs: mapFnSources })
        }

        if (!allOk) { anyUnresolved = true; continue }

        replacements.push({
          start: stmtStart,
          end: stmtEnd,
          replacement: lines.join('\n'),
        })
      }
    }
  }

  if (replacements.length === 0) return null

  // If every declaration referencing an imported name was successfully inlined,
  // the import is no longer needed. Otherwise downgrade to runtime.
  for (const imp of macroImports) {
    imp.fullyResolved = !anyUnresolved
  }

  const ms = new MagicString(code)

  for (const imp of macroImports) {
    if (imp.fullyResolved) {
      ms.remove(imp.start, imp.end)
    } else {
      // Strip only the macro attribute, keep the import
      const original = code.slice(imp.start, imp.end)
      const stripped = original
        .replace(/\s+with\s*\{[^}]*\}/gs, '')
        .replace(/\s+assert\s*\{[^}]*\}/gs, '')
      ms.overwrite(imp.start, imp.end, stripped)
    }
  }

  for (const { start, end, replacement } of [...replacements].sort((a, b) => b.start - a.start)) {
    ms.overwrite(start, end, replacement)
  }

  return {
    code: ms.toString(),
    map: ms.generateMap({ hires: true }),
  }
}
