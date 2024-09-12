import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { ReolinkCameraAccessory } from './lib/reolinkCameraAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { ReolinkControlConfig } from './interface/config';
import { ReolinkService } from './lib/reolinkService.js';
import { Reolink } from './lib/reolinkApi.js';


export class ReolinkControlPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  private readonly Config: PlatformConfig & ReolinkControlConfig;

  public readonly accessories: PlatformAccessory[] = [];

  public readonly reolinkService: ReolinkService;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.Config = this.config as PlatformConfig & ReolinkControlConfig;

    this.reolinkService = new ReolinkService(log, this.Config.ipAddress, this.Config.username, this.Config.password);

    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', async () => {
      log.debug('Executed didFinishLaunching callback');
      await this.discoverDevices();
    });

    this.api.on('shutdown', async () => {
      await this.reolinkService.logout();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  async discoverDevices() {
    let deviceInfo: Reolink.DevInfo;
    try {
      deviceInfo = await this.reolinkService.getDeviceInfo();
      this.log.info('Logged in to Reolink');
    } catch (e) {
      this.log.error('Could not get Reolink device info, please check config, error:', e);
      return;
    }

    for (const camera of this.Config.cameras) {

      // check if PTZ Guard is configured on the camera if we're disabling through PTZ
      if (camera.disabledPtzPresetId) {
        const ptzGuard = await this.reolinkService.getMonitorPoint(camera.channel);

        if (ptzGuard.bexistPos !== 1) {
          this.log.warn(`Camera ${camera.name} has no monitor point configured! Configure monitor point to enable camera to return to the original position.`);
        } else {
          this.log.debug(`Camera ${camera.name} monitor point OK`);
        }
      }

      const uuid = this.api.hap.uuid.generate(camera.channel + camera.name);

      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      let reolinkCamera: ReolinkCameraAccessory;

      if (existingAccessory) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        reolinkCamera = new ReolinkCameraAccessory(this, existingAccessory, deviceInfo, camera);

      } else {
        this.log.info('Adding new accessory:', camera.name);

        const accessory = new this.api.platformAccessory(camera.name, uuid);
        accessory.context.device = camera;

        reolinkCamera = new ReolinkCameraAccessory(this, accessory, deviceInfo, camera);

        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      await reolinkCamera.checkOnline();
    }
  }
}
