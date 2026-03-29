import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  try {
    await clearAuthCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout API error:', error);
    return NextResponse.json({ error: '登出失败' }, { status: 500 });
  }
}