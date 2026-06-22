// Provider-agnostic activity integration interface.
// Every future integration (Garmin, Fitbit, Coros, Apple Health) implements this.
// Routes and services depend on this interface, not on any specific provider.

export type ActivityType =
  | "Run" | "TrailRun" | "VirtualRun"
  | "Walk" | "Hike"
  | "Ride" | "VirtualRide" | "MountainBikeRide"
  | "Swim" | "WeightTraining" | "Other";

export interface NormalizedActivity {
  externalId: string;       // provider-native id
  provider: string;         // 'strava' | 'garmin' | ...
  userId: string;
  name: string;
  type: ActivityType;
  distanceMeters: number;
  movingTimeSeconds: number;
  elevationGainMeters: number;
  averageSpeedMs: number;
  averageHeartRate?: number;
  calories?: number;
  activityDate: string;     // YYYY-MM-DD local date
}

export interface ProviderStatus {
  connected: boolean;
  athleteName?: string;
  athleteAvatar?: string;
  lastSyncedAt?: string;
  activityCount: number;
}

export interface SyncResult {
  inserted: number;
  fetched: number;
  sessionsCreated: number;
}

export interface ActivityProvider {
  readonly id: string;
  readonly displayName: string;
  sync(userId: string): Promise<SyncResult>;
  disconnect(userId: string): Promise<void>;
  getStatus(userId: string): Promise<ProviderStatus | null>;
}
