"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import type { CheckResult } from "@/lib/notes/store";

type AstNode = {
  type: string;
  value?: string;
  depth?: number;
  children?: AstNode[];
  data?: { hName?: string; hProperties?: Record<string, string> };
};

export type MarkdownHeading = { id: string; text: string; level: 2 | 3 };

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/\$|\\|\*/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "") || "section";

/** IDs shared by the renderer and the table of contents. */
export function getMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const used = new Map<string, number>();
  let fence: { marker: string; length: number } | null = null;
  return markdown.split(/\r?\n/).flatMap((line) => {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = { marker, length: fenceMatch[1].length };
      else if (fence.marker === marker && fenceMatch[1].length >= fence.length) fence = null;
      return [];
    }
    if (fence) return [];
    const match = /^ {0,3}(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return [];
    const text = match[2].replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`~]/g, "");
    const base = slug(text);
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return [{ id: count ? `${base}-${count + 1}` : base, text, level: match[1].length as 2 | 3 }];
  });
}

/** Opens a collapsed section before following a TOC anchor. */
export function openHeadingSection(id: string) {
  const heading = document.getElementById(id);
  const section = heading?.closest("[data-reader-section]");
  if (section && section.getAttribute("data-collapsed") === "true") {
    const button = section.querySelector<HTMLButtonElement>(".md-section-toggle");
    button?.click();
  }
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function remarkReader(headings: MarkdownHeading[]) {
  return () => (tree: AstNode) => {
    let headingIndex = 0;
    let checkIndex = 0;
    const walk = (node: AstNode) => {
      if (node.type === "heading" && (node.depth === 2 || node.depth === 3)) {
        const match = headings[headingIndex++];
        if (match) node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: match.id } };
      }

      if (node.type === "blockquote" && node.children?.length) {
        const first = node.children[0];
        const firstText = first.type === "paragraph" ? first.children?.[0] : undefined;
        const match = firstText?.type === "text" && /^\s*\[!([\w-]+)\]\s*/.exec(firstText.value ?? "");
        if (match && firstText) {
          const kind = match[1].toUpperCase();
          firstText.value = (firstText.value ?? "").slice(match[0].length);
          if (!firstText.value) first.children?.shift();
          if (!first.children?.length) node.children.shift();
          const extra: Record<string, string> = kind === "CHECK" ? { "data-check": String(checkIndex++) } : {};
          node.data = { ...node.data, hProperties: { ...node.data?.hProperties, "data-callout": kind, ...extra } };
        }
      }

      if (!node.children) return;
      const output: AstNode[] = [];
      for (const child of node.children) {
        if (child.type === "text" && child.value?.includes("==")) {
          const pieces = child.value.split(/(==[^=\n]+==)/g);
          for (const piece of pieces) {
            if (!piece) continue;
            if (piece.startsWith("==") && piece.endsWith("==")) {
              output.push({ type: "mark", data: { hName: "mark" }, children: [{ type: "text", value: piece.slice(2, -2) }] });
            } else output.push({ type: "text", value: piece });
          }
        } else {
          walk(child);
          output.push(child);
        }
      }
      node.children = output;
    };
    walk(tree);

    // Wrap each level-two section so its content can collapse together.
    if (!tree.children) return;
    const sections: AstNode[] = [];
    let current: AstNode | undefined;
    for (const child of tree.children) {
      if (child.type === "heading" && child.depth === 2) {
        current = {
          type: "section",
          data: { hName: "section", hProperties: { "data-reader-section": "", "data-section-id": child.data?.hProperties?.id ?? "" } },
          children: [child],
        };
        sections.push(current);
      } else if (current) current.children?.push(child);
      else sections.push(child);
    }
    tree.children = sections;
  };
}

/** Callout kinds, each drawn in one of Akada's pastels. */
export const CALLOUTS: Record<string, { label: string; tone: string }> = {
  DEF: { label: "Definition", tone: "sky" },
  EXAMPLE: { label: "Example", tone: "sage" },
  EXAM: { label: "Exam tip", tone: "butter" },
  TRAP: { label: "Common mistake", tone: "rose" },
  SOURCE: { label: "Source", tone: "lav" },
  CHECK: { label: "Check yourself", tone: "slate" },
  STEPS: { label: "Step by step", tone: "mint" },
  ARGUMENT: { label: "Argument", tone: "mauve" },
  NOTE: { label: "Note", tone: "sky" },
  TIP: { label: "Tip", tone: "sage" },
  WARNING: { label: "Careful", tone: "peach" },
  IMPORTANT: { label: "Important", tone: "clay" },
};

function CheckCallout({ index, children }: { index: number; children: React.ReactNode }) {
  const { checks, onMarkCheck } = useContext(ReaderContext);
  const result = checks[String(index)];
  const [revealed, setRevealed] = useState(false);
  const open = revealed || Boolean(result);
  return (
    <>
      {open ? (
        <div className="md-callout-content">{children}</div>
      ) : (
        <p className="md-check-prompt">Try it in your head first.</p>
      )}
      <div className="md-check-actions">
        {!open ? (
          <button className="md-ghost" type="button" onClick={() => setRevealed(true)}>Show answer</button>
        ) : (
          <>
            <button
              type="button"
              className={`md-ghost ${result === "got" ? "is-picked" : ""}`}
              aria-pressed={result === "got"}
              onClick={() => onMarkCheck(String(index), "got")}
            >
              Got it
            </button>
            <button
              type="button"
              className={`md-ghost ${result === "miss" ? "is-picked is-miss" : ""}`}
              aria-pressed={result === "miss"}
              onClick={() => onMarkCheck(String(index), "miss")}
            >
              Not yet
            </button>
            {!result && (
              <button className="md-ghost md-ghost-quiet" type="button" onClick={() => setRevealed(false)}>Hide</button>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Callout({ kind, checkIndex, children }: { kind: string; checkIndex?: number; children: React.ReactNode }) {
  const info = CALLOUTS[kind] ?? { label: kind.charAt(0) + kind.slice(1).toLowerCase(), tone: "slate" };
  return (
    <aside className="md-callout" data-kind={kind} style={{ ["--c" as string]: `var(--${info.tone})`, ["--ct" as string]: `var(--${info.tone}-tint)` }}>
      <div className="md-callout-head">
        <span className="course-rule" aria-hidden="true" />
        <span className="eyebrow">{info.label}</span>
      </div>
      {kind === "CHECK" && checkIndex !== undefined ? (
        <CheckCallout index={checkIndex}>{children}</CheckCallout>
      ) : (
        <div className="md-callout-content">{children}</div>
      )}
    </aside>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = React.Children.only(children) as React.ReactElement<{ className?: string; children?: React.ReactNode }>;
  const language = /language-([\w+-]+)/.exec(code.props.className ?? "")?.[1];
  const source = String(code.props.children ?? "").replace(/\n$/, "");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* Clipboard can be blocked; the code is still selectable. */
    }
  };
  return (
    <div className="md-code-block">
      <div className="md-code-head">
        <span className="eyebrow">{language ?? "code"}</span>
        <button type="button" className="md-code-copy" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <SyntaxHighlighter language={language ?? "text"} useInlineStyles={false} PreTag="pre" CodeTag="code">
        {source}
      </SyntaxHighlighter>
    </div>
  );
}

type ReaderContextValue = {
  collapsedSections: Set<string>;
  onToggleSection: (id: string) => void;
  headings: MarkdownHeading[];
  checks: Record<string, CheckResult>;
  onMarkCheck: (id: string, result: CheckResult) => void;
};

const ReaderContext = createContext<ReaderContextValue>({
  collapsedSections: new Set(),
  onToggleSection: () => {},
  headings: [],
  checks: {},
  onMarkCheck: () => {},
});

const readerComponents: Components = {
  section: function Section({ node, children, ...props }) {
    const { collapsedSections, onToggleSection, headings } = useContext(ReaderContext);
    const id = String(node?.properties?.["data-section-id"] ?? "");
    const parts = React.Children.toArray(children);
    const collapsed = collapsedSections.has(id);
    const heading = parts[0];
    return (
      <section {...props} data-reader-section="" data-collapsed={collapsed}>
        {React.isValidElement(heading) ? React.cloneElement(heading as React.ReactElement<{ children?: React.ReactNode }>, {},
          <button className="md-section-toggle" type="button" onClick={() => onToggleSection(id)} aria-expanded={!collapsed} aria-label={`${collapsed ? "Expand" : "Collapse"} ${headings.find((item) => item.id === id)?.text ?? "section"}`}>
            <svg className="md-section-chevron" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            {heading.props.children}
          </button>
        ) : heading}
        <div hidden={collapsed}>{parts.slice(1)}</div>
      </section>
    );
  },
  blockquote({ node, children, ...props }) {
    const kind = node?.properties?.["data-callout"];
    const check = node?.properties?.["data-check"];
    return kind ? (
      <Callout kind={String(kind)} checkIndex={check === undefined ? undefined : Number(check)}>{children}</Callout>
    ) : (
      <blockquote {...props}>{children}</blockquote>
    );
  },
  a({ node, href, children, ...props }) {
    void node;
    const external = href ? /^https?:\/\//.test(href) : false;
    return <a href={href} {...props} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>{children}</a>;
  },
  pre({ children }) { return <CodeBlock>{children}</CodeBlock>; },
  table({ children, ...props }) { return <div className="md-table-scroll" tabIndex={0} role="region" aria-label="Scrollable table"><table {...props}>{children}</table></div>; },
};

export function MarkdownReader({ markdown, collapsedSections, onToggleSection, checks = {}, onMarkCheck = () => {} }: {
  markdown: string;
  collapsedSections: Set<string>;
  onToggleSection: (id: string) => void;
  checks?: Record<string, CheckResult>;
  onMarkCheck?: (id: string, result: CheckResult) => void;
}) {
  const headings = useMemo(() => getMarkdownHeadings(markdown), [markdown]);
  const plugins = useMemo(() => [remarkGfm, remarkMath, remarkReader(headings)], [headings]);

  return (
    <ReaderContext.Provider value={{ collapsedSections, onToggleSection, headings, checks, onMarkCheck }}>
    <article className="markdown-body">
      <ReactMarkdown
        remarkPlugins={plugins}
        rehypePlugins={[rehypeKatex]}
        components={readerComponents}
      >
        {markdown}
      </ReactMarkdown>
    </article>
    </ReaderContext.Provider>
  );
}

/** How many "Check yourself" callouts a note holds, skipping fenced code. */
export function countChecks(markdown: string) {
  let fence = false;
  let count = 0;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^ {0,3}(`{3,}|~{3,})/.test(line)) fence = !fence;
    else if (!fence && /^ {0,3}>\s*\[!CHECK\]/i.test(line)) count++;
  }
  return count;
}
