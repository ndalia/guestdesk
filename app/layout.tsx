import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Freekeh GuestOps Agency",
  description: "Autonomous restaurant guest operations trace dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
