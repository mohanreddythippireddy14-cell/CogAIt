import { useEffect, useRef } from "react";

type ContentBlock =
  | { type: "text"; value: string }
  | {
    type: "equation";
    value: string;
    source: "unicode-converted" | "direct-latex" | "needsReview";
    needsReview?: boolean;
  };

type ContentBlocksRendererProps = {
  contentBlocks?: ContentBlock[];
  fallbackText?: string;
  className?: string;
};

declare global {
  interface Window {
    MathJax?: {
      startup?: { promise?: Promise<void> };
      typesetPromise?: (elements?: Element[]) => Promise<void>;
    };
  }
}

let mathJaxScriptRequested = false;

function ensureMathJaxLoaded() {
  if (typeof window === "undefined" || mathJaxScriptRequested) {
    return;
  }
  mathJaxScriptRequested = true;
  if (document.getElementById("cogait-mathjax")) {
    return;
  }
  (window as any).MathJax = {
    tex: { inlineMath: [["\\(", "\\)"], ["$", "$"]], displayMath: [["\\[", "\\]"], ["$$", "$$"]] },
    svg: { fontCache: "global" },
  };
  const script = document.createElement("script");
  script.id = "cogait-mathjax";
  script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
  script.async = true;
  document.head.appendChild(script);
}

function buildFallbackBlocks(fallbackText?: string): ContentBlock[] {
  const text = (fallbackText ?? "").trim();
  if (!text) {
    return [];
  }
  return [{ type: "text", value: text }];
}

export function ContentBlocksRenderer({ contentBlocks, fallbackText, className }: ContentBlocksRendererProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const blocks = contentBlocks && contentBlocks.length > 0 ? contentBlocks : buildFallbackBlocks(fallbackText);

  useEffect(() => {
    ensureMathJaxLoaded();
    const typeset = async () => {
      if (!rootRef.current || !window.MathJax?.typesetPromise) {
        return;
      }
      try {
        await window.MathJax.typesetPromise([rootRef.current]);
      } catch {
        // Keep plain fallback if typesetting fails.
      }
    };
    void typeset();
  }, [blocks]);

  return (
    <div ref={rootRef} className={className}>
      {blocks.map((block, idx) => {
        if (block.type === "equation") {
          const latex = block.value.trim();
          const marker = block.needsReview ? " [needs review]" : "";
          return (
            <span key={`${idx}-${latex}`} className="inline-block align-middle mr-1">
              {`\\(${latex}\\)`}{marker}
            </span>
          );
        }
        return (
          <span key={`${idx}-${block.value}`} className="mr-1">
            {block.value}
          </span>
        );
      })}
    </div>
  );
}
