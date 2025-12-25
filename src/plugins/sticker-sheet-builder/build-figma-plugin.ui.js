// build-figma-plugin.ui.js
/* eslint-disable no-undef */

module.exports = function (buildOptions) {
  return {
    ...buildOptions,
    loader: {
      ...buildOptions.loader,
      ".svg": "dataurl",
    },
  };
};
