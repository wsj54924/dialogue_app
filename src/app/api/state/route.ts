import { NextResponse } from 'next/server';
import { getChatState } from '@/lib/db';
import { getAuthenticatedUserId } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId') || undefined;
    const state = await getChatState(userId, conversationId);
    return NextResponse.json(state);
  } catch (error) {
    console.error('State API error:', error);
    return NextResponse.json(
      { error: '读取会话状态失败' },
      { status: 500 }
    );
  }
}