module.exports = () => {
  const isDev = process.env.NODE_ENV === 'development'

  return {
    devtool: isDev ? 'inline-source-map' : false,
    optimization: {
      minimize: !isDev
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
    },
    output: {
      filename: 'bundle.js'
    }
  }
}