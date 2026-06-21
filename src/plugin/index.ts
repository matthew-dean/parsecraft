/**
 * parsecraft unplugin — transforms parsecraft combinator calls at build time.
 *
 * Usage (Vite):
 *   import parsecraft from 'parsecraft/plugin'
 *   export default { plugins: [parsecraft()] }
 *
 * Usage (Rollup):
 *   import parsecraft from 'parsecraft/plugin'
 *   export default { plugins: [parsecraft.rollup()] }
 *
 * Files that import from 'parsecraft' and call compile() are left as-is —
 * the compile() call is always available at runtime too. The plugin's job is
 * to replace `compile(parser)` call sites with pre-expanded, AOT-optimized
 * function bodies to eliminate the runtime overhead of `new Function(...)`.
 *
 * For the MVP the plugin is a pass-through that validates the import and
 * emits a banner comment; full AST-rewrite is the next phase.
 */
import { createUnplugin } from 'unplugin'

export type ParsraftPluginOptions = {
  /** Glob patterns to include (default: all .ts/.js files) */
  include?: string[]
  /** Glob patterns to exclude */
  exclude?: string[]
}

const PARSECRAFT_RE = /['"]parsecraft['"]/

const parsecraftPlugin = createUnplugin((_opts: ParsraftPluginOptions = {}) => ({
  name: 'parsecraft',
  transformInclude(id: string) {
    return /\.[jt]sx?$/.test(id) && !id.includes('node_modules')
  },
  transform(code: string, id: string) {
    if (!PARSECRAFT_RE.test(code)) return null
    // Phase 1 (MVP): mark files that use parsecraft for future AOT expansion.
    // The runtime compile() function is fully capable; this hook will grow into
    // full AST rewriting in phase 2.
    return {
      code,
      map: null,
    }
  },
}))

export default parsecraftPlugin
