import Conf from 'conf';
import path from 'path';
import os from 'os';

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
    apiVersion: config.get('apiVersion'),
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
  const token = config.get('accessToken');
  if (!token) {
    throw new Error(
      'No access token configured. Run `adpilot auth login` to set your token.'
    );
  }
  return token;
}

export function getAdAccountId(): string {
  const id = config.get('adAccountId');
  if (!id) {
    throw new Error(
      'No ad account ID configured. Run `adpilot config set adAccountId act_XXXXX`'
    );
  }
  return id.startsWith('act_') ? id : `act_${id}`;
}

export { config };
