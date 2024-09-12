export interface ReolinkControlConfig {
  ipAddress: string;
  username: string;
  password: string;
  cameras: ReolinkCameraConfig[]
}

export interface ReolinkCameraConfig {
  name: string;
  channel: number;
  disableAudio?: boolean;
  maskBlackOut?: boolean;
  disabledPtzPresetId?: number;
  disabledTimeout?: number;
}
