import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import { toHtml } from 'hast-util-to-html';
import type { Element, ElementContent, Root as HastRoot, RootContent, Text } from 'hast';
import type { Content, Parent, Root } from 'mdast';
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx';
import type { Options as RemarkRehypeOptions } from 'remark-rehype';
import type { SortedResult } from '../contracts';
import type { SearchHit } from './types';
import { buildRegexFromQuery, createContentHighlighter } from './highlight';
import { highlightCodeBlock, parseCodeBlock } from './code';

export async function mapHitsToSortedResults(
  hits: SearchHit[],
  query: string,
  transformUrl: (url: string) => string = (url) => url,
): Promise<SortedResult[]> {
  const highlighter = createContentHighlighter(query);
  const results: SortedResult[] = [];
  const seenSections = new Set<string>();
  let previousSectionKey: string | undefined;
  let idCounter = 0;

  for (const hit of hits) {
    const url = transformUrl(hit.url);
    const heading = hit.heading ?? '';
    const sectionKey = `${hit.pageTitle} ${heading}`;

    const contentMatched = (hit._formatted?.rawContent ?? '').includes('<mark>');

    if (!contentMatched && seenSections.has(sectionKey)) {
      continue;
    }

    if (sectionKey !== previousSectionKey) {
      results.push({
        id: `${url}_${idCounter++}`,
        type: 'page',
        content: highlighter.highlightMarkdown(heading),
        breadcrumbs: [hit.pageTitle],
        url,
      });
    }

    seenSections.add(sectionKey);
    previousSectionKey = sectionKey;

    if (!contentMatched) {
      continue;
    }

    const codeBlock = parseCodeBlock(hit.rawContent);
    const content = codeBlock
      ? await highlightCodeBlock(codeBlock, query)
      : await renderContent(hit.rawContent, query);

    results.push({
      id: `${url}_${idCounter++}`,
      type: 'text',
      content,
      url,
    });
  }

  return results;
}

const MDX_TEXT_ATTRIBUTES = ['title', 'description', 'label'];

/**
 * Minimal structural view of the mdast-util-to-hast State used by handlers.
 */
interface RehypeState {
  all: (node: Parent) => ElementContent[];
  patch: (from: Content, to: HastRoot | Element) => undefined;
}

function mdxJsxHandler(
  state: RehypeState,
  node: MdxJsxFlowElement | MdxJsxTextElement,
): ElementContent[] {
  const name = typeof node.name === 'string' ? node.name : '';
  const children = state.all(node as unknown as Parent);

  if (/^[a-z]/.test(name)) {
    const properties: Record<string, string> = {};
    for (const attr of node.attributes) {
      if (attr.type === 'mdxJsxAttribute' && typeof attr.value === 'string') {
        properties[attr.name] = attr.value;
      }
    }
    const element: Element = { type: 'element', tagName: name, properties, children };
    state.patch(node as unknown as Content, element);
    return [element];
  }

  const salvaged = MDX_TEXT_ATTRIBUTES.map((attributeName) => {
    for (const attr of node.attributes) {
      if (attr.type === 'mdxJsxAttribute' && attr.name === attributeName) {
        const text = typeof attr.value === 'string' ? attr.value : '';
        return text ? strongParagraph(text) : undefined;
      }
    }
    return undefined;
  }).filter((node): node is Element => node !== undefined);

  return [...salvaged, ...children];
}

function strongParagraph(text: string): Element {
  return {
    type: 'element',
    tagName: 'p',
    properties: {},
    children: [
      {
        type: 'element',
        tagName: 'strong',
        properties: {},
        children: [{ type: 'text', value: text }],
      },
    ],
  };
}

function createProcessor(strict: boolean) {
  return (strict ? remark().use(remarkMdx) : remark())
    .use(remarkGfm)
    .use(remarkRehype, {
      allowDangerousHtml: true,
      unknownHandler: () => [],
      handlers: {
        mdxJsxFlowElement: mdxJsxHandler,
        mdxJsxTextElement: mdxJsxHandler,
        // image: () => [],
      },
    } as RemarkRehypeOptions)
    .use(rehypeRaw);
}

async function renderContent(rawContent: string, query: string): Promise<string> {
  let tree: Root;
  let processor: ReturnType<typeof createProcessor>;

  try {
    processor = createProcessor(true);
    tree = processor.parse(rawContent) as Root;
  } catch {
    processor = createProcessor(false);
    tree = processor.parse(rawContent) as Root;
  }

  const hast = (await processor.run(tree)) as HastRoot;

  pruneEmptyParagraphs(hast);

  const regex = buildRegexFromQuery(query);
  if (regex) highlightHast(hast, regex);

  return toHtml(hast).trim();
}

function pruneEmptyParagraphs(parent: { children: RootContent[] }): void {
  parent.children = parent.children
    .filter((child) => {
      if (child.type !== 'element' || child.tagName !== 'p') return true;
      return child.children.some(
        (inner) =>
          (inner.type === 'text' && inner.value.trim().length > 0) ||
          (inner.type !== 'text' && inner.type !== 'comment'),
      );
    })
    .map((child) => {
      if ('children' in child) pruneEmptyParagraphs(child as { children: RootContent[] });
      return child;
    });
}

function highlightHast(tree: HastRoot, regex: RegExp): void {
  const walk = (parent: { children: RootContent[] }) => {
    parent.children = parent.children.flatMap((child) => {
      if (child.type === 'text') return markText(child, regex) ?? [child];
      if ('children' in child) walk(child as { children: RootContent[] });
      return [child];
    });
  };
  walk(tree);
}

function markText(node: Text, regex: RegExp): RootContent[] | null {
  regex.lastIndex = 0;
  if (!regex.test(node.value)) {
    regex.lastIndex = 0;
    return null;
  }

  regex.lastIndex = 0;
  const out: RootContent[] = [];
  let i = 0;
  for (const match of node.value.matchAll(regex)) {
    const start = match.index ?? 0;
    if (start > i) out.push({ type: 'text', value: node.value.slice(i, start) });
    out.push({
      type: 'element',
      tagName: 'mark',
      properties: {},
      children: [{ type: 'text', value: match[0] }],
    });
    i = start + match[0].length;
  }
  if (i < node.value.length) out.push({ type: 'text', value: node.value.slice(i) });

  return out;
}
