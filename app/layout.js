import './globals.css';

export const metadata = {
  title: 'CivicSignal 2.0 — Detect Patterns. Prevent Public Failures.',
  description: 'Infrastructure risk intelligence & early-warning platform (hackathon MVP, simulated data).',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
