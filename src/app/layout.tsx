import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chatbot SaaS - Visual No-Code Chatbot & Lead Generation Platform",
  description: "Enterprise multi-tenant visual chatbot builder, trackable campaigns, live handover, and zero-cost self-hosted architecture.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased bg-slate-50 text-slate-900 selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
