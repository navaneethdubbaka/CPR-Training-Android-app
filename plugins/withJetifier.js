const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const JETIFIER_PROPS = [
  'android.useAndroidX=true',
  'android.enableJetifier=true',
];

const withJetifier = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const gradlePropsPath = path.join(
        config.modRequest.platformProjectRoot,
        'gradle.properties'
      );

      let contents = await fs.promises.readFile(gradlePropsPath, 'utf8');

      const linesToRemove = /^android\.(useAndroidX|enableJetifier)=.*$/gm;
      contents = contents.replace(linesToRemove, '').replace(/\n{3,}/g, '\n\n').trimEnd();

      contents = contents + '\n' + JETIFIER_PROPS.join('\n') + '\n';

      await fs.promises.writeFile(gradlePropsPath, contents);

      return config;
    },
  ]);
};

module.exports = withJetifier;
