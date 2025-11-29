import type { Environment } from './types';

export const API_URLS: Record<Environment, string> = {
  development: 'http://localhost:3001',
  staging: 'https://pay-api.staging.msq.com',
  production: 'https://pay-api.msq.com',
  custom: ''
};

export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json'
};
