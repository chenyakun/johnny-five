/*

  This is a port by Rebecca Murphey of the LedControl library.
  The license of the original library is as follows:

  LedControl.cpp - A library for controling Leds with a MAX7219/MAX7221
  Copyright (c) 2007 Eberhard Fahle

  Permission is hereby granted, free of charge, to any person
  obtaining a copy of this software and associated documentation
  files (the "Software"), to deal in the Software without
  restriction, including without limitation the rights to use,
  copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the
  Software is furnished to do so, subject to the following
  conditions:

  This permission notice shall be included in all copies or
  substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
  OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
  NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
  HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
  WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
  FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
  OTHER DEALINGS IN THE SOFTWARE.

 */

var Board = require("../lib/board.js");

// Led instance private data
var priv = new Map();

function LedControl(opts) {

  // Initialize a Device instance on a Board
  Board.Device.call(
    this, opts = Board.Options(opts)
  );

  this.pins = {
    data: opts.pins.data,
    clock: opts.pins.clock,
    cs: opts.pins.cs || opts.pins.latch
  };

  /*
    Here's an example of multiple devices:
    http://tronixstuff.com/2013/10/11/tutorial-arduino-max7219-led-display-driver-ic/
   */
  var devices = opts.devices || 1;

  // NOTE: Currently unused, these will form
  // the basis for the `setup` constructor option
  var setup = Object.assign({}, LedControl.DEFAULTS, opts.setup || {});
  var keys = Object.keys(setup);

  // TODO: Store this in priv Map.
  this.status = [];

  for (var i = 0; i < 64; i++) {
    this.status[i] = 0x00;
  }

  ["data", "clock", "cs"].forEach(function(pin) {
    this.io.pinMode(this.pins[pin], this.io.MODES.OUTPUT);
  }, this);

  var state = {
    devices: devices,
    isMatrix: !!opts.isMatrix
  };

  Object.defineProperties(this, {
    devices: {
      get: function() {
        return state.devices;
      }
    },
    isMatrix: {
      get: function() {
        return state.isMatrix;
      }
    }
  });

  priv.set(this, state);


  for (var device = 0; device < devices; device++) {

    /*
      TODO: Add support for custom initialization

      An example of initialization, added to the constructor options:

        setup: {
          // OPCODE: VALUE
          DECODING: 0,
          BRIGHTNESS: 3,
          SCANLIMIT: 7,
          SHUTDOWN: 1,
          DISPLAYTEST: 1
        },


      In context:

        var lc = new five.LedControl({
          pins: {
            data: 2,
            clock: 3,
            cs: 4
          },
          setup: {
            DECODING: 0,
            BRIGHTNESS: 3,
            SCANLIMIT: 7,
            SHUTDOWN: 1,
            DISPLAYTEST: 1
          },
          isMatrix: true
        });


      The custom initializers are invoked as:

        keys.forEach(function(key) {
          this.send(device, LedControl.OP[key], setup[key]);
        }, this);


      I might be missing something obvious, but this isn't working.
      Using the same options shown below, the above should behave exactly the
      same way that the code below does, but that's not the case. The result is
      all leds in the matrix are lit and none can be cleared.
     */



    this.send(device, LedControl.OP.DECODING, 0);
    this.send(device, LedControl.OP.BRIGHTNESS, 3);
    this.send(device, LedControl.OP.SCANLIMIT, 7);
    this.send(device, LedControl.OP.SHUTDOWN, 1);
    this.send(device, LedControl.OP.DISPLAYTEST, 0);

    this.clear(device);
    this.off(device);
  }
}


LedControl.prototype.on = function(addr) {
  return this.shutdown(addr |= 0, false);
};

LedControl.prototype.off = function(addr) {
  return this.shutdown(addr |= 0, true);
};

LedControl.prototype.shutdown = function(addr, status) {
  status = +status;

  // shuts off if status == true
  if (addr < this.devices) {
    this.send(
      addr, LedControl.OP.SHUTDOWN, status ^= 1
    );
  }
  return this;
};

LedControl.prototype.scanLimit = function(addr, limit) {
  if (addr < this.devices) {
    this.send(
      addr, LedControl.OP.SCANLIMIT, limit
    );
  }
  return this;
};

LedControl.prototype.brightness = function(addr, val) {
  if (addr < this.devices) {
    this.send(
      addr, LedControl.OP.INTENSITY, val
    );
  }
  return this;
};

LedControl.prototype.clear = function(addr) {
  addr |= 0;

  var i, offset;

  offset = addr * 8;

  for (i = 0; i < 8; i++) {
    this.status[offset + i] = 0;
    this.send(addr, i + 1, 0);
  }
};


/**
 * led or setLed Set the status of a single Led.
 *
 * @param {Number} addr Address of Led
 * @param {Number} row Row number of Led (0-7)
 * @param {Number} column Column number of Led (0-7)
 * @param {Boolean} state [ true: on, false: off ] [ 1, 0 ]
 *
 */
LedControl.prototype.led = function(addr, row, col, state) {
  var offset, val;

  if (addr < this.devices) {
    offset = addr * 8;
    val = 0x80 >> col;

    if (state) {
      this.status[offset + row] = this.status[offset + row] | val;
    } else {
      val = ~val;
      this.status[offset + row] = this.status[offset + row] & val;
    }
    this.send(addr, row + 1, this.status[offset + row]);
  }
  return this;
};

LedControl.prototype.setLed = LedControl.prototype.led;

/**
 * row Update an entire row with an 8 bit value
 * @param  {Number} addr Device address
 * @param  {Number} row  0 indexed row number 0-7
 * @param  {Number} val  8-bit value 0-255
 * @return {LedControl}
 */
LedControl.prototype.row = function(addr, row, val /* 0 - 255 */ ) {
  var offset = addr * 8;

  if (addr < this.devices) {
    this.status[offset + row] = val;
    this.send(addr, row + 1, this.status[offset + row]);
  }
  return this;
};

/**
 * column Update an entire column with an 8 bit value
 * @param  {Number} addr Device address
 * @param  {Number} col  0 indexed col number 0-7
 * @param  {Number} val  8-bit value 0-255
 * @return {LedControl}
 */
LedControl.prototype.column = function(addr, col, value /* 0 - 255 */ ) {
  var row, val;

  if (addr < this.devices) {
    for (row = 0; row < 8; row++) {
      val = value >> (7 - row);
      val = val & 0x01;
      this.led(addr, row, col, val);
    }
  }
  return this;
};

LedControl.prototype.digit = function(addr, digit, val, dp) {
  var offset, v;

  if (addr < this.devices) {
    offset = addr * 8;

    v = LedControl.CHAR_TABLE[val > 127 ? 32 : val];

    if (dp) {
      v = v | 0x80;
    }

    this.status[offset + digit] = v;
    this.send(addr, digit + 1, v);
  }
  return this;
};

LedControl.prototype.char = function(addr, digit, val, dp) {
  // in matrix mode, this takes two arguments:
  // addr and the character to display
  var character;

  if (this.isMatrix) {
    character = digit;

    LedControl.MATRIX_CHARS[character].forEach(function(rowByte, idx) {
      process.nextTick(function() {
        this.row(addr, idx, rowByte);
      }.bind(this));
    }, this);
  } else {

    // in seven-segment mode, this takes four arguments, which
    // are just passed through to digit
    this.digit(addr, digit, val, dp);
  }
  return this;
};


// TODO:
// Implement smart "print" function that parses and prints
// using the existing api (consolidates function calls)
LedControl.prototype.print = function() {

};

LedControl.prototype.send = function(addr, opcode, data) {
  var offset, maxBytes, spiData, i, j;

  offset = addr * 2;
  maxBytes = this.devices * 2;
  spiData = [];

  for (i = 0; i < maxBytes; i++) {
    spiData[i] = 0;
  }

  spiData[offset + 1] = opcode;
  spiData[offset] = data;

  this.board.digitalWrite(this.pins.cs, this.io.LOW);

  for (j = maxBytes; j > 0; j--) {
    this.board.shiftOut(this.pins.data, this.pins.clock, spiData[j - 1]);
  }

  this.board.digitalWrite(this.pins.cs, this.io.HIGH);

  return this;
};

// NOTE: Currently unused, these will form
// the basis for the `setup` constructor option
LedControl.DEFAULTS = {
  DECODING: 0x00,
  BRIGHTNESS: 0x03,
  SCANLIMIT: 0x07,
  SHUTDOWN: 0x01,
  DISPLAYTEST: 0x00
};

Object.freeze(LedControl.DEFAULTS);

LedControl.OP = {};

LedControl.OP.NOOP = 0x00;

LedControl.OP.DIGIT0 = 0x01;
LedControl.OP.DIGIT1 = 0x02;
LedControl.OP.DIGIT2 = 0x03;
LedControl.OP.DIGIT3 = 0x04;
LedControl.OP.DIGIT4 = 0x05;
LedControl.OP.DIGIT5 = 0x06;
LedControl.OP.DIGIT6 = 0x07;
LedControl.OP.DIGIT7 = 0x08;

LedControl.OP.DECODEMODE = 0x09;
LedControl.OP.INTENSITY = 0x0a;
LedControl.OP.SCANLIMIT = 0x0b;
LedControl.OP.SHUTDOWN = 0x0c;
LedControl.OP.DISPLAYTEST = 0x0f;

// Aliases
LedControl.OP.BRIGHTNESS = LedControl.OP.INTENSITY;
LedControl.OP.DECODING = LedControl.OP.DECODEMODE;
LedControl.OP.DISPLAY = LedControl.OP.DISPLAYTEST;
LedControl.OP.POWERDOWN = LedControl.OP.SHUTDOWN;

Object.freeze(LedControl.OP);

LedControl.CHAR_TABLE = [
  "01111110", // 0
  "00110000", // 1
  "01101101", // 2
  "01111001", // 3
  "00110011", // 4
  "01011011", // 5
  "01011111", // 6
  "01110000", // 7
  "01111111", // 8
  "01111011", // 9
  "01110111", // a
  "00011111", // b
  "00001101", // c
  "00111101", // d
  "01001111", // e
  "01000111", // f
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "10000000",
  "00000001",
  "10000000",
  "00000000",
  "01111110",
  "00110000",
  "01101101",
  "01111001",
  "00110011",
  "01011011",
  "01011111",
  "01110000",
  "01111111",
  "01111011",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "01110111",
  "00011111",
  "00001101",
  "00111101",
  "01001111",
  "01000111",
  "00000000",
  "00110111",
  "00000000",
  "00000000",
  "00000000",
  "00001110",
  "00000000",
  "00000000",
  "00000000",
  "01100111",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00001000",
  "00000000",
  "01110111",
  "00011111",
  "00001101",
  "00111101",
  "01001111",
  "01000111",
  "00000000",
  "00110111",
  "00000000",
  "00000000",
  "00000000",
  "00001110",
  "00000000",
  "00000000",
  "00000000",
  "01100111",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000",
  "00000000"
].map(function(str) {
  return parseInt(str, 2);
});

LedControl.MATRIX_CHARS = {
  "!": [0x04, 0x04, 0x04, 0x04, 0x00, 0x00, 0x04, 0x00],
  '"': [0x0A, 0x0A, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00],
  "#": [0x0A, 0x0A, 0x1F, 0x0A, 0x1F, 0x0A, 0x0A, 0x00],
  "$": [0x04, 0x0F, 0x14, 0x0E, 0x05, 0x1E, 0x04, 0x00],
  "%": [0x18, 0x19, 0x02, 0x04, 0x08, 0x13, 0x03, 0x00],
  "&": [0x0C, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0D, 0x00],
  "'": [0x0C, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02, 0x00],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08, 0x00],
  "*": [0x00, 0x04, 0x15, 0x0E, 0x15, 0x04, 0x00, 0x00],
  "+": [0x00, 0x04, 0x04, 0x1F, 0x04, 0x04, 0x00, 0x00],
  ",": [0x00, 0x00, 0x00, 0x00, 0x0C, 0x04, 0x08, 0x00],
  "-": [0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00, 0x00],
  ".": [0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C, 0x00],
  "/": [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x00, 0x00],
  "0": [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E, 0x00],
  "1": [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E, 0x00],
  "2": [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F, 0x00],
  "3": [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E, 0x00],
  "4": [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02, 0x00],
  "5": [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E, 0x00],
  "6": [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E, 0x00],
  "7": [0x1F, 0x01, 0x02, 0x04, 0x04, 0x04, 0x04, 0x00],
  "8": [0x1E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E, 0x00],
  "9": [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C, 0x00],
  ":": [0x00, 0x0C, 0x0C, 0x00, 0x0C, 0x0C, 0x00, 0x00],
  ";": [0x00, 0x0C, 0x0C, 0x00, 0x0C, 0x04, 0x08, 0x00],
  "<": [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02, 0x00],
  "=": [0x00, 0x00, 0x1F, 0x00, 0x1F, 0x00, 0x00, 0x00],
  ">": [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08, 0x00],
  "?": [0x0E, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04, 0x00],
  "@": [0x0E, 0x11, 0x01, 0x0D, 0x15, 0x15, 0x0E, 0x00],
  "A": [0x0E, 0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x00],
  "B": [0x1E, 0x09, 0x09, 0x0E, 0x09, 0x09, 0x1E, 0x00],
  "C": [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E, 0x00],
  "D": [0x1E, 0x09, 0x09, 0x09, 0x09, 0x09, 0x1E, 0x00],
  "E": [0x1F, 0x10, 0x10, 0x1F, 0x10, 0x10, 0x1F, 0x00],
  "F": [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10, 0x00],
  "G": [0x0E, 0x11, 0x10, 0x13, 0x11, 0x11, 0x0F, 0x00],
  "H": [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11, 0x00],
  "I": [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E, 0x00],
  "J": [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C, 0x00],
  "K": [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11, 0x00],
  "L": [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F, 0x00],
  "M": [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11, 0x00],
  "N": [0x11, 0x19, 0x19, 0x15, 0x13, 0x13, 0x11, 0x00],
  "O": [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E, 0x00],
  "P": [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10, 0x00],
  "Q": [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x1D, 0x00],
  "R": [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11, 0x00],
  "S": [0x0E, 0x11, 0x10, 0x0E, 0x01, 0x11, 0x0E, 0x00],
  "T": [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x00],
  "U": [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E, 0x00],
  "V": [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04, 0x00],
  "W": [0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11, 0x00],
  "X": [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11, 0x00],
  "Y": [0x11, 0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x00],
  "Z": [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F, 0x00],
  "[": [0x0E, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0E, 0x00],
  "\\": [0x00, 0x10, 0x08, 0x04, 0x02, 0x01, 0x00, 0x00],
  "]": [0x0E, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0E, 0x00],
  "^": [0x04, 0x0A, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00],
  "_": [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F, 0x00],
  "`": [0x10, 0x08, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00],
  "a": [0x00, 0x00, 0x0E, 0x01, 0x0F, 0x11, 0x0F, 0x00],
  "b": [0x10, 0x10, 0x16, 0x19, 0x11, 0x11, 0x1E, 0x00],
  "c": [0x00, 0x00, 0x0E, 0x11, 0x10, 0x11, 0x0E, 0x00],
  "d": [0x01, 0x01, 0x0D, 0x13, 0x11, 0x11, 0x0F, 0x00],
  "e": [0x00, 0x00, 0x0E, 0x11, 0x1F, 0x10, 0x0E, 0x00],
  "f": [0x02, 0x05, 0x04, 0x0E, 0x04, 0x04, 0x04, 0x00],
  "g": [0x00, 0x0D, 0x13, 0x13, 0x0D, 0x01, 0x0E, 0x00],
  "h": [0x10, 0x10, 0x16, 0x19, 0x11, 0x11, 0x11, 0x00],
  "i": [0x04, 0x00, 0x0C, 0x04, 0x04, 0x04, 0x0E, 0x00],
  "j": [0x02, 0x00, 0x06, 0x02, 0x02, 0x12, 0x0C, 0x00],
  "k": [0x08, 0x08, 0x09, 0x0A, 0x0C, 0x0A, 0x09, 0x00],
  "l": [0x0C, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E, 0x00],
  "m": [0x00, 0x00, 0x1A, 0x15, 0x15, 0x15, 0x15, 0x00],
  "n": [0x00, 0x00, 0x16, 0x19, 0x11, 0x11, 0x11, 0x00],
  "o": [0x00, 0x00, 0x0E, 0x11, 0x11, 0x11, 0x0E, 0x00],
  "p": [0x00, 0x16, 0x19, 0x19, 0x16, 0x10, 0x10, 0x00],
  "q": [0x00, 0x0D, 0x13, 0x13, 0x0D, 0x01, 0x01, 0x00],
  "r": [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10, 0x00],
  "s": [0x00, 0x00, 0x0F, 0x10, 0x1E, 0x01, 0x1F, 0x00],
  "t": [0x08, 0x08, 0x1C, 0x08, 0x08, 0x09, 0x06, 0x00],
  "u": [0x00, 0x00, 0x12, 0x12, 0x12, 0x12, 0x0D, 0x00],
  "v": [0x00, 0x00, 0x11, 0x11, 0x11, 0x0A, 0x04, 0x00],
  "w": [0x00, 0x00, 0x11, 0x11, 0x15, 0x15, 0x0A, 0x00],
  "x": [0x00, 0x00, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x00],
  "y": [0x00, 0x00, 0x11, 0x11, 0x13, 0x0D, 0x01, 0x0E],
  "z": [0x00, 0x00, 0x1F, 0x02, 0x04, 0x08, 0x1F, 0x00],
  "{": [0x02, 0x04, 0x04, 0x08, 0x04, 0x04, 0x02, 0x00],
  "|": [0x04, 0x04, 0x04, 0x00, 0x04, 0x04, 0x04, 0x00],
  "}": [0x08, 0x04, 0x04, 0x02, 0x04, 0x04, 0x08, 0x00],
  "~": [0x08, 0x15, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00]
};

module.exports = LedControl;
