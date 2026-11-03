import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runCommentsPhase } from './phase-comments'
import { staged, type ImportContext } from './import-context'
import type { StagedComment } from './staged-doc-types'

function mockContext(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    cfg: { site: 'test-site', wpUrl: 'https://wp.example.com', wpHost: 'wp.example.com', publicHost: 'wp.example.com', domain: 'example.com', language: 'en' as const },
    payload: {
      find: async () => ({ docs: [], totalDocs: 0 }),
      create: async () => ({ id: 1 }),
    } as unknown as ImportContext['payload'],
    tenantId: 10,
    dryRun: false,
    log: () => {},
    ...overrides,
  }
}

describe('runCommentsPhase', () => {
  it('does nothing when no staged comments exist', async () => {
    const original = staged.comments
    staged.comments = () => []
    try {
      let findCalled = false
      const ctx = mockContext({
        payload: {
          find: async () => {
            findCalled = true
            return { docs: [], totalDocs: 0 }
          },
        } as unknown as ImportContext['payload'],
      })
      await runCommentsPhase(ctx)
      assert.equal(findCalled, false)
    } finally {
      staged.comments = original
    }
  })

  it('creates comments linking to products or posts and skips existing', async () => {
    const original = staged.comments
    const sampleComments: StagedComment[] = [
      {
        collection: 'comments',
        authorName: 'Nguyen Van A',
        authorEmail: 'a@example.com',
        content: 'Ve rat tot',
        status: 'approved',
        createdAt: '2026-03-01T10:00:00.000Z',
        wp: { databaseId: 101 },
        target: { type: 'product', slug: 'summer-sale-sandals', wpId: 2001 },
      },
      {
        collection: 'comments',
        authorName: 'Tran Thi B',
        authorEmail: null,
        content: 'Bai viet hay',
        status: 'approved',
        createdAt: '2026-03-02T10:00:00.000Z',
        wp: { databaseId: 102 },
        target: { type: 'post', slug: 'kinh-nghiem-di-tau', wpId: 2002 },
      },
      {
        collection: 'comments',
        authorName: 'Le Van C',
        content: 'Da ton tai',
        status: 'approved',
        createdAt: '2026-03-03T10:00:00.000Z',
        wp: { databaseId: 103 },
        target: { type: 'product', slug: 'summer-sale-sandals', wpId: 2001 },
      },
    ]
    staged.comments = () => sampleComments

    try {
      const createdDocs: unknown[] = []
      const ctx = mockContext({
        payload: {
          find: async (args: { collection: string }) => {
            if (args.collection === 'posts') {
              return { docs: [{ id: 50, slug: 'kinh-nghiem-di-tau' }], totalDocs: 1 }
            }
            if (args.collection === 'products') {
              return { docs: [{ id: 100, slug: 'summer-sale-sandals' }], totalDocs: 1 }
            }
            if (args.collection === 'comments') {
              return {
                docs: [
                  {
                    id: 999,
                    product: 100,
                    authorName: 'Le Van C',
                    createdAt: '2026-03-03T10:00:00.000Z',
                    content: 'Da ton tai',
                  },
                ],
                totalDocs: 1,
              }
            }
            return { docs: [], totalDocs: 0 }
          },
          create: async (args: { collection: string; data: unknown }) => {
            createdDocs.push(args.data)
            return { id: 1 }
          },
        } as unknown as ImportContext['payload'],
      })

      await runCommentsPhase(ctx)

      // Should have created 2 docs (1 product comment, 1 post comment), and skipped the 3rd
      assert.equal(createdDocs.length, 2)
      assert.deepEqual(createdDocs[0], {
        product: 100,
        authorName: 'Nguyen Van A',
        authorEmail: 'a@example.com',
        content: 'Ve rat tot',
        status: 'approved',
        createdAt: '2026-03-01T10:00:00.000Z',
        tenant: 10,
      })
      assert.deepEqual(createdDocs[1], {
        post: 50,
        authorName: 'Tran Thi B',
        authorEmail: undefined,
        content: 'Bai viet hay',
        status: 'approved',
        createdAt: '2026-03-02T10:00:00.000Z',
        tenant: 10,
      })
    } finally {
      staged.comments = original
    }
  })

  it('dryRun does not call payload.create', async () => {
    const original = staged.comments
    staged.comments = () => [
      {
        collection: 'comments',
        authorName: 'Dry Tester',
        content: 'Test content',
        status: 'approved',
        createdAt: '2026-03-01T10:00:00.000Z',
        wp: { databaseId: 201 },
        target: { type: 'product', slug: 'sample-prod', wpId: 3001 },
      },
    ]
    try {
      let createCalled = false
      const ctx = mockContext({
        dryRun: true,
        payload: {
          find: async (args: { collection: string }) => {
            if (args.collection === 'products') {
              return { docs: [{ id: 77, slug: 'sample-prod' }], totalDocs: 1 }
            }
            return { docs: [], totalDocs: 0 }
          },
          create: async () => {
            createCalled = true
            return { id: 1 }
          },
        } as unknown as ImportContext['payload'],
      })

      await runCommentsPhase(ctx)
      assert.equal(createCalled, false)
    } finally {
      staged.comments = original
    }
  })
})
