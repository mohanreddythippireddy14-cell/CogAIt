import { Fragment } from "react";

type MathRendererProps = {
  text: string;
  className?: string;
};

export function MathRenderer({ text, className }: MathRendererProps) {
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$]*?\$)/g);

  return (
    <div className={className}>
      {parts.map((part, index) => {
        if (part.startsWith("$$") && part.endsWith("$$")) {
          const math = part.slice(2, -2).trim();
          return (
            <pre
              key={`${index}-${math}`}
              className="my-2 overflow-x-auto rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-900"
            >
              {math}
            </pre>
          );
        }
        if (part.startsWith("$") && part.endsWith("$")) {
          const math = part.slice(1, -1).trim();
          return (
            <code key={`${index}-${math}`} className="rounded bg-slate-100 px-1 py-0.5 text-slate-900">
              {math}
            </code>
          );
        }
        return <Fragment key={`${index}-${part}`}>{part}</Fragment>;
      })}
    </div>
  );
}
