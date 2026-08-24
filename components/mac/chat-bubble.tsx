'use client';

interface ChatBubbleProps {
  variant: 'sent' | 'received';
  children: React.ReactNode;
}

/** §4.5 Messages-style chat bubbles — blue sent, material received. */
export function ChatBubble({ variant, children }: ChatBubbleProps) {
  const isSent = variant === 'sent';
  return (
    <div className={`flex w-full ${isSent ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-sheet px-3.5 py-2 text-chat-body ${
          isSent ? 'bg-sys-blue text-white' : 'bg-gray5 text-label dark:bg-gray4'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
