var webpack = require('webpack')
var path = require('path')

module.exports = {
  entry: './lib/index.js',
  output: {
    path: path.join(__dirname, 'build'),
    filename: 'clarinet.min.js'
  },
  plugins: [
    new webpack.optimize.UglifyJsPlugin()
  ]
}
