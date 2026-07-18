import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface RenderTextProps {
  text: string;
}

export const RenderText: React.FC<RenderTextProps> = ({ text }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        strong: ({ node, ...props }) => (
          <span className="font-bold text-indigo-900 bg-indigo-100/50 px-1 rounded mx-0.5" {...props} />
        ),
        p: ({ node, ...props }) => <span {...props} />, // To prevent breaking the current layout, mapping p to span
      }}
    >
      {text}
    </ReactMarkdown>
  );
};
