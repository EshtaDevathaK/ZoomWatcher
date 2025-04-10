import { apiRequest } from './queryClient';

export interface UserSettings {
  autoMuteEnabled: boolean;
  autoVideoOffEnabled: boolean;
  alwaysOnModeEnabled: boolean;
  autoMuteAlertsEnabled: boolean;
  autoVideoAlertsEnabled: boolean;
  vibrationFeedbackEnabled: boolean;
  allNotificationsDisabled: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  autoMuteEnabled: true,
  autoVideoOffEnabled: true,
  alwaysOnModeEnabled: false,
  autoMuteAlertsEnabled: true,
  autoVideoAlertsEnabled: true,
  vibrationFeedbackEnabled: true,
  allNotificationsDisabled: false
};

export class SettingsManager {
  private static instance: SettingsManager;
  private settings: UserSettings;
  private syncInProgress: boolean = false;
  private syncQueue: Array<Partial<UserSettings>> = [];

  private constructor() {
    this.settings = this.loadFromLocalStorage();
  }

  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  private loadFromLocalStorage(): UserSettings {
    try {
      const stored = localStorage.getItem('zoomwatcher_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.error('Error loading settings from localStorage:', error);
    }
    return { ...DEFAULT_SETTINGS };
  }

  private saveToLocalStorage(settings: UserSettings): void {
    try {
      localStorage.setItem('zoomwatcher_settings', JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings to localStorage:', error);
    }
  }

  private async syncWithServer(settings: Partial<UserSettings>): Promise<void> {
    if (this.syncInProgress) {
      this.syncQueue.push(settings);
      return;
    }

    this.syncInProgress = true;

    try {
      const response = await apiRequest('PATCH', '/api/settings', {
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        throw new Error('Failed to sync settings with server');
      }

      // Process queue if there are pending updates
      if (this.syncQueue.length > 0) {
        const nextSettings = this.syncQueue.shift()!;
        await this.syncWithServer(nextSettings);
      }
    } catch (error) {
      console.error('Error syncing settings with server:', error);
      // Add failed sync back to queue
      this.syncQueue.unshift(settings);
      // Retry after delay
      setTimeout(() => {
        this.syncInProgress = false;
        if (this.syncQueue.length > 0) {
          const nextSettings = this.syncQueue.shift()!;
          this.syncWithServer(nextSettings);
        }
      }, 5000);
    } finally {
      this.syncInProgress = false;
    }
  }

  async updateSettings(newSettings: Partial<UserSettings>): Promise<void> {
    // Update local settings
    this.settings = {
      ...this.settings,
      ...newSettings
    };

    // Save to localStorage
    this.saveToLocalStorage(this.settings);

    // Sync with server
    await this.syncWithServer(newSettings);
  }

  getSettings(): UserSettings {
    return { ...this.settings };
  }

  async loadSettingsFromServer(): Promise<void> {
    try {
      const response = await apiRequest('GET', '/api/settings');
      if (!response.ok) {
        throw new Error('Failed to load settings from server');
      }

      const serverSettings = await response.json();
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...serverSettings
      };

      this.saveToLocalStorage(this.settings);
    } catch (error) {
      console.error('Error loading settings from server:', error);
      // Fall back to local settings
      this.settings = this.loadFromLocalStorage();
    }
  }

  resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveToLocalStorage(this.settings);
    this.syncWithServer(this.settings);
  }
} 