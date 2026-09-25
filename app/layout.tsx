import type { Metadata } from "next";
import "./globals.css";
import { AppearanceProvider } from "./theme";

export const metadata: Metadata = {
  title: "King Foods • Gestão Financeira",
  description: "Gestão de títulos, tarefas e vencimentos da King Foods.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased"><AppearanceProvider>{children}</AppearanceProvider></body>
    </html>
  );
}
