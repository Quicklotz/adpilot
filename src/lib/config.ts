import Conf from 'conf';
import path from 'path';
import os from 'os';
import { AuthError } from '../utils/errors';

export interface AdPilotConfig {
  accessToken?: string;
  adAccountId?: string;
  apiVersion: string;
  defaultOutputFormat: 'table' | 'json';
  pageSize: number;
  activeProfile?: string;
  appId?: string;
  appSecret?: string;
  tokenExpiresAt?: number; // Unix timestamp (seconds) when the token expires
}

export interface Profile {
  name: string;
  accessToken: string;
  adAccountId: string;
  apiVersion?: string;
  description?: string;
  createdAt: string;
}

const configDir = path.join(os.homedir(), '.adpilot');

const config = new Conf<AdPilotConfig>({
  projectName: 'adpilot',
  cwd: configDir,
  defaults: {
    apiVersion: 'v25.0',
    defaultOutputFormat: 'table',
    pageSize: 25,
  },
});

const profileStore = new Conf<Record<string, Profile>>({
  projectName: 'adpilot-profiles',
  cwd: configDir,
  defaults: {},
});

// --- Profile management ---

export function listProfiles(): Profile[] {
  const all = profileStore.store;
  return Object.values(all);
}

export function getProfile(name: string): Profile | undefined {
  return profileStore.get(name) as Profile | undefined;
}

export function saveProfile(profile: Profile): void {
  profileStore.set(profile.name, profile);
}

export function deleteProfile(name: string): void {
  profileStore.delete(name);
  // If the deleted profile was active, clear the active profile setting
  if (config.get('activeProfile') === name) {
    config.delete('activeProfile');
  }
}

export function getActiveProfileName(): string | undefined {
  return config.get('activeProfile');
}

export function switchProfile(name: string): void {
  const profile = getProfile(name);
  if (!profile) {
    throw new AuthError(`Profile "${name}" does not exist. Run \`adpilot auth profiles list\` to see available profiles.`);
  }
  config.set('activeProfile', name);
  config.set('accessToken', profile.accessToken);
  config.set('adAccountId', profile.adAccountId);
  if (profile.apiVersion) {
    config.set('apiVersion', profile.apiVersion);
  }
}

// --- Config accessors ---

export function getConfig(): AdPilotConfig {
  return {
    accessToken: config.get('accessToken'),
    adAccountId: config.get('adAccountId'),
    apiVersion: process.env.ADPILOT_API_VERSION || config.get('apiVersion'),
    defaultOutputFormat: config.get('defaultOutputFormat'),
    pageSize: config.get('pageSize'),
    activeProfile: config.get('activeProfile'),
    appId: config.get('appId'),
    appSecret: config.get('appSecret'),
    tokenExpiresAt: config.get('tokenExpiresAt'),
  };
}

export function setConfig(key: keyof AdPilotConfig, value: string | number): void {
  config.set(key, value);
}

export function clearConfig(): void {
  config.clear();
}

export function getToken(): string {
  // Check active profile first
  const activeProfileName = config.get('activeProfile');
  if (activeProfileName) {
    const profile = getProfile(activeProfileName);
    if (profile?.accessToken) {
      return profile.accessToken;
    }
  }

  const token =
    config.get('accessToken') ||
    process.env.ADPILOT_TOKEN ||
    process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) {
    throw new AuthError(
      'No access token configured. Run `adpilot auth login` or set ADPILOT_TOKEN / FACEBOOK_ACCESS_TOKEN env var.'
    );
  }

  // Check token expiry if we have a stored expiry timestamp
  const expiresAt = config.get('tokenExpiresAt');
  if (expiresAt) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec >= expiresAt) {
      throw new AuthError(
        'Token expired. Run `adpilot auth refresh` or `adpilot auth oauth` to get a new token.'
      );
    }
    // Warn if token expires within 24 hours
    const twentyFourHours = 24 * 60 * 60;
    if (expiresAt - nowSec < twentyFourHours) {
      const hoursLeft = Math.round((expiresAt - nowSec) / 3600 * 10) / 10;
      process.stderr.write(
        `Warning: Token expires in ${hoursLeft} hour(s). Run \`adpilot auth refresh\` to extend it.\n`
      );
    }
  }

  return token;
}

export function getAdAccountId(): string {
  // Check active profile first
  const activeProfileName = config.get('activeProfile');
  if (activeProfileName) {
    const profile = getProfile(activeProfileName);
    if (profile?.adAccountId) {
      const id = profile.adAccountId;
      return id.startsWith('act_') ? id : `act_${id}`;
    }
  }

  const id =
    config.get('adAccountId') ||
    process.env.ADPILOT_ACCOUNT_ID ||
    process.env.FACEBOOK_AD_ACCOUNT_ID;
  if (!id) {
    throw new AuthError(
      'No ad account ID configured. Run `adpilot config set adAccountId act_XXXXX` or set ADPILOT_ACCOUNT_ID / FACEBOOK_AD_ACCOUNT_ID env var.'
    );
  }
  return id.startsWith('act_') ? id : `act_${id}`;
}

export { config, profileStore };
