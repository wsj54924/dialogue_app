import { NextRequest, NextResponse } from 'next/server';
import { createConversation, deleteConversation, listConversations } from '@/lib/db';
import { getAuthenticatedUserId } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const conversations = await listConversations(userId);
    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Conversations GET error:', error);
    return NextResponse.json({ error: '读取会话列表失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === 'string' ? body.title : undefined;
    const conversation = await createConversation(userId, title);
    return NextResponse.json({ conversation });
  } catch (error) {
    console.error('Conversations POST error:', error);
    return NextResponse.json({ error: '新建会话失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('id');
    if (!conversationId) {
      return NextResponse.json({ error: '缺少会话 id' }, { status: 400 });
    }

    const activeConversation = await deleteConversation(userId, conversationId);
    return NextResponse.json({ conversation: activeConversation });
  } catch (error) {
    console.error('Conversations DELETE error:', error);
    return NextResponse.json({ error: '删除会话失败' }, { status: 500 });
  }
}