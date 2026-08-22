module.exports = {
  packagerConfig: {
    name: 'EVI Desktop',
    executableName: 'evi-desktop',
    icon: './assets/icon',
    asar: true,
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'evi-desktop',
        setupIcon: './assets/icon.ico',
        iconUrl: 'https://raw.githubusercontent.com/creyeschaponan/evi-ai/master/evi-desktop/assets/icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
};
