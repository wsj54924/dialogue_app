import { describe, expect, test } from 'vitest';
import {
  buildMemoryContext,
  createMemoryFromDraft,
  resolveMemoryWrite,
} from './memory';
import { Memory } from '@/types/memory';
import { resolveDatabaseConfig, resolveDatabaseUrl } from './db';

const TEST_USER_ID = 'test-user-001';

describe('memory system upgrade', () => {
  test('keeps stable profile memories in the profile section', () => {
    const memories: Memory[] = [
      createMemoryFromDraft(
        {
          category: 'interaction_preference',
          content: '用户不喜欢被说教，更喜欢像朋友一样聊天。',
          source: 'user_feedback',
          stability: 'high',
          importance: 0.98,
          confidence: 0.96,
        },
        TEST_USER_ID,
        new Date('2026-03-27T10:00:00.000Z')
      ),
      createMemoryFromDraft(
        {
          category: 'active_topic',
          content: '用户这周在准备一个 AI 产品 demo。',
          source: 'explicit_user_statement',
          importance: 0.8,
          confidence: 0.82,
        },
        TEST_USER_ID,
        new Date('2026-03-27T10:00:00.000Z')
      ),
    ];

    const bundle = buildMemoryContext(
      memories,
      '我还是想让你像朋友一样和我说话',
      new Date('2026-03-28T10:00:00.000Z')
    );

    expect(bundle.profile.map((item) => item.content)).toContain(
      '用户不喜欢被说教，更喜欢像朋友一样聊天。'
    );
    expect(bundle.temporal.map((item) => item.content)).toContain(
      '用户这周在准备一个 AI 产品 demo。'
    );
  });

  test('expires time-bound active memories from retrieval', () => {
    const timeBound = createMemoryFromDraft(
      {
        category: 'active_topic',
        content: '用户今天下午要交课程作业。',
        source: 'explicit_user_statement',
        importance: 0.78,
        confidence: 0.8,
      },
      TEST_USER_ID,
      new Date('2026-03-20T09:00:00.000Z')
    );

    const bundle = buildMemoryContext(
      [timeBound],
      '最近还有什么安排',
      new Date('2026-03-27T10:00:00.000Z')
    );

    expect(bundle.relevant).toHaveLength(0);
    expect(bundle.temporal).toHaveLength(0);
  });

  test('supersedes conflicting memories that share the same slot', () => {
    const oldMemory = createMemoryFromDraft(
      {
        category: 'interaction_preference',
        content: '用户喜欢长篇分析。',
        source: 'explicit_user_statement',
        stability: 'high',
        importance: 0.9,
        confidence: 0.9,
      },
      TEST_USER_ID,
      new Date('2026-03-20T09:00:00.000Z')
    );

    const writePlan = resolveMemoryWrite(
      [oldMemory],
      {
        category: 'interaction_preference',
        content: '用户不喜欢太长的分析，更喜欢短一点、直接一点。',
        source: 'user_feedback',
        stability: 'high',
        importance: 0.98,
        confidence: 0.96,
      },
      TEST_USER_ID,
      new Date('2026-03-27T10:00:00.000Z')
    );

    const superseded = writePlan.upserts.find((item) => item.id === oldMemory.id);
    expect(superseded?.status).toBe('superseded');
    expect(writePlan.primaryMemory.status).toBe('active');
    expect(writePlan.primaryMemory.supersedes).toContain(oldMemory.id);
  });
});

describe('database deployment behavior', () => {
  test('throws a clear error on vercel when no remote database is configured', () => {
    expect(() =>
      resolveDatabaseUrl({
        VERCEL: '1',
      } as unknown as NodeJS.ProcessEnv)
    ).toThrow(/TURSO_DATABASE_URL/);
  });

  test('throws a clear error when a remote turso url is set without auth token', () => {
    expect(() =>
      resolveDatabaseConfig({
        TURSO_DATABASE_URL: 'libsql://example-org.turso.io',
      } as unknown as NodeJS.ProcessEnv)
    ).toThrow(/TURSO_AUTH_TOKEN/);
  });
});
