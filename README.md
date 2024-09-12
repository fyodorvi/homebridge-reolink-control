<p align="center">

<img src="https://github.com/homebridge/branding/raw/latest/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>

<span align="center">

# Reolink Camera Control

</span>

Little Homebridge plugin for privacy control of Reolink cameras. Allows to enable or disable a camera in
various ways. NVR required!

The plugin adds a switch for each configured camera which allows you to easily enable or disable the camera from Home app or with Siri.

Disabling the camera can happen in one or more ways:

- Disable audio recording
- Mask out the view (black out)
- Activate PTZ preset (adjust the camera, e.g. point it into a wall)

To use PTZ feature you'd need to manually create a preset in Reolink app to move the camera to, and you also need
default monitor point so that the camera could return back to its original position. 

## Homebridge config

The example below contains comments, clean valid JSON version is here: [example/config.json](example/config.json)

```json5
{
  ...
  "platforms": [
    ...
    /* The block you need to enable this plugin */
    {
      "platform": "ReolinkControl",
      "ipAddress": "192.168.1.21", // supports NVR only
      "username": "admin",
      "password": "password",
      "cameras": [
        /* The block you need for each camera */
        {
          // name of the camera
          "name": "Living Room Camera",
          // channel of the camera
          "channel": 4,
          // PTZ Cameras only: this preset will be activated when camera is disabled
          // when camera is enabled back - it will return to default monitor point
          "disabledPtzPresetId": 0,
          // blacks out entire camera view with a mask when camera is disabled
          "maskBlackOut": true,
          // disables audio when camera is disabled 
          "disableAudio": true,
          // timeout after which camera will be enabled back 
          "disabledTimeout": 30
        }
      ]
    }
    /* End of the block needed to enable this plugin */
  ]
  ...
}
```