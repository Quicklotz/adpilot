import Conf from 'conf';
import path from 'path';
import os from 'os';
import { AdPilotError } from '../utils/errors';

export interface IPProject {
  id: string;           // auto-generated slug from name
  name: string;         // Human-readable name
  description?: string;
  url?: string;         // Landing page / product URL
  targetAudience?: string;
  budgetCents?: number; // Total budget allocated in cents
  status: 'active' | 'paused' | 'completed' | 'killed';
  campaignIds: string[];  // Associated Meta campaign IDs
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

interface RegistryStore {
  projects: Record<string, IPProject>;
}

const configDir = path.join(os.homedir(), '.adpilot');

const store = new Conf<RegistryStore>({
  projectName: 'adpilot-registry',
  cwd: configDir,
  configName: 'registry',
  defaults: {
    projects: {},
  },
});

/**
 * Convert a name to a URL-safe slug.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * List all registered IP projects.
 */
export function listProjects(): IPProject[] {
  const projects = store.get('projects');
  return Object.values(projects);
}

/**
 * Get a single project by ID.
 */
export function getProject(id: string): IPProject | undefined {
  const projects = store.get('projects');
  return projects[id];
}

/**
 * Create a new IP project.
 */
export function createProject(
  data: Omit<IPProject, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'campaignIds'>
): IPProject {
  const id = slugify(data.name);

  if (!id) {
    throw new AdPilotError('Project name must contain at least one alphanumeric character.');
  }

  const projects = store.get('projects');
  if (projects[id]) {
    throw new AdPilotError(`A project with ID "${id}" already exists. Choose a different name.`);
  }

  const now = new Date().toISOString();
  const project: IPProject = {
    id,
    name: data.name,
    description: data.description,
    url: data.url,
    targetAudience: data.targetAudience,
    budgetCents: data.budgetCents,
    status: 'active',
    campaignIds: [],
    createdAt: now,
    updatedAt: now,
    tags: data.tags,
    metadata: data.metadata,
  };

  projects[id] = project;
  store.set('projects', projects);
  return project;
}

/**
 * Update an existing project.
 */
export function updateProject(id: string, updates: Partial<IPProject>): IPProject {
  const projects = store.get('projects');
  const existing = projects[id];

  if (!existing) {
    throw new AdPilotError(`Project "${id}" not found.`);
  }

  // Prevent overwriting core identity fields via spread
  const { id: _id, createdAt: _ca, ...safeUpdates } = updates;

  const updated: IPProject = {
    ...existing,
    ...safeUpdates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  projects[id] = updated;
  store.set('projects', projects);
  return updated;
}

/**
 * Delete a project from the registry.
 */
export function deleteProject(id: string): void {
  const projects = store.get('projects');
  if (!projects[id]) {
    throw new AdPilotError(`Project "${id}" not found.`);
  }
  delete projects[id];
  store.set('projects', projects);
}

/**
 * Link a Meta campaign ID to a project.
 */
export function linkCampaign(projectId: string, campaignId: string): void {
  const projects = store.get('projects');
  const project = projects[projectId];
  if (!project) {
    throw new AdPilotError(`Project "${projectId}" not found.`);
  }

  if (project.campaignIds.includes(campaignId)) {
    throw new AdPilotError(`Campaign "${campaignId}" is already linked to project "${projectId}".`);
  }

  project.campaignIds.push(campaignId);
  project.updatedAt = new Date().toISOString();
  projects[projectId] = project;
  store.set('projects', projects);
}

/**
 * Unlink a Meta campaign ID from a project.
 */
export function unlinkCampaign(projectId: string, campaignId: string): void {
  const projects = store.get('projects');
  const project = projects[projectId];
  if (!project) {
    throw new AdPilotError(`Project "${projectId}" not found.`);
  }

  const idx = project.campaignIds.indexOf(campaignId);
  if (idx === -1) {
    throw new AdPilotError(`Campaign "${campaignId}" is not linked to project "${projectId}".`);
  }

  project.campaignIds.splice(idx, 1);
  project.updatedAt = new Date().toISOString();
  projects[projectId] = project;
  store.set('projects', projects);
}
