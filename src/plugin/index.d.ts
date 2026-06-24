import MagicString from 'magic-string';
export type ParsecraftPluginOptions = {
    /** Extra module specifiers to treat as parseman re-exports */
    moduleAliases?: string[];
};
declare const _default: import("unplugin").UnpluginInstance<ParsecraftPluginOptions, boolean>;
export default _default;
export declare function transformMacro(code: string, id: string, moduleAliases?: Set<string>): {
    code: string;
    map: ReturnType<MagicString['generateMap']>;
} | null;
