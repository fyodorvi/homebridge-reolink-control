import type { Logging } from 'homebridge';
import { Reolink, ReolinkApi } from './reolinkApi.js';
import MaskArea = Reolink.MaskArea;

export class NoMonitorPointError extends Error {}

export class ReolinkService {
  private api: ReolinkApi;

  constructor(log: Logging, ipAddress: string, username: string, password: string) {
    this.api = new ReolinkApi(log, ipAddress, username, password);
  }

  public async logout() {
    await this.api.logout();
  }

  public async getDeviceInfo() {
    return this.api.GetDevInfo();
  }

  public async activatePreset(channel: number, presetId: number): Promise<void> {
    await this.api.PtzCtrl({
      channel,
      op: 'ToPos',
      id: presetId,
    });
  }

  public async setAudioEnabled(channel: number, enabled: boolean): Promise<void> {
    const existingEnc = await this.api.GetEnc({ channel });

    await this.api.SetEnc({
      Enc: {
        channel,
        audio: enabled ? 1 : 0,
        mainStream: this.mapEncStream(existingEnc.mainStream),
        subStream: this.mapEncStream(existingEnc.subStream),
      },
    });
  }

  public async setIrLightsEnabled(channel: number, enabled: boolean): Promise<void> {
    await this.api.SetIrLights({
      IrLights: {
        channel,
        state: enabled ? 'Auto' : 'Off',
      },
    });
  }

  public async getMonitorPoint(channel: number) {
    return await this.api.GetPtzGuard({ channel });
  }

  public async setMonitorPointAuto(channel: number, enabled: boolean): Promise<void> {
    const existingPtzGuard = await this.api.GetPtzGuard({ channel });

    if (existingPtzGuard.bexistPos !== 1) {
      throw new NoMonitorPointError();
    }

    await this.api.SetPtzGuard({
      PtzGuard: {
        channel,
        benable: enabled ? 1 : 0,
        cmdStr: 'setPos',
        bexistPos: existingPtzGuard.bexistPos,
        bSaveCurrentPos: 0,
        timeout: existingPtzGuard.timeout,
      },
    });
  }

  public async returnToMonitorPoint(channel: number) {
    const existingPtzGuard = await this.api.GetPtzGuard({ channel });

    if (existingPtzGuard.bexistPos !== 1) {
      throw new NoMonitorPointError();
    }

    await this.api.SetPtzGuard({
      PtzGuard: {
        channel,
        benable: existingPtzGuard.benable,
        cmdStr: 'toPos',
        bexistPos: existingPtzGuard.bexistPos,
        bSaveCurrentPos: 0,
        timeout: existingPtzGuard.timeout,
      },
    });
  }

  public async getMask(channel: number) {
    return this.api.GetMask({ channel });
  }

  public async setMaskBlackOut(channel: number) {
    await this.setMask(channel, true, [{
      block: {
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
      },
      screen: {
        width: 1280,
        height: 720,
      },
    }]);
  }

  public async setMask(channel: number, enabled: boolean, areas: MaskArea[]): Promise<void> {
    await this.api.SetMask({
      Mask: {
        channel,
        enable: enabled ? 1 : 0,
        area: areas,
      },
    });
  }

  public async getChannelOnline(channel: number): Promise<boolean> {
    const channelsInfo = await this.api.Getchannelstatus();

    const channelStatus = channelsInfo.status.find(info => info.channel === channel);
    if (!channelStatus) {
      return false;
    }
    return channelStatus.online === 1;
  }

  private mapEncStream(stream: Reolink.EncStream): Reolink.SetEncParamStream {
    return {
      bitRate: stream.bitRate,
      frameRate: stream.frameRate,
      profile: stream.profile,
      size: stream.size,
    };
  }
}