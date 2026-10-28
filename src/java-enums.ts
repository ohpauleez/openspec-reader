import type { SyntaxNode, Tree } from '@lezer/common';
import type { JavaDefinition } from './java-document';
import type { JavaBlock } from './java-comments';

export interface JavaEnumConstant { readonly definition: JavaDefinition; readonly docs: readonly JavaBlock[] }
export interface JavaEnum {
  readonly definition: JavaDefinition;
  readonly from: number;
  readonly to: number;
  readonly constants: readonly JavaEnumConstant[];
}

/** An enum with behavior, arguments, or anonymous constant bodies needs its ordinary source view. */
function isSimple(body: SyntaxNode): boolean {
  for (let child = body.firstChild; child; child = child.nextSibling) {
    if (child.type.isError) return false;
    if (child.name === 'EnumConstant') {
      if (child.getChild('ArgumentList') || child.getChild('ClassBody')) return false;
    } else if (child.name === 'EnumBodyDeclarations') {
      for (let member = child.firstChild; member; member = member.nextSibling) {
        if (![';', 'BlockComment', 'LineComment'].includes(member.name)) return false;
      }
    } else if (!['{', '}', ',', ';', 'BlockComment', 'LineComment'].includes(child.name)) return false;
  }
  return true;
}

/** Index only documented, full-line simple enums; retain original constant and comment offsets. */
export function simpleEnums(source: string, tree: Tree, declarations: readonly JavaDefinition[], blocks: readonly JavaBlock[], owners: ReadonlyMap<number, JavaDefinition>): JavaEnum[] {
  const enums: JavaEnum[] = [];
  tree.iterate({ enter(ref) {
    if (ref.name !== 'EnumDeclaration') return;
    const body = ref.node.getChild('EnumBody');
    if (!body || !isSimple(body)) return;
    if (blocks.some((block) => block.kind === 'jml' && body.from < block.from && block.to < body.to)) return;
    const from = source.lastIndexOf('\n', ref.from - 1) + 1;
    const newline = source.indexOf('\n', ref.to);
    const to = newline < 0 ? source.length : newline;
    if (source.slice(from, ref.from).trim() || source.slice(ref.to, to).trim()) return;
    const definition = declarations.find((entry) => entry.kind === 'enum' && entry.rangeFrom === ref.from);
    if (!definition) return;
    const constants: JavaEnumConstant[] = [];
    for (const constant of body.getChildren('EnumConstant')) {
      const name = constant.getChild('Definition');
      const entry = declarations.find((entry) => entry.kind === 'constant' && entry.from === name?.from);
      if (entry) constants.push({ definition: entry, docs: blocks.filter((block) => block.kind === 'javadoc' && owners.get(block.from)?.id === entry.id) });
    }
    if (!constants.length) return;
    const documented = blocks.some((block) => block.kind === 'javadoc' && owners.get(block.from)?.id === definition.id) || constants.some((constant) => constant.docs.length > 0);
    if (documented) enums.push({ definition, from, to, constants });
  } });
  return enums;
}
