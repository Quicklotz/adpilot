import ora from 'ora';
import chalk from 'chalk';

export function createSpinner(text: string) {
  return ora({ text, color: 'cyan' });
}

export function parseKeyValue(pairs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(`Invalid key=value pair: "${pair}". Use format: key=value`);
    }
    const key = pair.substring(0, eqIndex).trim();
    const value = pair.substring(eqIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

export function formatBudget(value: string | number | undefined): string {
  if (!value) return '-';
  const cents = typeof value === 'string' ? parseInt(value, 10) : value;
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

export function truncate(str: string, maxLen: number): string {
  if (!str) return '-';
  return str.length > maxLen ? str.substring(0, maxLen - 1) + '…' : str;
}

export function buildFieldsParam(fields: string | undefined, defaults: string[]): string {
  return fields || defaults.join(',');
}

export const CAMPAIGN_OBJECTIVES = [
  'OUTCOME_AWARENESS',
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_LEADS',
  'OUTCOME_SALES',
  'OUTCOME_TRAFFIC',
  'OUTCOME_APP_PROMOTION',
] as const;

export const SPECIAL_AD_CATEGORIES = [
  'NONE',
  'EMPLOYMENT',
  'HOUSING',
  'CREDIT',
  'ISSUES_ELECTIONS_POLITICS',
  'ONLINE_GAMBLING_AND_GAMING',
  'FINANCIAL_PRODUCTS_SERVICES',
] as const;

export const BID_STRATEGIES = [
  'LOWEST_COST_WITHOUT_CAP',
  'LOWEST_COST_WITH_BID_CAP',
  'COST_CAP',
  'LOWEST_COST_WITH_MIN_ROAS',
] as const;

export const BILLING_EVENTS = [
  'IMPRESSIONS',
  'LINK_CLICKS',
  'APP_INSTALLS',
  'PAGE_LIKES',
  'POST_ENGAGEMENT',
  'THRUPLAY',
  'PURCHASE',
  'LISTING_INTERACTION',
] as const;

export const OPTIMIZATION_GOALS = [
  'REACH',
  'IMPRESSIONS',
  'AD_RECALL_LIFT',
  'LINK_CLICKS',
  'LANDING_PAGE_VIEWS',
  'OFFSITE_CONVERSIONS',
  'VALUE',
  'APP_INSTALLS',
  'LEAD_GENERATION',
  'QUALITY_LEAD',
  'CONVERSATIONS',
  'THRUPLAY',
  'PAGE_LIKES',
  'POST_ENGAGEMENT',
  'NONE',
] as const;

export const CTA_TYPES = [
  'SHOP_NOW',
  'LEARN_MORE',
  'SIGN_UP',
  'BOOK_NOW',
  'DOWNLOAD',
  'GET_QUOTE',
  'CONTACT_US',
  'SUBSCRIBE',
  'GET_OFFER',
  'BUY_NOW',
  'APPLY_NOW',
  'WATCH_MORE',
  'CALL_NOW',
  'GET_DIRECTIONS',
  'SEND_MESSAGE',
  'WHATSAPP_MESSAGE',
  'ORDER_NOW',
  'ADD_TO_CART',
  'NO_BUTTON',
] as const;

export const DATE_PRESETS = [
  'today',
  'yesterday',
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_year',
  'last_3d',
  'last_7d',
  'last_14d',
  'last_28d',
  'last_30d',
  'last_90d',
  'maximum',
] as const;
