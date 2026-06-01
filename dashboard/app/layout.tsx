import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GAPRANK v2.0 — Paris.cl',
  description: 'Sistema de detección de oportunidades SEO',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body style={{ background: '#f5f5f7' }}>{children}</body>
    </html>
  );
}