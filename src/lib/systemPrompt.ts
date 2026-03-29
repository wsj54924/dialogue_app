import {
  ConversationState,
  MemoryContextBundle,
  MemoryDraft,
} from '@/types/memory';
import { formatMemoriesForPrompt } from './memory';

type UserIntent = 'casual' | 'identity' | 'comfort' | 'understanding' | 'analysis' | 'action';
type UserState = 'relaxed' | 'tired' | 'frustrated' | 'sad' | 'anxious' | 'vulnerable' | 'reflective';
type TopicDepth = 'light' | 'medium' | 'deep';
type NeedPriority = 'companionship' | 'understanding' | 'analysis' | 'push';

interface ReplyPlan {
  mode: ConversationState;
  intent: UserIntent;
  need: NeedPriority;
  userState: UserState;
  depth: TopicDepth;
  replyLength: string;
  guidance: string;
  isRant: boolean;
}

const PERSONALITY_PROMPT = `你是一个长期陪伴型聊天 AI。
你更像一个真诚、自然、有边界感的朋友，不是老师、客服、心理咨询师，也不是说教型助手。

回复规则：
1. 默认短回复，像微信聊天，不像写小作文。
2. 先接住用户，再理解，再决定要不要分析或推动。
3. 不要假装自己有现实生活经历，不要说“我这边窗外”“我昨天也去过”这类话。
4. 除非用户明确要分析，否则不要自动上价值，不要长篇总结人生道理。
5. 用户在吐槽时，先站在他这边把情绪接住，不要立刻追问解决方案。
6. 如果你引用了联网结果，要明确那是搜索信息，并在结尾单独给出“来源：”。`;

function inferReplyPlan(message: string): ReplyPlan {
  const trimmed = message.trim();
  const wantsAnalysis = /(帮我分析|分析一下|怎么解决|帮我梳理|给我方案)/.test(trimmed);
  const wantsAction = /(推我一把|催我|监督我|逼我一下|给我一个下一步)/.test(trimmed);
  const identityQuestion = /(你是谁|你叫啥|你会什么|你是什么)/.test(trimmed);
  const emotionalCue = /(好累|好烦|难过|委屈|孤独|崩溃|烦死|心累|受不了)/.test(trimmed);
  const reflectiveCue = /(其实|我在想|我不知道|困惑|纠结|为什么|是不是)/.test(trimmed);
  const vulnerableCue = /(算了|没事|随便吧|无所谓)/.test(trimmed);
  const rantCue = /(离谱|无语|逆天|服了|气死|神经|太搞了)/.test(trimmed);

  let intent: UserIntent = 'casual';
  if (identityQuestion) intent = 'identity';
  else if (wantsAction) intent = 'action';
  else if (wantsAnalysis) intent = 'analysis';
  else if (emotionalCue) intent = 'comfort';
  else if (reflectiveCue) intent = 'understanding';

  let userState: UserState = 'relaxed';
  if (/(焦虑|紧张|担心)/.test(trimmed)) userState = 'anxious';
  else if (/(累|没劲|疲惫)/.test(trimmed)) userState = 'tired';
  else if (/(烦|火大|受不了|生气)/.test(trimmed)) userState = 'frustrated';
  else if (/(难过|委屈|失落|伤心)/.test(trimmed)) userState = 'sad';
  else if (vulnerableCue) userState = 'vulnerable';
  else if (reflectiveCue) userState = 'reflective';

  let depth: TopicDepth = 'light';
  if (/(关系|意义|长期|反复|真正|自我|未来)/.test(trimmed)) depth = 'deep';
  else if (wantsAnalysis || wantsAction || emotionalCue || reflectiveCue) depth = 'medium';

  let need: NeedPriority = 'companionship';
  if (wantsAction) need = 'push';
  else if (wantsAnalysis) need = 'analysis';
  else if (reflectiveCue) need = 'understanding';

  let mode: ConversationState = 'light';
  if (wantsAction) mode = 'push';
  else if (wantsAnalysis) mode = 'analysis';
  else if (emotionalCue || rantCue || vulnerableCue) mode = 'companionship';
  else if (reflectiveCue) mode = 'exploration';

  const replyLengthMap: Record<ConversationState, string> = {
    light: '1-2 句',
    companionship: '2-3 句',
    exploration: '2-4 句',
    analysis: '3-5 句',
    push: '1-2 句',
  };

  const guidanceMap: Record<ConversationState, string> = {
    light: '像朋友接话，补一点具体观察或一个低压力问题，不要只是复述。',
    companionship: '先接住情绪，不急着给建议，也不要马上把话题上升成深度分析。',
    exploration: '先贴近用户表面的感受，再轻轻点一层理解，最多问一个关键问题。',
    analysis: '用户明确要分析时再结构化一点，但仍然保持口语化，不要写成报告。',
    push: '承认用户卡住的地方，然后只给一个最小、最具体的下一步。',
  };

  return {
    mode,
    intent,
    need,
    userState,
    depth,
    replyLength: replyLengthMap[mode],
    guidance: rantCue
      ? '这是吐槽场景。先站在用户这边，允许更口语一点，先别教育、别分析、别立刻给方案。'
      : guidanceMap[mode],
    isRant: rantCue,
  };
}

export function buildSystemPrompt(
  memories: MemoryContextBundle,
  recentMessages: { role: string; content: string }[],
  userMessage: string,
  externalContext?: string
): string {
  const plan = inferReplyPlan(userMessage);
  const memoryContext = formatMemoriesForPrompt(memories);
  const recentContext = recentMessages
    .slice(-4)
    .map((message) => `${message.role === 'user' ? '用户' : '你'}: ${message.content}`)
    .join('\n');

  const modeInstruction = `【这一轮对话判断】
- 表层意图：${plan.intent}
- 更深需求：${plan.need}
- 话题深度：${plan.depth}
- 用户状态：${plan.userState}
- 回复模式：${plan.mode}
- 建议长度：${plan.replyLength}

【这一轮回复要求】
${plan.guidance}
- 必须回应用户这句话里最具体的内容。
- 除非用户明确要求分析，否则不要自己上纲上线。
- 如果要提问，只问一个最关键的问题。`;

  return [
    PERSONALITY_PROMPT,
    memoryContext,
    recentContext ? `【最近几句对话】\n${recentContext}` : '',
    externalContext ?? '',
    modeInstruction,
    plan.isRant ? '【吐槽场景提醒】先共情，再接话，不要马上切到解决问题模式。' : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function uniqueDrafts(drafts: MemoryDraft[]): MemoryDraft[] {
  const seen = new Set<string>();
  const result: MemoryDraft[] = [];

  for (const draft of drafts) {
    const key = `${draft.category}::${draft.content}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(draft);
  }

  return result;
}

export function extractPotentialMemories(
  userMessage: string,
  assistantResponse: string
): MemoryDraft[] {
  void assistantResponse;

  const drafts: MemoryDraft[] = [];

  if (/(别总是|不要总是|不要再|别再|你别|你不要)/.test(userMessage)) {
    drafts.push({
      category: 'feedback_for_evolution',
      content: userMessage.trim(),
      source: 'user_feedback',
      importance: 0.98,
      confidence: 0.96,
      stability: 'high',
    });
  }

  if (/(不想聊|别提|不要问|这个别记|这个别提)/.test(userMessage)) {
    drafts.push({
      category: 'sensitive_boundary',
      content: userMessage.trim(),
      source: 'user_feedback',
      importance: 0.98,
      confidence: 0.96,
      stability: 'high',
    });
  }

  if (/(我不喜欢|我更喜欢|希望你|最好是|别太|不要太)/.test(userMessage)) {
    drafts.push({
      category: 'interaction_preference',
      content: userMessage.trim(),
      source: 'user_feedback',
      importance: 0.95,
      confidence: 0.94,
      stability: 'high',
    });
  }

  if (/(我是|我现在是|我叫|我在做|我住在|我来自|我在.*上学)/.test(userMessage)) {
    drafts.push({
      category: 'identity_profile',
      content: userMessage.trim(),
      source: 'explicit_user_statement',
      importance: 0.88,
      confidence: 0.9,
      stability: 'high',
    });
  }

  if (/(最近在|这周在|今天要|明天要|正在|准备|这两天在)/.test(userMessage)) {
    drafts.push({
      category: 'active_topic',
      content: userMessage.trim(),
      source: 'explicit_user_statement',
      importance: 0.8,
      confidence: 0.82,
      stability: 'low',
    });
  }

  if (/(最近总是|这阵子总是|我一.*就|每次都).*(焦虑|紧张|难过|烦|失眠)/.test(userMessage)) {
    drafts.push({
      category: 'emotional_pattern',
      content: userMessage.trim(),
      source: 'repeated_pattern_inference',
      importance: 0.78,
      confidence: 0.78,
      stability: 'medium',
    });
  }

  if (/(想要|目标是|打算|希望今年|准备长期)/.test(userMessage)) {
    drafts.push({
      category: 'long_term_goal',
      content: userMessage.trim(),
      source: 'explicit_user_statement',
      importance: 0.9,
      confidence: 0.88,
      stability: 'high',
    });
  }

  if (/(上次|之前|我们刚聊过|你刚刚说)/.test(userMessage)) {
    drafts.push({
      category: 'relationship_history',
      content: userMessage.trim(),
      source: 'conversation_summary',
      importance: 0.72,
      confidence: 0.75,
      stability: 'medium',
    });
  }

  return uniqueDrafts(drafts);
}

export function extractPotentialMemory(
  userMessage: string,
  assistantResponse: string
): { content: string; category: string } | null {
  const drafts = extractPotentialMemories(userMessage, assistantResponse);
  if (drafts.length === 0) {
    return null;
  }

  return {
    content: drafts[0].content,
    category: String(drafts[0].category),
  };
}
