import { Fragment, useEffect, useMemo, useRef } from "react";

type MathRendererProps = {
  text: string;
  className?: string;
};

export function MathRenderer({ text, className }: MathRendererProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const parts = useMemo(() => text.split(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g), [text]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!window.MathJax && !document.getElementById("cogait-mathjax")) {
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
    const typeset = async () => {
      if (!rootRef.current || !window.MathJax?.typesetPromise) {
        return;
      }
      try {
        await window.MathJax.typesetPromise([rootRef.current]);
      } catch {
        // Keep readable TeX if typesetting fails.
      }
    };
    void typeset();
  }, [parts]);

  return (
    <div ref={rootRef} className={className}>
      {parts.map((part, index) => {
        if (part.startsWith("$$") && part.endsWith("$$")) {
          const math = part.slice(2, -2).trim();
          return (
            <div
              key={`${index}-${math}`}
              className="my-2 overflow-x-auto"
            >
              {`\\[${math}\\]`}
            </div>
          );
        }
        if (part.startsWith("$") && part.endsWith("$")) {
          const math = part.slice(1, -1).trim();
          return (
            <span key={`${index}-${math}`} className="inline-block align-middle">
              {`\\(${math}\\)`}
            </span>
          );
        }
        return <Fragment key={`${index}-${part}`}>{part}</Fragment>;
      })}
    </div>
  );
}
