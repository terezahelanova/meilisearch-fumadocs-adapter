import { remark } from 'remark';
import type { Html, InlineCode, Root, RootContent, Text } from 'mdast';

export interface HighlightedText<Content = string> {
  type: 'text';
  content: Content;
  styles?: {
    highlight?: boolean;
  };
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Implementation from Fumadocs core package
 */
export function buildRegexFromQuery(query: string): RegExp | null {
  const source = query
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '|');
  return source ? new RegExp(source, 'gi') : null;
}

const processor = remark();

/**
 * Implementation from Fumadocs core package
 */
export function createContentHighlighter(query: string) {
  const regex = buildRegexFromQuery(query);

  return {
    highlight(content: string): HighlightedText[] {
      if (!regex) return [{ type: 'text', content }];
      const out: HighlightedText[] = [];

      let i = 0;
      for (const match of content.matchAll(regex)) {
        if (i < match.index) {
          out.push({
            type: 'text',
            content: content.substring(i, match.index),
          });
        }

        out.push({
          type: 'text',
          content: match[0],
          styles: {
            highlight: true,
          },
        });

        i = match.index + match[0].length;
      }

      if (i < content.length) {
        out.push({
          type: 'text',
          content: content.substring(i),
        });
      }

      return out;
    },
    highlightMarkdown(content: string): string {
      if (!regex) return content;
      const tree = processor.parse(content);
      highlightInTree(tree, regex);
      return processor.stringify(tree).trim();
    },
  };
}

interface Segment {
  value: string;
  match: boolean;
}

function splitByRegex(value: string, regex: RegExp): Segment[] | null {
  regex.lastIndex = 0;

  const segments: Segment[] = [];
  let i = 0;
  let matched = false;

  for (const match of value.matchAll(regex)) {
    matched = true;
    const start = match.index ?? 0;
    if (start > i) segments.push({ value: value.substring(i, start), match: false });
    segments.push({ value: match[0], match: true });
    i = start + match[0].length;
  }

  if (!matched) return null;
  if (i < value.length) segments.push({ value: value.substring(i), match: false });

  return segments;
}

function wrapSegments(
  nodeType: 'text' | 'inlineCode',
  segments: Segment[],
): (Text | InlineCode | Html)[] {
  const out: (Text | InlineCode | Html)[] = [];
  for (const segment of segments) {
    if (segment.match) {
      out.push({ type: 'html', value: '<mark>' });
      out.push({ type: nodeType, value: segment.value });
      out.push({ type: 'html', value: '</mark>' });
    } else {
      out.push({ type: nodeType, value: segment.value });
    }
  }
  return out;
}

function highlightInTree(tree: Root, regex: RegExp) {
  const walk = (parent: { children: RootContent[] }) => {
    parent.children = parent.children.flatMap((child): RootContent[] => {
      if (child.type === 'text' || child.type === 'inlineCode') {
        const segments = splitByRegex(child.value, regex);
        if (!segments) return [child];
        return wrapSegments(child.type, segments);
      }
      if ('children' in child) {
        walk(child as { children: RootContent[] });
      }
      return [child];
    });
  };

  walk(tree);
}
