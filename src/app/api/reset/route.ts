import { NextResponse } from 'next/server';
import { resetChatState } from '@/lib/db';
import { getAuthenticatedUserId } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    await resetChatState(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Reset API error:', error);
    return NextResponse.json(
      { error: '重置会话失败' },
      { status: 500 }
    );
  }
}