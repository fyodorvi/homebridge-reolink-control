import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { ReolinkControlPlatform } from '../platform';
import { ReolinkCameraConfig } from '../interface/config';
import { Reolink } from './reolinkApi';
import { clearTimeout } from 'node:timers';

export class ReolinkCameraAccessory {
  private checkOnlineTimeout!: NodeJS.Timeout;
  private enableTimeout!: NodeJS.Timeout;
  private service: Service;

  private states = {
    on: true, // on by default, we cannot really determine initial position
    monitorPointAuto: false,
    maskEnabled: false,
    maskAreas: [] as Reolink.MaskArea[],
    online: true,
  };

  constructor(
    private readonly platform: ReolinkControlPlatform,
    private readonly accessory: PlatformAccessory,
    devInfo: Reolink.DevInfo,
    private readonly config: ReolinkCameraConfig,
  ) {
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Reolink')
      .setCharacteristic(this.platform.Characteristic.Model, devInfo.model) // it's really just NVR but why not
      .setCharacteristic(this.platform.Characteristic.SerialNumber, devInfo.detail);

    this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);

    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    this.platform.api.on('shutdown', async () => {
      if (this.checkOnlineTimeout) {
        clearTimeout(this.checkOnlineTimeout);
      }
    });
  }

  private async waitForMovement() {
    // just waiting a few seconds for camera to move into position
    const movementPromise = new Promise((resolve) => {
      setTimeout(resolve, 3000);
    });

    await movementPromise;
  }

  private async enable() {
    const reolink = this.platform.reolinkService;
    const channel = this.config.channel;

    if (this.config.maskBlackOut) {
      // restoring mask settings to original
      await reolink.setMask(channel, this.states.maskEnabled, this.states.maskAreas);
    }

    if (this.config.disableAudio) {
      await reolink.setAudioEnabled(channel, true);
    }

    if (this.config.disabledPtzPresetId) {
      if (this.states.monitorPointAuto) {
        // monitor point auto was enabled before it got disabled
        this.states.monitorPointAuto = false;
        await reolink.setMonitorPointAuto(channel, true); // enabling monitor point back
      }
      await reolink.returnToMonitorPoint(channel);
      await this.waitForMovement();
    }

    this.states.on = true;
  }

  private async disable() {
    const reolink = this.platform.reolinkService;
    const channel = this.config.channel;

    if (this.config.maskBlackOut) {
      // remembering mask settings
      const maskSettings = await reolink.getMask(channel);
      this.states.maskEnabled = maskSettings.enable === 1;
      this.states.maskAreas = maskSettings.area;

      // masking out entire frame
      await reolink.setMaskBlackOut(channel);
    }

    if (this.config.disableAudio) {
      await reolink.setAudioEnabled(channel, false);
    }

    if (this.config.disabledPtzPresetId) {
      const ptzGuard = await reolink.getMonitorPoint(channel);
      if (ptzGuard.benable === 1) {
        this.states.monitorPointAuto = true; // remembering that monitor point auto mode is there
        await reolink.setMonitorPointAuto(channel, false); // disabling monitor point
      }
      await reolink.activatePreset(channel, this.config.disabledPtzPresetId);
      await this.waitForMovement();
    }

    this.states.on = false;
  }

  async setOn(value: CharacteristicValue) {
    this.platform.log.debug('Set Characteristic On ->', value);

    if (!this.config.disableAudio && !this.config.maskBlackOut && this.config.disabledPtzPresetId === undefined) {
      this.platform.log.error(`Camera ${this.config.name} has nothing to do!`);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }

    try {
      if (value === true) {
        await this.enable();
      } else {
        await this.disable();
        if (this.config.disabledTimeout) {
          if (this.enableTimeout) {
            clearTimeout(this.enableTimeout);
          }
          setTimeout(() => {
            this.platform.log.debug(`Enabling ${this.config.name} back after timeout`);
            this.enable();
          }, this.config.disabledTimeout * 1000);
        }
      }
    } catch (error) {
      const { HapStatusError, HAPStatus } = this.platform.api.hap;
      throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  async checkOnline(initial: boolean = true) {
    try {
      this.states.online = await this.platform.reolinkService.getChannelOnline(this.config.channel);
    } catch (error) {
      this.platform.log.error(`Camera ${this.config.name} failed to update status`, error);
    }
    if (initial) {
      if (!this.states.online) {
        this.platform.log.warn(`Camera ${this.config.name} is offline`);
      } else {
        this.platform.log.info(`Camera ${this.config.name} is online`);
      }
    }
    this.checkOnlineTimeout = setTimeout(() => this.checkOnline(false), 5000); // pinging every five seconds
  }

  async getOn(): Promise<CharacteristicValue> {
    if (!this.states.online) {
      this.platform.log.error(`Camera ${this.config.name} appears to be offline`);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }

    const isOn = this.states.on;
    this.platform.log.debug('Get Characteristic On ->', isOn);
    return isOn;
  }
}
