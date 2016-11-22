
  // for (var s_ in clarinet.STATE) clarinet.STATE[clarinet.STATE[s_]] = s_;

  // // switcharoo
  // S = clarinet.STATE;

var Parser = require('./Parser')
var Stream = require('./Stream')

window.clarinet = module.exports = {
  parser: function (opt) { return new Parser(opt) },
  createStream: function (opt) { return new Stream(opt) }
}
