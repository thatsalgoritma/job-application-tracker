import { request } from '../api/http-client';

export interface UserSettings {
  emailDigestEnabled: boolean;
  followUpDays: number;
}

export function getUserSettings(): Promise<UserSettings> {
  return request<UserSettings>('/me/settings');
}

export function updateUserSettings(settings: UserSettings): Promise<UserSettings> {
  return request<UserSettings>('/me/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}
