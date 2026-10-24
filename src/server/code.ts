import { buildRegexFromQuery } from './highlight';
import { codeToHtml } from 'shiki';
import type { ShikiTransformer } from 'shiki';
import type { Element, ElementContent, Root } from 'hast';
import type { Code } from 'mdast';
import type { ParsedCodeBlock } from './types';
import { remark } from 'remark';

const parser = remark();

export function parseCodeBlock(content: string): ParsedCodeBlock | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const code = singleCodeNode(parser.parse(trimmed));
  if (!code) {
    return null;
  }

  return {
    lang: code.lang || 'text',
    code: code.value,
  };
}

function singleCodeNode(tree: { children: unknown[] }): Code | undefined {
  const first = tree.children[0];
  return tree.children.length === 1 && first && (first as Code).type === 'code'
    ? (first as Code)
    : undefined;
}

function highlightHastNode(node: Element | Root, regex: RegExp): void {
  if (node.type === 'element' && node.tagName === 'span') {
    const text = node.children
      .filter((child): child is ElementContent & { value: string } => child.type === 'text')
      .map((child) => child.value)
      .join('');

    const matches = text ? [...text.matchAll(regex)] : [];
    if (matches.length > 0) {
      const children: ElementContent[] = [];
      let lastIndex = 0;

      const pushText = (value: string) => {
        if (value) children.push({ type: 'text', value });
      };

      for (const match of matches) {
        const start = match.index ?? 0;
        pushText(text.slice(lastIndex, start));
        children.push({
          type: 'element',
          tagName: 'mark',
          properties: {},
          children: [{ type: 'text', value: match[0] }],
        });
        lastIndex = start + match[0].length;
      }
      pushText(text.slice(lastIndex));

      node.children = children;
      return;
    }
  }

  for (const child of node.children) {
    if (child.type === 'element') highlightHastNode(child, regex);
  }
}

export async function highlightCodeBlock(
  codeBlock: ParsedCodeBlock,
  query: string,
): Promise<string> {
  const wordHighlightTransformer: ShikiTransformer = {
    name: 'word-highlight',
    code(node) {
      const regex = buildRegexFromQuery(query);
      if (regex) highlightHastNode(node, regex);
    },
  };

  const blockHeightTransformer: ShikiTransformer = {
    name: 'code-block-height',
    pre(node) {
      node.properties.style = `max-height: none; height: auto; ${node.properties?.style || ''}`;
    },
  };

  return codeToHtml(codeBlock.code, {
    lang: codeBlock.lang,
    theme: 'one-dark-pro',
    transformers: [wordHighlightTransformer, blockHeightTransformer],
  });
}
