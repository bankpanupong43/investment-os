import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "Investment OS",
  description: "Thesis-driven portfolio management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex bg-[#F4F4F4] text-[#393C41]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pt-14 md:pt-0 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  );
}
