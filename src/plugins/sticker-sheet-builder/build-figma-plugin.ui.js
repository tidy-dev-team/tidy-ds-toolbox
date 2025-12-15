// build-figma-plugin.ui.js

module.exports = function (buildOptions) {
  return {
    ...buildOptions,
    loader: {
      ...buildOptions.loader,
      ".svg": "dataurl",
    },
  };
};
