'use client';

import { useCallback, useRef, useState } from 'react';

import { BackoffSchedule, SessionResumeBuffer } from '@/src/frontend/sse-client.js';
import { parseSseFrame } from '@/src/api/sse/events.js';
import type { ErrorEvent, StreamEvent } from '@/src/api/sse/events.js';
import type { AiModeName } from '@/src/state/transition-table.js';
import type { StateCheckpoint } from '@/src/state/checkpoint-contract.js';

/**
 * S8A-T5 — streaming tutor canvas hook. Wraps the EXISTING Sprint-3
 * primitives: `parseSseFrame` validates every untrusted wire frame,
 * `BackoffSchedule` paces reconnects, `SessionResumeBuffer` hydrates the
 * transcript/HUD from the last confirmed checkpoint after a drop (B-01).
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface TurnRequestPayload {
  sessionId: string;
  mode: AiModeName;
  step: number;
  text: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface SendOptions {
  mode: AiModeName;
  step: number;
}

export interface TutorStream {
  messages: ChatMessage[];
  streaming: boolean;
  lastLatencyMs: number | null;
  error: ErrorEvent | null;
  confirmedStep: number;
  lastCheckpoint: StateCheckpoint | null;
  resumedFromStep: number | null;
  send: (text: string, req: SendOptions) => Promise<void>;
  dismissError: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 3;

export function useTutorStream(sessionId: string): TutorStream {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [error, setError] = useState<ErrorEvent | null>(null);
  const [confirmedStep, setConfirmedStep] = useState(0);
  const [lastCheckpoint, setLastCheckpoint] = useState<StateCheckpoint | null>(null);
  const [resumedFromStep, setResumedFromStep] = useState<number | null>(null);

  const resumeRef = useRef(new SessionResumeBuffer());
  const historyRef = useRef<ChatMessage[]>([]);
  const streamingRef = useRef(false);
  const assistantTextRef = useRef('');

  const consumeFrame = useCallback((frame: string, assistantText: { value: string }, t0: number): void => {
    if (frame.trim().length === 0) return;
    // Client-side validation of the untrusted stream (typed contract).
    const event: StreamEvent = parseSseFrame(frame);
    if (event.type === 'token') {
      if (assistantText.value.length === 0) setLastLatencyMs(Math.round(performance.now() - t0));
      assistantText.value += event.text;
      assistantTextRef.current = assistantText.value;
      setMessages((m) => upsertAssistant(m, assistantText.value));
      resumeRef.current.push({ kind: 'token', sessionId: '' });
    } else if (event.type === 'checkpoint_confirmed') {
      resumeRef.current.push({
        kind: 'checkpoint_confirmed',
        sessionId: event.sessionId,
        stepNumber: event.stepNumber
      });
      setConfirmedStep(event.stepNumber);
      setLastCheckpoint((event.statePayload as StateCheckpoint | undefined) ?? null);
    } else if (event.type === 'error') {
      setError(event);
    }
  }, []);

  const runStream = useCallback(
    async (payload: TurnRequestPayload, signal: AbortSignal): Promise<void> => {
      const res = await fetch('/api/turn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal
      });
      if (!res.ok || res.body === null) throw new Error(`Turn failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const assistantText = { value: '' };
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          try {
            consumeFrame(frame, assistantText, performance.now());
          } catch (err) {
            // Malformed frame → degrade to typed error, never crash the canvas.
            setError({ v: 1, type: 'error', code: 'FRAME_INVALID', message: (err as Error).message, retryable: false });
          }
        }
      }
    },
    [consumeFrame]
  );

  const send = useCallback(
    async (text: string, req: SendOptions) => {
      if (streamingRef.current || text.trim().length === 0) return;
      streamingRef.current = true;
      setError(null);
      setResumedFromStep(null);
      setStreaming(true);
      setMessages((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
      historyRef.current = [...historyRef.current, { role: 'user' as const, content: text }];

      const controller = new AbortController();
      const backoff = new BackoffSchedule();

      try {
        for (;;) {
          try {
            await runStream(
              { ...req, sessionId, text, history: historyRef.current.slice(0, -1).slice(-12) },
              controller.signal
            );
            backoff.reset();
            break;
          } catch (err) {
            if (controller.signal.aborted) break;
            // Mid-stream kill → hydrate from last confirmed checkpoint.
            const snapshot = resumeRef.current.hydrate();
            setResumedFromStep(snapshot.lastConfirmedStep);
            if (backoff.attempts + 1 >= MAX_RECONNECT_ATTEMPTS) {
              setError({
                v: 1,
                type: 'error',
                code: 'STREAM_INTERRUPTED',
                message: `Connection lost${snapshot.lostUnconfirmedEvents > 0 ? ` (${snapshot.lostUnconfirmedEvents} partial events discarded)` : ''}. Restored to checkpoint ${snapshot.lastConfirmedStep}.`,
                retryable: true
              });
              break;
            }
            await new Promise((r) => setTimeout(r, backoff.next()));
          }
        }
      } finally {
        historyRef.current.push({ role: 'assistant', content: assistantTextRef.current });
        assistantTextRef.current = '';
        streamingRef.current = false;
        setStreaming(false);
      }
    },
    [runStream, sessionId]
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    messages,
    streaming,
    lastLatencyMs,
    error,
    confirmedStep,
    lastCheckpoint,
    resumedFromStep,
    send,
    dismissError
  };
}

function upsertAssistant(list: ChatMessage[], content: string): ChatMessage[] {
  if (list.length === 0 || list[list.length - 1]?.role !== 'assistant') {
    return [...list, { role: 'assistant', content }];
  }
  const next = [...list];
  next[next.length - 1] = { role: 'assistant', content };
  return next;
}
