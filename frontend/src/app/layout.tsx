import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--ff-font-sans',
})

export const metadata: Metadata = {
  title: {
    default: 'Fireflies',
    template: '%s · Fireflies',
  },
  description:
    'AI meeting notes: searchable transcripts, summaries and action items from every conversation.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // `data-theme` is set statically here for now. T-38.2 replaces it with a
  // before-paint inline script reading localStorage, so the theme is correct on
  // first paint and the page never flashes white before going dark.
  return (
    <html lang="en" data-theme="light" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
