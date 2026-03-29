import { NextRequest, NextResponse } from 'next/server';
import { buildSystemPrompt, extractPotentialMemories } from '@/lib/systemPrompt';
import {
  getChatState,
  insertMessages,
  markMemoriesUsed,
  updateConversationTitle,
  upsertMemories,
} from '@/lib/db';
import { buildMemoryContext, resolveMemoryWrite } from '@/lib/memory';
import { formatSearchResults, searchWeb, shouldUseWebSearch } from '@/lib/webSearch';
import { getAuthenticatedUserId } from '@/lib/auth';
import { Memory, Message } from '@/types/memory';

export const runtime = 'nodejs';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

function createMessageId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeAssistantReply(text: string): string {
  return text
    .replace(/[（(][^)）]*[)）]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    if (!DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: '服务端未配置 DeepSeek API Key' }, { status: 500 });
    }

    const body = await request.json();
    const userContent = typeof body?.message === 'string' ? body.message.trim() : '';
    const requestedConversationId =
      typeof body?.conversationId === 'string' ? body.conversationId : undefined;

    if (!userContent) {
      return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
    }

    const state = await getChatState(userId, requestedConversationId);
    const conversation = state.conversation;
    const now = new Date();

    const userMessage: Message = {
      id: createMessageId('user'),
      role: 'user',
      content: userContent,
      timestamp: now.toISOString(),
    };

    const recentMessages = [...state.messages, userMessage].slice(-10).map((message) => ({
      role: message.role,
      content: message.content,
    }));

    const memoryContext = buildMemoryContext(state.memories, userContent, now);

    let externalContext = '';
    let searchResults: { title: string; url: string; content: string }[] = [];

    if (shouldUseWebSearch(userContent)) {
      searchResults = await searchWeb(userContent);
      if (searchResults.length > 0) {
        externalContext = `${formatSearchResults(searchResults)}

【联网回答要求】
- 只在搜索结果确实相关时引用。
- 回答里要明确这是搜索结果，不要假装自己亲自经历过。
- 如果用了联网结果，结尾单独一行加"来源："并列出链接。`;
      }
    }

    const systemPrompt = buildSystemPrompt(
      memoryContext,
      recentMessages,
      userContent,
      externalContext
    );

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentMessages,
        ],
        temperature: 0.7,
        max_tokens: 260,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('DeepSeek API error:', error);
      return NextResponse.json({ error: '聊天模型调用失败' }, { status: response.status });
    }

    const data = await response.json();
    let assistantText =
      data.choices?.[0]?.message?.content || '抱歉，我刚刚没接住这句。你再发一次，我接着聊。';
    assistantText = sanitizeAssistantReply(assistantText);

    if (searchResults.length > 0) {
      const links = searchResults.map((item) => item.url).filter(Boolean).slice(0, 3);
      if (links.length > 0 && !assistantText.includes('来源：')) {
        assistantText = `${assistantText}\n来源：${links.join(' | ')}`;
      }
    }

    const assistantMessage: Message = {
      id: createMessageId('assistant'),
      role: 'assistant',
      content: assistantText,
      timestamp: new Date().toISOString(),
    };

    await insertMessages(conversation.id, [userMessage, assistantMessage]);
    await markMemoriesUsed(memoryContext.all.map((memory) => memory.id));

    if (state.messages.length === 0) {
      await updateConversationTitle(conversation.id, userContent);
    }

    const extractedDrafts = extractPotentialMemories(userContent, assistantText);
    if (extractedDrafts.length > 0) {
      const workingMemories = [...state.memories];
      const pendingUpserts = new Map<string, Memory>();

      for (const draft of extractedDrafts) {
        const plan = resolveMemoryWrite(workingMemories, draft, userId, new Date());

        for (const memory of plan.upserts) {
          pendingUpserts.set(memory.id, memory);
        }

        for (const memory of plan.upserts) {
          const existingIndex = workingMemories.findIndex((item) => item.id === memory.id);
          if (existingIndex >= 0) {
            workingMemories[existingIndex] = memory;
          } else {
            workingMemories.push(memory);
          }
        }
      }

      await upsertMemories([...pendingUpserts.values()]);
    }

    return NextResponse.json({
      message: assistantText,
      conversationId: conversation.id,
      usedWebSearch: searchResults.length > 0,
      searchEnabled: Boolean(process.env.TAVILY_API_KEY),
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: '服务端错误' }, { status: 500 });
  }
}