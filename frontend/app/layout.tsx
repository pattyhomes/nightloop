import type { ReactNode } from "react";

export const metadata = {
  title: "Nightloop",
  description: "Nightloop beta support and nightlife planning pages"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Inter, Arial, sans-serif", margin: 24 }}>{children}</body>
    </html>
  );
}
