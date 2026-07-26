import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

import { AppShell } from '@/components/layout/app-shell'

import './globals.css'
import { Providers } from './providers'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--ff-font-sans',
})

export const metadata: Metadata = {
  title: {
    // Every page sets its own title and inherits the suffix — so a browser tab
    // reads "Q3 Roadmap Sync · Fireflies", which is what makes a pinned tab
    // findable among twenty others.
    default: 'Fireflies',
    template: '%s · Fireflies',
  },
  description:
    'AI meeting notes: searchable transcripts, summaries and action items from every conversation.',
  // No third-party scripts anywhere in this app (T-06.13). A demo that hangs on
  // a blocked analytics tracker is an avoidable disaster.
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // `data-theme` is set statically for now. T-38.2 replaces it with a
  // before-paint inline script reading localStorage, so the theme is correct on
  // first paint and the page never flashes white before going dark.
  return (
    <html lang="en" data-theme="light" className={inter.variable}>
      <body>
        <Providers>
          {/* First tab stop, visually hidden until focused (T-42.3). */}
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-toast focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-body-strong focus:text-inverse"
          >
            Skip to content
          </a>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
