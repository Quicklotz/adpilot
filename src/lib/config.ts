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

export function getConfig(): AdPilotConfig {
  return {
    accessToken: config.get('accessToken'),
    adAccountId: config.get('adAccountId'),
    apiVersion: process.env.ADPILOT_API_VERSION || config.get('apiVersion'),
    defaultOutputFormat: config.get('defaultOutputFormat'),
    pageSize: config.get('pageSize'),
  };
}

export function setConfig(key: keyof AdPilotConfig, value: string | number): void {
  config.set(key, value);
}

export function clearConfig(): void {
  config.clear();
}

export function getToken(): string {
  const token =
    config.get('accessToken') ||
    process.env.ADPILOT_TOKEN ||
    process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) {
    throw new AuthError(
      'No access token configured. Run `adpilot auth login` or set ADPILOT_TOKEN / FACEBOOK_ACCESS_TOKEN env var.'
    );
  }
  return token;
}

export function getAdAccountId(): string {
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

export { config };
