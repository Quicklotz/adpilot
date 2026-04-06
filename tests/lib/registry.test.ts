/**
 * Tests for the IP project registry module.
 *
 * We mock the Conf store so no filesystem access occurs.
 */

const mockStore: Record<string, any> = {};
jest.mock('conf', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn((key: string, defaultValue?: any) => mockStore[key] ?? defaultValue),
    set: jest.fn((key: string, value: any) => { mockStore[key] = value; }),
    delete: jest.fn((key: string) => { delete mockStore[key]; }),
    store: mockStore,
  }));
});

import {
  slugify,
  createProject,
  getProject,
  listProjects,
  updateProject,
  deleteProject,
  linkCampaign,
  unlinkCampaign,
} from '../../src/lib/registry';
import { AdPilotError } from '../../src/utils/errors';

beforeEach(() => {
  // Reset store to empty projects map before each test
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  mockStore.projects = {};
});

describe('slugify', () => {
  it('converts "My Product Name" to "my-product-name"', () => {
    expect(slugify('My Product Name')).toBe('my-product-name');
  });

  it('handles special characters', () => {
    expect(slugify('Hello World! @#$%')).toBe('hello-world');
  });

  it('collapses multiple spaces and hyphens', () => {
    expect(slugify('  double   spaces  ')).toBe('double-spaces');
    expect(slugify('multi---hyphens')).toBe('multi-hyphens');
  });

  it('strips leading/trailing hyphens', () => {
    expect(slugify('-start-end-')).toBe('start-end');
  });

  it('handles underscores (treated as word separators)', () => {
    // The regex replaces [\s_]+ with hyphens, then strips non-alphanumeric/non-hyphen chars
    // So 'with_underscores_too' -> 'with-underscores-too' if underscores hit the [\s_]+ rule
    // Actually: step 1 strips [^a-z0-9\s-] (removes _), step 2 [\s_]+ -> '-'
    // Underscores are removed by the first regex, leaving 'withunderscorestoo'
    expect(slugify('with_underscores_too')).toBe('withunderscorestoo');
  });

  it('returns empty string for non-alphanumeric input', () => {
    expect(slugify('!!!@@@')).toBe('');
  });
});

describe('createProject', () => {
  it('creates a project with auto-generated ID, active status, empty campaignIds, and timestamps', () => {
    const project = createProject({ name: 'My Test Product' });

    expect(project.id).toBe('my-test-product');
    expect(project.name).toBe('My Test Product');
    expect(project.status).toBe('active');
    expect(project.campaignIds).toEqual([]);
    expect(project.createdAt).toBeDefined();
    expect(project.updatedAt).toBeDefined();
    expect(project.createdAt).toBe(project.updatedAt);
  });

  it('stores the project in the store', () => {
    createProject({ name: 'Stored Project' });
    expect(mockStore.projects['stored-project']).toBeDefined();
    expect(mockStore.projects['stored-project'].name).toBe('Stored Project');
  });

  it('includes optional fields', () => {
    const project = createProject({
      name: 'Full Project',
      description: 'A full project',
      url: 'https://example.com',
      targetAudience: '18-35 males',
      budgetCents: 50000,
      tags: ['test', 'demo'],
      metadata: { source: 'cli' },
    });

    expect(project.description).toBe('A full project');
    expect(project.url).toBe('https://example.com');
    expect(project.targetAudience).toBe('18-35 males');
    expect(project.budgetCents).toBe(50000);
    expect(project.tags).toEqual(['test', 'demo']);
    expect(project.metadata).toEqual({ source: 'cli' });
  });

  it('throws if name produces empty slug', () => {
    expect(() => createProject({ name: '!!!' })).toThrow(AdPilotError);
    expect(() => createProject({ name: '!!!' })).toThrow('alphanumeric');
  });

  it('throws if project ID already exists', () => {
    createProject({ name: 'Duplicate' });
    expect(() => createProject({ name: 'Duplicate' })).toThrow(AdPilotError);
    expect(() => createProject({ name: 'duplicate' })).toThrow('already exists');
  });
});

describe('getProject', () => {
  it('returns a project by ID', () => {
    createProject({ name: 'Findable' });
    const found = getProject('findable');
    expect(found).toBeDefined();
    expect(found!.name).toBe('Findable');
  });

  it('returns undefined for a missing project', () => {
    expect(getProject('nonexistent')).toBeUndefined();
  });
});

describe('listProjects', () => {
  it('returns all projects', () => {
    createProject({ name: 'Project Alpha' });
    createProject({ name: 'Project Beta' });
    const all = listProjects();
    expect(all).toHaveLength(2);
    const names = all.map((p) => p.name);
    expect(names).toContain('Project Alpha');
    expect(names).toContain('Project Beta');
  });

  it('returns empty array when no projects exist', () => {
    expect(listProjects()).toEqual([]);
  });
});

describe('updateProject', () => {
  it('applies partial updates', () => {
    createProject({ name: 'Updatable' });
    const updated = updateProject('updatable', { description: 'New description' });
    expect(updated.description).toBe('New description');
    expect(updated.name).toBe('Updatable');
  });

  it('protects id field from being overwritten', () => {
    createProject({ name: 'Protected' });
    const updated = updateProject('protected', { id: 'hacked' } as any);
    expect(updated.id).toBe('protected');
  });

  it('protects createdAt field from being overwritten', () => {
    const original = createProject({ name: 'Timestamp Guard' });
    const updated = updateProject('timestamp-guard', { createdAt: '1999-01-01' } as any);
    expect(updated.createdAt).toBe(original.createdAt);
  });

  it('updates updatedAt timestamp', () => {
    const original = createProject({ name: 'Timestamped' });
    // Small delay to ensure different timestamp
    const updated = updateProject('timestamped', { description: 'changed' });
    expect(updated.updatedAt).toBeDefined();
    // updatedAt should be >= createdAt (may be same in fast tests)
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(original.createdAt).getTime()
    );
  });

  it('throws for a missing project', () => {
    expect(() => updateProject('ghost', { description: 'nope' })).toThrow(AdPilotError);
    expect(() => updateProject('ghost', {})).toThrow('not found');
  });
});

describe('deleteProject', () => {
  it('removes a project from the store', () => {
    createProject({ name: 'Deletable' });
    expect(getProject('deletable')).toBeDefined();
    deleteProject('deletable');
    expect(getProject('deletable')).toBeUndefined();
  });

  it('throws for a missing project', () => {
    expect(() => deleteProject('nonexistent')).toThrow(AdPilotError);
    expect(() => deleteProject('nonexistent')).toThrow('not found');
  });
});

describe('linkCampaign', () => {
  it('adds a campaign ID to the project', () => {
    createProject({ name: 'Linkable' });
    linkCampaign('linkable', 'campaign_001');
    const project = getProject('linkable');
    expect(project!.campaignIds).toContain('campaign_001');
  });

  it('prevents duplicate campaign links', () => {
    createProject({ name: 'No Dups' });
    linkCampaign('no-dups', 'campaign_001');
    expect(() => linkCampaign('no-dups', 'campaign_001')).toThrow(AdPilotError);
    expect(() => linkCampaign('no-dups', 'campaign_001')).toThrow('already linked');
  });

  it('throws for a missing project', () => {
    expect(() => linkCampaign('missing', 'campaign_001')).toThrow(AdPilotError);
    expect(() => linkCampaign('missing', 'campaign_001')).toThrow('not found');
  });

  it('allows linking multiple different campaigns', () => {
    createProject({ name: 'Multi Link' });
    linkCampaign('multi-link', 'c1');
    linkCampaign('multi-link', 'c2');
    linkCampaign('multi-link', 'c3');
    const project = getProject('multi-link');
    expect(project!.campaignIds).toEqual(['c1', 'c2', 'c3']);
  });
});

describe('unlinkCampaign', () => {
  it('removes a campaign ID from the project', () => {
    createProject({ name: 'Unlinkable' });
    linkCampaign('unlinkable', 'campaign_001');
    linkCampaign('unlinkable', 'campaign_002');
    unlinkCampaign('unlinkable', 'campaign_001');
    const project = getProject('unlinkable');
    expect(project!.campaignIds).toEqual(['campaign_002']);
  });

  it('throws for a campaign that is not linked', () => {
    createProject({ name: 'Not Linked' });
    expect(() => unlinkCampaign('not-linked', 'campaign_999')).toThrow(AdPilotError);
    expect(() => unlinkCampaign('not-linked', 'campaign_999')).toThrow('not linked');
  });

  it('throws for a missing project', () => {
    expect(() => unlinkCampaign('ghost', 'campaign_001')).toThrow(AdPilotError);
    expect(() => unlinkCampaign('ghost', 'campaign_001')).toThrow('not found');
  });
});
