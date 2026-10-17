import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './prose.css';

/** Imported and generated prose is content, never executable HTML or remote media. */
export default function Markdown({ text }: { text: string }) {
  return (
    <div className="document-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) =>
            /^https?:\/\//i.test(href ?? '') ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => (
            <span className="image-reference">Image reference{alt ? `: ${alt}` : ''}</span>
          ),
          table: ({ children }) => (
            <div className="prose-table-scroll">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
