import { Download } from "lucide-react";
import type { Components, Options } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";

type MarkdownDocumentViewerProps = {
	markdown: string;
	onDownloadOriginal: () => void;
	onClose: () => void;
};

type MdastNode = {
	type?: string;
	children?: MdastNode[];
};

function remarkStripHtml(): (tree: MdastNode) => void {
	return (tree) => {
		const strip = (node: MdastNode) => {
			if (!node.children) return;
			node.children = node.children.filter((child) => {
				if (child.type === "html") return false;
				strip(child);
				return true;
			});
		};
		strip(tree);
	};
}

const markdownComponents: Components = {
	a: ({ href, children, node: _node, ...props }) => (
		<a {...props} href={href} target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	),
	li: ({ className, children, ...props }) => {
		const isTaskItem = typeof className === "string" && className.includes("task-list-item");
		if (isTaskItem) {
			return (
				<li className={className} {...props}>
					<label className="inline-flex items-start gap-2">{children}</label>
				</li>
			);
		}
		return (
			<li className={className} {...props}>
				{children}
			</li>
		);
	},
	input: ({ type, checked, disabled, ...props }) => {
		if (type === "checkbox") {
			return (
				<input
					type="checkbox"
					checked={Boolean(checked)}
					disabled
					readOnly
					className="mt-1"
					{...props}
				/>
			);
		}
		return <input type={type} disabled={disabled} {...props} />;
	},
};

const remarkPlugins: Options["remarkPlugins"] = [remarkGfm, remarkStripHtml];

export function MarkdownDocumentViewer({
	markdown,
	onDownloadOriginal,
	onClose,
}: MarkdownDocumentViewerProps) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-light-gray px-3 py-2">
				<Button type="button" variant="ghost" size="sm" onClick={onDownloadOriginal}>
					<Download />
					<span className="sr-only sm:not-sr-only">Download Original</span>
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={onClose}>
					Close
				</Button>
			</div>
			<div
				data-testid="markdown-preview-scroll"
				className="min-h-0 flex-1 overflow-auto bg-light-gray/40 p-4"
			>
				<article className="mx-auto max-w-3xl rounded-md bg-white p-6 text-sm leading-relaxed text-dark-gray shadow-cool-light [&_a]:text-dark-accent [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-light-gray [&_blockquote]:pl-4 [&_blockquote]:text-medium-gray [&_code]:rounded [&_code]:bg-light-gray/60 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-light-gray/60 [&_pre]:p-3 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-light-gray [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-light-gray [&_th]:bg-light-gray/40 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5">
					<ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents}>
						{markdown}
					</ReactMarkdown>
				</article>
			</div>
		</div>
	);
}
