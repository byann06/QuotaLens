const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const fs = require('node:fs');
const path = require('node:path');

const appIconPath = path.resolve(__dirname, 'assets', 'app-icon.ico');
const hasAppIcon = fs.existsSync(appIconPath);
const perAppUsageHelperPublishPath = path.resolve(
  __dirname,
  'native/per-app-usage-helper/bin/Release/net8.0/win-x64/publish',
);

module.exports = {
  packagerConfig: {
    asar: true,
    extraResource: [
      'assets',
      ...(fs.existsSync(perAppUsageHelperPublishPath) ? [perAppUsageHelperPublishPath] : []),
    ],
    executableName: 'QuotaLens',
    name: 'QuotaLens',
    ...(hasAppIcon ? { icon: appIconPath } : {}),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'QuotaLens',
        authors: 'Abyan Ihza Pradipta',
        description: 'Desktop app for tracking laptop internet quota usage.',
        exe: 'QuotaLens.exe',
        setupExe: 'QuotaLensSetup.exe',
        noMsi: true,
        ...(hasAppIcon ? { setupIcon: appIconPath } : {}),
      },
      platforms: ['win32'],
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
