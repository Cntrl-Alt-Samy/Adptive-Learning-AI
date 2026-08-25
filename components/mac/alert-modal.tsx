'use client';

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

/** §4.5 alert — iOS alert: centered card, hairline-divided action stack. */
export function AlertModal({ error, onRetry, onDismiss }: AlertModalProps) {
  if (error === null) return null;
  const retryable = error.retryable || RETRYABLE_CODES.has(error.code);
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`Error ${error.code}`}
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/35 p-6 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-[300px] overflow-hidden rounded-[16px] bg-text-background text-center shadow-popover">
        <div className="px-4 pb-4 pt-5">
          <p aria-hidden className="text-title-1 text-sys-red">
            !
          </p>
          <p className="mt-1.5 inline-block rounded-full bg-gray6 px-2 py-0.5 font-mono text-caption-1 text-secondary-label dark:bg-gray5">
            {error.code}
          </p>
          <p className="mt-2.5 text-callout">{error.message}</p>
        </div>
        <div className="flex flex-col divide-y divide-separator border-t border-separator">
          {retryable && onRetry !== undefined && (
            <button
              type="button"
              className="focus-halo h-11 w-full text-headline text-sys-blue transition-colors duration-150 active:bg-gray6 dark:active:bg-gray5"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
          <button
            type="button"
            className={`focus-halo h-11 w-full font-semibold transition-colors duration-150 active:bg-gray6 dark:active:bg-gray5 ${
              retryable ? 'text-label' : 'text-headline text-sys-blue'
            }`}
            onClick={onDismiss}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
