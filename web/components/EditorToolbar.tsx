'use client';

import type { Editor } from '@tiptap/react';
import clsx from 'clsx';

interface Props {
  editor: Editor | null;
}

const Btn = ({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={clsx(
      'px-2 py-1 rounded text-sm border',
      active
        ? 'bg-white text-black border-white'
        : 'bg-black/30 text-gray-200 border-white/10 hover:bg-black/50',
    )}
  >
    {children}
  </button>
);

export default function EditorToolbar({ editor }: Props) {
  if (!editor) return <div className="h-9" />;
  return (
    <div className="flex flex-wrap items-center gap-1 bg-panel border border-white/5 rounded-lg px-2 py-2">
      <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
        B
      </Btn>
      <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
        <span className="italic">I</span>
      </Btn>
      <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strike">
        <span className="line-through">S</span>
      </Btn>
      <span className="mx-1 h-5 w-px bg-white/10" />
      <Btn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</Btn>
      <Btn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Btn>
      <Btn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Btn>
      <span className="mx-1 h-5 w-px bg-white/10" />
      <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</Btn>
      <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</Btn>
      <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</Btn>
      <Btn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>{'</>'}</Btn>
      <span className="mx-1 h-5 w-px bg-white/10" />
      <Btn
        onClick={() => {
          const url = window.prompt('Image URL (or paste a base64 data:image/... string)');
          if (!url) return;
          editor.chain().focus().setImage({ src: url.trim() }).run();
        }}
        title="Insert image"
      >
        🖼 Image
      </Btn>
    </div>
  );
}
