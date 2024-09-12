import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import { DateTime } from 'luxon';
import { type Logging } from 'homebridge';
import * as https from 'node:https';

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Reolink {
  export interface Command<T> {
    cmd: string;
    param?: T
  }

  export interface PtzCtrlParam {
    channel: number;
    op: string;
    id: number;
  }

  export interface SetEncParam {
    Enc: {
      channel: number;
      audio: number;
      mainStream: SetEncParamStream;
      subStream: SetEncParamStream;
    }
  }

  export interface SetEncParamStream {
    size: string;
    frameRate: number;
    bitRate: number;
    profile: string;
  }

  export interface GetEncParam {
    channel: number;
  }

  export interface Enc {
    audio: number;
    channel: number;
    mainStream: EncStream;
    subStream: EncStream;
  }

  export interface EncStream {
    bitRate: number;
    frameRate: number;
    gop: number;
    height: number;
    profile: string;
    size: string;
    vType: string;
    width: number;
  }

  export interface DevInfo {
    B485: number;
    IOInputNum: number;
    IOOutputNum: number;
    audioNum: number;
    buildDay: string;
    cfgVer: string;
    channelNum: number;
    detail: string;
    diskNum: number,
    exactType: string;
    firmVer: string;
    frameworkVer: number;
    hardVer: string;
    model: string;
    name: string;
    pakSuffix: string;
    serial: number;
    type: string;
    wifi: number;
  }

  export interface GetPtzGuardParam {
    channel: number;
  }

  export interface PtzGuard {
    benable : number;
    bexistPos : number;
    channel : number;
    timeout : number;
  }

  export interface SetPtzGuardParam {
    PtzGuard: {
      channel: number;
      cmdStr: 'setPos' | 'toPos';
      benable: number;
      timeout: number;
      bexistPos: number;
      bSaveCurrentPos: number;
    }
  }

  export interface SetMaskParam {
    Mask: {
      channel: number;
      enable: number;
      area: SetMaskParamArea[];
    }
  }

  export interface SetMaskParamArea {
    screen: {
      height: number;
      width: number;
    },
    block: {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  }

  export interface GetMaskParam {
    channel: number;
  }

  export interface Mask {
    channel: number;
    enable: number;
    area: MaskArea[];
  }

  export interface MaskArea {
    screen: {
      height: number;
      width: number;
    },
    block: {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  }

  export interface Channelstatus {
    count: number;
    status: ChannelstatusInfo[];
  }

  export interface ChannelstatusInfo {
    channel : number;
    name : string;
    online : number;
    typeInfo : string;
  }
}


export class ReolinkApi {
  private token?: string;
  private isTokenRefreshing: boolean = false;
  private tokenRefreshed?: DateTime;
  private loggingOut: boolean = false;
  private instance: AxiosInstance;

  constructor(
    private log: Logging,
    ipAddress: string,
    private username: string,
    private password: string,
  ) {
    this.instance = axios.create({
      baseURL: `https://${ipAddress}/cgi-bin`,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
    });

    this.instance.interceptors.request.use((config) => {
      this.log.debug(`Reolink API request: ${config.baseURL}${config.url}`, JSON.stringify(config.data));
      return config;
    });

    this.instance.interceptors.response.use((response) => {
      this.log.debug(`Reolink API response: ${response.status}`, JSON.stringify(response.data));
      return response;
    });
  }

  private async refreshToken() {
    this.isTokenRefreshing = true;
    let response: AxiosResponse;
    try {
      response = await this.instance.post('/api.cgi?cmd=Login', [{
        cmd: 'Login',
        param: {
          User: {
            Version: '0',
            userName: this.username,
            password: this.password,
          },
        },
      }],
      );
    } catch (error: unknown) {
      this.log.error('Could not refresh Reolink token: ', error);
      throw error;
    } finally {
      this.isTokenRefreshing = false;
    }

    if (response.data[0].error) {
      if (response.data[0].error.rspCode === -6) {
        this.log.error('Could not refresh Reolink token, likely wrong username or password');
      }
      throw response.data[0].error;
    }
    if (response.data[0].value.Token.name) {
      this.log.debug('Reolink login success');
      this.token = response.data[0].value.Token.name;
      this.tokenRefreshed = DateTime.now();
    }
  }

  public async logout() {
    this.loggingOut = true;
    if (this.tokenRefreshed && DateTime.now().diff(this.tokenRefreshed, 'seconds').seconds < 3600) {
      await this.command({
        cmd: 'Logout',
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async command(content: Reolink.Command<unknown>): Promise<any> {
    if (this.loggingOut && content.cmd !== 'Logout') {
      this.log.debug('Terminating request, logging out is in progress...');
      throw new Error('Logout is in progress');
    }
    if (!this.tokenRefreshed || DateTime.now().diff(this.tokenRefreshed, 'seconds').seconds > 3599) {
      if (this.isTokenRefreshing) {
        // preventing double refreshing with a simple waiter
        await new Promise<void>((resolve) => {
          const checkTokenRefreshed = () => {
            if (!this.isTokenRefreshing) {
              resolve();
            } else {
              setTimeout(() => checkTokenRefreshed(), 100);
            }
          };
          checkTokenRefreshed();
        });
      } else {
        await this.refreshToken();
      }
    }
    try {
      const result = await this.instance.post(`/api.cgi?cmd=${content.cmd}&token=${this.token}`, [content]);
      if (result.data[0].error) {
        throw result.data[0].error;
      }
      this.log.debug(`Reolink command ${content.cmd} success`, JSON.stringify(result.data));
      return result.data[0].value;
    } catch (error: unknown) {
      if (error instanceof AxiosError && error.response?.data[0]?.error.rspCode === -6) {
        // token needs refreshing
        this.tokenRefreshed = undefined;
        return this.command(content);
      } else {
        this.log.error(`Failed executing ${content.cmd} command`, error);
        throw error;
      }
    }
  }

  public async GetDevInfo(): Promise<Reolink.DevInfo> {
    const response = await this.command({
      cmd: 'GetDevInfo',
    });
    return response.DevInfo as Reolink.DevInfo;
  }

  public async PtzCtrl(param: Reolink.PtzCtrlParam) {
    await this.command({
      cmd: 'PtzCtrl',
      param,
    });
  }

  public async GetEnc(param: Reolink.GetEncParam): Promise<Reolink.Enc> {
    const response = await this.command({
      cmd: 'GetEnc',
      param,
    });
    return response.Enc as Reolink.Enc;
  }

  public async SetEnc(param: Reolink.SetEncParam) {
    await this.command({
      cmd: 'SetEnc',
      param,
    });
  }

  public async GetPtzGuard(param: Reolink.GetPtzGuardParam): Promise<Reolink.PtzGuard> {
    const response = await this.command({
      cmd: 'GetPtzGuard',
      param,
    });
    return response.PtzGuard as Reolink.PtzGuard;
  }

  public async SetPtzGuard(param: Reolink.SetPtzGuardParam) {
    await this.command({
      cmd: 'SetPtzGuard',
      param,
    });
  }

  public async GetMask(param: Reolink.GetMaskParam) {
    const response = await this.command({
      cmd: 'GetMask',
      param,
    });

    return response.Mask as Reolink.Mask;
  }

  public async SetMask(param: Reolink.SetMaskParam) {
    await this.command({
      cmd: 'SetMask',
      param,
    });
  }

  public async Getchannelstatus() {
    return await this.command({
      cmd: 'GetchannelStatus',
    }) as Reolink.Channelstatus;
  }
}