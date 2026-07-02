module.exports = function orbitAppBabelConfig(api) {
  api.cache(true);

  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@": "./src"
          },
          extensions: [".ts", ".tsx", ".js", ".jsx", ".json"]
        }
      ]
    ]
  };
};
