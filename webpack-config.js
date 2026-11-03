module.exports = () => {
  const isDev = process.env.NODE_ENV === 'development'
  const prod = !isDev

  return {
    mode: prod ? 'production' : 'development',
    devtool: isDev ? 'inline-source-map' : false,
    optimization: {
      minimize: prod,
      usedExports: prod
    },
    module: {
      rules: [
        {
          // includes, excludes are in tsconfig.json
          test: /\.ts?$/,
          exclude: /node_modules/,
          use: 'ts-loader'
        }
      ]
    }
  }
}
