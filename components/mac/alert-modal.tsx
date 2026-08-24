'use client';

import { PushButton } from './push-button';

export interface TypedError {
  code: string;
  message: string;
  retryable: boolean;
}

interface AlertModalProps {
  error: TypedError | null;
  onRetry?: () => void;
  onDismiss: () => void;
}

const RETRYABLE_CODES = new Set(['MODEL_UNAVAILABLE', 'STREAM_INTERRUPTED', 'TIMEOUT', 'NETWORK']);

/** §4.5 alert modal — typed error codes with retry affordance. */
export function AlertModal({ error, onRetry, onDismiss }: AlertModalProps) {
  if (error === null) return null;
  const retryable = error.retryable || RETRYABLE_CODES.has(error.code);
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`Error ${error.code}`}
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/30 p-6"
    >
      <div className="w-full max-w-sm rounded-card border border-separator bg-window p-5 text-center shadow-popover">
        <p aria-hidden className="text-large-title text-sys-red">
          !
        </p>
        <p className="mt-1 inline-block rounded-control bg-gray5 px-2 py-0.5 font-mono text-caption-1 text-secondary-label">
          {error.code}
        </p>
        <p className="mt-3 text-body">{error.message}</p>
        <div className="mt-4 flex justify-center gap-2">
          {retryable && onRetry !== undefined && (
            <PushButton variant="primary" onClick={onRetry}>
              Retry
            </PushButton>
          )}
          <PushButton variant={retryable ? 'secondary' : 'primary'} onClick={onDismiss}>
            OK
          </PushButton>
        </div>
      </div>
    </div>
  );
}
