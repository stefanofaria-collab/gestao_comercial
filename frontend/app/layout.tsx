import type { Metadata } from "next";
import { RouteGuard } from "@/components/auth/RouteGuard";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClickDados",
  description: "Painel executivo de dados da ClickDigital",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <RouteGuard>{children}</RouteGuard>
      </body>
    </html>
  );
}
