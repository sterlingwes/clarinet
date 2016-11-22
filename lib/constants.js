var env = process.env

var S = 0

module.exports = {
  MAX_BUFFER_LENGTH: 64 * 1024,
  DEBUG: env.CDEBUG === 'debug',
  INFO: (env.CDEBUG === 'debug' || env.CDEBUG === 'info'),
  EVENTS: [
    'value',
    'string',
    'key',
    'openobject',
    'closeobject',
    'openarray',
    'closearray',
    'error',
    'end',
    'ready'
  ],
  STATE: {
    BEGIN: S++,
    VALUE: S++,                 // general stuff
    OPEN_OBJECT: S++,           // {
    CLOSE_OBJECT: S++,          // }
    OPEN_ARRAY: S++,            // [
    CLOSE_ARRAY: S++,           // ]
    TEXT_ESCAPE: S++,           // \ stuff
    STRING: S++,                // ""
    BACKSLASH: S++,
    END: S++,                   // No more stack
    OPEN_KEY: S++,              // , "a"
    CLOSE_KEY: S++,             // :
    TRUE: S++,                  // r
    TRUE2: S++,                 // u
    TRUE3: S++,                 // e
    FALSE: S++,                 // a
    FALSE2: S++,                // l
    FALSE3: S++,                // s
    FALSE4: S++,                // e
    NULL: S++,                  // u
    NULL2: S++,                 // l
    NULL3: S++,                 // l
    NUMBER_DECIMAL_POINT: S++,  // .
    NUMBER_DIGIT: S++           // [0-9]
  }
}
