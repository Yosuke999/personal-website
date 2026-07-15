import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yosuke 的足迹地图",
  description: "把走过的路，留给下一次重逢。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
