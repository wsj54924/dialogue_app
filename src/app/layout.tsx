import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '陪伴 - 你的聊天朋友',
  description: '一个会记住你、理解你的长期陪伴型聊天 AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}