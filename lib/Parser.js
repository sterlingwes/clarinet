var c = require('./constants')
var MAX_BUFFER_LENGTH = c.MAX_BUFFER_LENGTH
var STATE = c.STATE
var INFO = c.INFO
var DEBUG = c.DEBUG

var stringTokenPattern = /[\\"\n]/g
var buffers = [ 'textNode', 'numberNode' ]

function CParser (opt) {
  if (!(this instanceof CParser)) return new CParser(opt)

  var parser = this
  clearBuffers(parser)
  parser.bufferCheckPosition = MAX_BUFFER_LENGTH
  parser.q = parser.c = parser.p = ''
  parser.opt = opt || {}
  parser.closed = parser.closedRoot = parser.sawRoot = false
  parser.tag = parser.error = null
  parser.state = STATE.BEGIN
  parser.stack = []
  // mostly just for error reporting
  parser.position = parser.column = 0
  parser.line = 1
  parser.slashed = false
  parser.unicodeI = 0
  parser.unicodeS = null
  parser.depth = 0
  emit(parser, 'onready')
}

CParser.prototype = {
  end: function () { end(this) },
  write: write,
  resume: function () { this.error = null; return this },
  close: function () { return this.write(null) },
  clearBuffers: function () { return clearBuffers(this) }
}

module.exports = CParser

function end (parser) {
  if (parser.state !== STATE.VALUE || parser.depth !== 0) {
    error(parser, 'Unexpected end')
  }

  closeValue(parser)
  parser.c = ''
  parser.closed = true
  emit(parser, 'onend')
  CParser.call(parser, parser.opt)
  return parser
}

function emit (parser, event, data) {
  if (INFO) console.log('-- emit', event, data)
  if (parser[event]) parser[event](data)
}

function emitNode (parser, event, data) {
  closeValue(parser)
  emit(parser, event, data)
}

function closeValue (parser, event) {
  parser.textNode = textopts(parser.opt, parser.textNode)
  if (parser.textNode) {
    emit(parser, (event || 'onvalue'), parser.textNode)
  }
  parser.textNode = ''
}

function closeNumber (parser) {
  if (parser.numberNode) {
    emit(parser, 'onvalue', parseFloat(parser.numberNode))
  }
  parser.numberNode = ''
}

function textopts (opt, text) {
  if (opt.trim) text = text.trim()
  if (opt.normalize) text = text.replace(/\s+/g, ' ')
  return text
}

function error (parser, er) {
  closeValue(parser)
  er += '\nLine: ' + parser.line +
  '\nColumn: ' + parser.column +
  '\nChar: ' + parser.c
  er = new Error(er)
  parser.error = er
  emit(parser, 'onerror', er)
  return parser
}

function write (chunk) {
  var parser = this
  if (this.error) throw this.error
  if (parser.closed) {
    return error(parser, 'Cannot write after close. Assign an onready handler.')
  }
  if (chunk === null) return end(parser)

  var i = 0
  var c = chunk[0]
  var p = parser.p

  if (DEBUG) console.log('write -> [' + chunk + ']')
  while (c) {
    p = c
    parser.c = c = chunk.charAt(i++)
    // if chunk doesnt have next, like streaming char by char
    // this way we need to check if previous is really previous
    // if not we need to reset to what the parser says is the previous
    // from buffer
    if (p !== c) parser.p = p
    else p = parser.p

    if (!c) break

    if (DEBUG) console.log(i, c, STATE[parser.state])
    parser.position++
    if (c === '\n') {
      parser.line++
      parser.column = 0
    } else parser.column++
    switch (parser.state) {
      case STATE.BEGIN:
        if (c === '{') parser.state = STATE.OPEN_OBJECT
        else if (c === '[') parser.state = STATE.OPEN_ARRAY
        else if (c !== '\r' && c !== '\n' && c !== ' ' && c !== '\t') {
          error(parser, 'Non-whitespace before {[.')
        }
        continue

      case STATE.OPEN_KEY:
      case STATE.OPEN_OBJECT:
        if (c === '\r' || c === '\n' || c === ' ' || c === '\t') continue
        if (parser.state === STATE.OPEN_KEY) parser.stack.push(STATE.CLOSE_KEY)
        else {
          if (c === '}') {
            emit(parser, 'onopenobject')
            this.depth++
            emit(parser, 'oncloseobject')
            this.depth--
            parser.state = parser.stack.pop() || STATE.VALUE
            continue
          } else parser.stack.push(STATE.CLOSE_OBJECT)
        }
        if (c === '"') parser.state = STATE.STRING
        else error(parser, 'Malformed object key should start with "')
        continue

      case STATE.CLOSE_KEY:
      case STATE.CLOSE_OBJECT:
        if (c === '\r' || c === '\n' || c === ' ' || c === '\t') continue

        if (c === ':') {
          if (parser.state === STATE.CLOSE_OBJECT) {
            parser.stack.push(STATE.CLOSE_OBJECT)
            closeValue(parser, 'onopenobject')
            this.depth++
          } else closeValue(parser, 'onkey')
          parser.state = STATE.VALUE
        } else if (c === '}') {
          emitNode(parser, 'oncloseobject')
          this.depth--
          parser.state = parser.stack.pop() || STATE.VALUE
        } else if (c === ',') {
          if (parser.state === STATE.CLOSE_OBJECT) {
            parser.stack.push(STATE.CLOSE_OBJECT)
          }
          closeValue(parser)
          parser.state = STATE.OPEN_KEY
        } else error(parser, 'Bad object')
        continue

      case STATE.OPEN_ARRAY: // after an array there always a value
      case STATE.VALUE:
        if (c === '\r' || c === '\n' || c === ' ' || c === '\t') continue
        if (parser.state === STATE.OPEN_ARRAY) {
          emit(parser, 'onopenarray')
          this.depth++
          parser.state = STATE.VALUE
          if (c === ']') {
            emit(parser, 'onclosearray')
            this.depth--
            parser.state = parser.stack.pop() || STATE.VALUE
            continue
          } else {
            parser.stack.push(STATE.CLOSE_ARRAY)
          }
        }
        if (c === '"') parser.state = STATE.STRING
        else if (c === '{') parser.state = STATE.OPEN_OBJECT
        else if (c === '[') parser.state = STATE.OPEN_ARRAY
        else if (c === 't') parser.state = STATE.TRUE
        else if (c === 'f') parser.state = STATE.FALSE
        else if (c === 'n') parser.state = STATE.NULL
        else if (c === '-') { // keep and continue
          parser.numberNode += c
        } else if (c === '0') {
          parser.numberNode += c
          parser.state = STATE.NUMBER_DIGIT
        } else if ('123456789'.indexOf(c) !== -1) {
          parser.numberNode += c
          parser.state = STATE.NUMBER_DIGIT
        } else error(parser, 'Bad value')
        continue

      case STATE.CLOSE_ARRAY:
        if (c === ',') {
          parser.stack.push(STATE.CLOSE_ARRAY)
          closeValue(parser, 'onvalue')
          parser.state = STATE.VALUE
        } else if (c === ']') {
          emitNode(parser, 'onclosearray')
          this.depth--
          parser.state = parser.stack.pop() || STATE.VALUE
        } else if (c === '\r' || c === '\n' || c === ' ' || c === '\t') {
          continue
        } else {
          error(parser, 'Bad array')
        }
        continue

      case STATE.STRING:
        // thanks thejh, this is an about 50% performance improvement.
        var starti = i - 1
        var slashed = parser.slashed
        var unicodeI = parser.unicodeI

        STRING_BIGLOOP: while (true) { // eslint-disable-line
          if (DEBUG) {
            console.log(i, c, STATE[parser.state], slashed)
          }
          // zero means "no unicode active". 1-4 mean "parse some more". end after 4.
          while (unicodeI > 0) {
            parser.unicodeS += c
            c = chunk.charAt(i++)
            parser.position++
            if (unicodeI === 4) {
              // TODO this might be slow? well, probably not used too often anyway
              parser.textNode += String.fromCharCode(parseInt(parser.unicodeS, 16))
              unicodeI = 0
              starti = i - 1
            } else {
              unicodeI++
            }
            // we can just break here: no stuff we skipped that still has to be sliced out or so
            if (!c) break STRING_BIGLOOP  // eslint-disable-line
          }
          if (c === '"' && !slashed) {
            parser.state = parser.stack.pop() || STATE.VALUE
            parser.textNode += chunk.substring(starti, i - 1)
            parser.position += i - 1 - starti
            if (!parser.textNode) {
              emit(parser, 'onvalue', '')
            }
            break
          }
          if (c === '\\' && !slashed) {
            slashed = true
            parser.textNode += chunk.substring(starti, i - 1)
            parser.position += i - 1 - starti
            c = chunk.charAt(i++)
            parser.position++
            if (!c) break
          }
          if (slashed) {
            slashed = false
            if (c === 'n') {
              parser.textNode += '\n'
            } else if (c === 'r') {
              parser.textNode += '\r'
            } else if (c === 't') {
              parser.textNode += '\t'
            } else if (c === 'f') {
              parser.textNode += '\f'
            } else if (c === 'b') {
              parser.textNode += '\b'
            } else if (c === 'u') {
              // \uxxxx. meh!
              unicodeI = 1
              parser.unicodeS = ''
            } else {
              parser.textNode += c
            }
            c = chunk.charAt(i++)
            parser.position++
            starti = i - 1
            if (!c) break
            else continue
          }

          stringTokenPattern.lastIndex = i
          var reResult = stringTokenPattern.exec(chunk)
          if (reResult === null) {
            i = chunk.length + 1
            parser.textNode += chunk.substring(starti, i - 1)
            parser.position += i - 1 - starti
            break
          }
          i = reResult.index + 1
          c = chunk.charAt(reResult.index)
          if (!c) {
            parser.textNode += chunk.substring(starti, i - 1)
            parser.position += i - 1 - starti
            break
          }
        }
        parser.slashed = slashed
        parser.unicodeI = unicodeI
        continue

      case STATE.TRUE:
        if (c === '') continue // strange buffers
        if (c === 'r') parser.state = STATE.TRUE2
        else error(parser, 'Invalid true started with t' + c)
        continue

      case STATE.TRUE2:
        if (c === '') continue
        if (c === 'u') parser.state = STATE.TRUE3
        else error(parser, 'Invalid true started with tr' + c)
        continue

      case STATE.TRUE3:
        if (c === '') continue
        if (c === 'e') {
          emit(parser, 'onvalue', true)
          parser.state = parser.stack.pop() || STATE.VALUE
        } else error(parser, 'Invalid true started with tru' + c)
        continue

      case STATE.FALSE:
        if (c === '') continue
        if (c === 'a') parser.state = STATE.FALSE2
        else error(parser, 'Invalid false started with f' + c)
        continue

      case STATE.FALSE2:
        if (c === '') continue
        if (c === 'l') parser.state = STATE.FALSE3
        else error(parser, 'Invalid false started with fa' + c)
        continue

      case STATE.FALSE3:
        if (c === '') continue
        if (c === 's') parser.state = STATE.FALSE4
        else error(parser, 'Invalid false started with fal' + c)
        continue

      case STATE.FALSE4:
        if (c === '') continue
        if (c === 'e') {
          emit(parser, 'onvalue', false)
          parser.state = parser.stack.pop() || STATE.VALUE
        } else error(parser, 'Invalid false started with fals' + c)
        continue

      case STATE.NULL:
        if (c === '') continue
        if (c === 'u') parser.state = STATE.NULL2
        else error(parser, 'Invalid null started with n' + c)
        continue

      case STATE.NULL2:
        if (c === '') continue
        if (c === 'l') parser.state = STATE.NULL3
        else error(parser, 'Invalid null started with nu' + c)
        continue

      case STATE.NULL3:
        if (c === '') continue
        if (c === 'l') {
          emit(parser, 'onvalue', null)
          parser.state = parser.stack.pop() || STATE.VALUE
        } else error(parser, 'Invalid null started with nul' + c)
        continue

      case STATE.NUMBER_DECIMAL_POINT:
        if (c === '.') {
          parser.numberNode += c
          parser.state = STATE.NUMBER_DIGIT
        } else error(parser, 'Leading zero not followed by .')
        continue

      case STATE.NUMBER_DIGIT:
        if ('0123456789'.indexOf(c) !== -1) parser.numberNode += c
        else if (c === '.') {
          if (parser.numberNode.indexOf('.') !== -1) {
            error(parser, 'Invalid number has two dots')
          }
          parser.numberNode += c
        } else if (c === 'e' || c === 'E') {
          if (parser.numberNode.indexOf('e') !== -1 || parser.numberNode.indexOf('E') !== -1) {
            error(parser, 'Invalid number has two exponential')
          }
          parser.numberNode += c
        } else if (c === '+' || c === '-') {
          if (!(p === 'e' || p === 'E')) {
            error(parser, 'Invalid symbol in number')
          }
          parser.numberNode += c
        } else {
          closeNumber(parser)
          i-- // go back one
          parser.state = parser.stack.pop() || STATE.VALUE
        }
        continue

      default:
        error(parser, 'Unknown state: ' + parser.state)
    }
  }
  if (parser.position >= parser.bufferCheckPosition) {
    checkBufferLength(parser)
  }
  return parser
}

function checkBufferLength (parser) {
  var maxAllowed = Math.max(MAX_BUFFER_LENGTH, 10)
  var maxActual = 0

  for (var i = 0, l = buffers.length; i < l; i++) {
    var len = parser[buffers[i]].length
    if (len > maxAllowed) {
      switch (buffers[i]) {
        case 'text':
          // never hit...? should throw.
          closeText(parser) // eslint-disable-line
          break

        default:
          error(parser, 'Max buffer length exceeded: ' + buffers[i])
      }
    }
    maxActual = Math.max(maxActual, len)
  }
  parser.bufferCheckPosition = (MAX_BUFFER_LENGTH - maxActual) + parser.position
}

function clearBuffers (parser) {
  for (var i = 0, l = buffers.length; i < l; i++) {
    parser[buffers[i]] = ''
  }
}
