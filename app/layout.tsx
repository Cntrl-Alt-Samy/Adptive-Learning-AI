import type { Metadata } from 'next';

import { ThemeProvider, themeBootstrapScript } from '@/components/theme-provider';
import { SessionProvider } from '@/hooks/session-store';
import { LearnerLedgerProvider } from '@/hooks/learner-store';
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'LearnOS — Adaptive AI Tutor',
  description: 'The adaptive AI tutor platform — macOS-native learner experience.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="bg-window text-label">
        <ThemeProvider>
          <SessionProvider>
            <LearnerLedgerProvider>{children}</LearnerLedgerProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
