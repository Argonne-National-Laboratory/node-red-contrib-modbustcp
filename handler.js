
var Put = require('put');
var util = require('util');

var log = function (msg) {  };

exports.setLogger = function (logger) {
    log = logger;
};

exports.ExceptionMessage = {

    0x01 : 'ILLEGAL FUNCTION',
    0x02 : 'ILLEGAL DATA ADDRESS',
    0x03 : 'ILLEGAL DATA VALE',
    0x04 : 'SLAVE DEVICE FAILURE',
    0x05 : 'ACKNOWLEDGE',
    0x06 : 'SLAVE DEVICE BUSY',
    0x08 : 'MEMORY PARITY ERROR',
    0x0A : 'GATEWAY PATH UNAVAILABLE',
    0x0B : 'GATEWAY TARGET DEVICE FAILED TO RESPOND'

};
// See protocol details for each function code: 
// http://www.simplymodbus.ca/FC03.htm
// TODO function codes					TEST
// 										readDiscreteInputs	: 2
// writeMultipleCoils	: 15
// 										readHoldingRegisters	: 3
// writeMultipleRegisters: 16
//
// MORE TODO list
// readWriteMultipleRegisters: 23
// maskWriteRegister	: 22
// readFifoQueue 		: 24
// readFileRecord		: 20
// writeFileRecord		: 21
// DIAGNOSTICS
// readExceptionStatus	: 7
// diagnostic			: 8
// getComEventCounter	: 11
// getComEventLog		: 12
// reportSlaceID		: 17
// readDeviceIdentification : 43
// encapsulatedInterfaceTransport : 43 ??

exports.FC = {
    readCoils : 1,
    readDiscreteInputs : 2,
    readHoldingRegisters : 3,
    readInputRegister : 4,
    writeSingleCoil : 5,
    writeSingleRegister : 6,
    writeMultipleCoils : 15,
    writeMultipleRegisters : 16
};

exports.Server = { };

/**
 *  Server response handler. Put new function call
 *  responses in here. The parameters for the function
 *  are defined by the handle that has been delivered to 
 *  the server objects addHandler function.
 */
exports.Server.ResponseHandler = {
    // read coils
    1 : function (register) {
            log("Server response: read coils");
            var flr = Math.floor(register.length / 8),
                len = register.length % 8 > 0 ? flr + 1 : flr,
                res = Put().word8(1).word8(len);
            var cntr = 0;
            for (var i = 0; i < len; i += 1 ) {
                var cur = 0;
                for (var j = 0; j < 8; j += 1) {
                    var h = 1 << j;

                    if (register[cntr]) {
                        cur += h;
                    }
                    cntr += 1;
                }
            res.word8(cur);
        }
        return res.buffer();
    },
     // read holding registers
    3 : function (register) {
            log("Server response: read holding registers");
            var res = Put().word8(4).word8(register.length * 2);
            for (var i = 0; i < register.length; i += 1) {
                res.word16be(register[i]);
            }
            return res.buffer();
    },
    // read input register
    4 : function (register) {
            log("Server response: read input register");
            var res = Put().word8(4).word8(register.length * 2);
            for (var i = 0; i < register.length; i += 1) {
                res.word16be(register[i]);
            }
            return res.buffer();
    },
    5 : function (outputAddress, outputValue) {
            var res = Put().word8(5).word16be(outputAddress)
                        .word16be(outputValue?0xFF00:0x0000).buffer();
            return res;
        },
    6 : function (outputAddress, outputValue) {
            var res = Put().word8(5).word16be(outputAddress).word16be(outputValue).buffer();
            return res;
        }
};

/**
 *  The RequestHandler on the server side. The
 *  functions convert the incoming pdu to a 
 *  usuable set of parameter that can be handled
 *  from the server objects user handler (see addHandler 
 *  function in the servers api).
 */
exports.Server.RequestHandler = {
    // ReadCoils
    1 : function (pdu) {
            var fc              = pdu.readUInt8(0), // never used, should just be an example
                startAddress    = pdu.readUInt16BE(1),
                quantity        = pdu.readUInt16BE(3),
                param           = [ startAddress, quantity ];
            return param;
        },
    // ReadInputCoil TODO internally
    2 : function (pdu) {
            var startAddress    = pdu.readUInt16BE(1),
                quantity        = pdu.readUInt16BE(3),
                param           = [ startAddress, quantity ];
            return param;
    },
    // ReadHoldingRegisters TODO internally
    3 : function (pdu) {
            var startAddress    = pdu.readUInt16BE(1),
                quantity        = pdu.readUInt16BE(3),
                param           = [ startAddress, quantity ];
            return param;
    },
    // ReadInputRegister
    4 : function (pdu) {
            var startAddress    = pdu.readUInt16BE(1),
                quantity        = pdu.readUInt16BE(3),
                param           = [ startAddress, quantity ];
            return param;
    },
    5 : function (pdu) {
            var outputAddress   = pdu.readUInt16BE(1),
                outputValue     = pdu.readUInt16BE(3),
                boolValue       = outputValue===0xFF00?true:outputValue===0x0000?false:undefined,
                param           = [ outputAddress, boolValue ];
            return param;
        },
    6 : function (pdu) {
            var outputAddress   = pdu.readUInt16BE(1),
                outputValue     = pdu.readUInt16BE(3),
                param           = [ outputAddress, outputValue ];
            return param; 
        }
};

exports.Client = { };
/**
 *  The response handler for the client
 *  converts the pdu's delivered from the server
 *  into parameters for the users callback function.
 */
exports.Client.ResponseHandler = {
    // ReadCoils
    // This function code is used to read from 1 to 2000(0x7d0) contiguous status
    // of coils in a remote device. The Request PDU specifies the starting
    // address, ie. the address of the first coil specified, and the number of
    // coils. In the PDU Coils are addressed starting at zero. Therefore coils
    // numbered 1-16 are addressed as 0-15.

    // The coils in the response message are packed as one coil per bit of
    // the data field. Status is indicated as 1= ON and 0= OFF. The LSB of the
    // first data byte contains the output addressed in the query. The other
    // coils follow toward the high order end of this byte, and from low order
    // to high order in subsequent bytes.

    // If the returned output quantity is not a multiple of eight, the
    // remaining bits in the final data byte will be padded with zeros
    // (toward the high order end of the byte). The Byte Count field specifies
    // the quantity of complete bytes of data.
    1 : function (pdu, cb) {
            console.log("Client handling: read coils response.");
            var fc          = pdu.readUInt8(0),
                byteCount   = pdu.readUInt8(1),
                bitCount    = byteCount * 8;
            var resp = {
                    fc          : fc,
                    byteCount   : byteCount,
                    coils       : [] 
                };
            var cntr = 0;
            for (var i = 0; i < byteCount; i+=1) {
                var h = 1, cur = pdu.readUInt8(2 + i);
                for (var j = 0; j < 8; j+=1) {
                    resp.coils[cntr] = (cur & h) > 0 ;
                    h = h << 1;
                    cntr += 1;
                } 
            }
            cb(resp);
        },
    // ReadCoils
    // This function code is used to read from 1 to 2000(0x7d0) contiguous status
    // of discrete inputs in a remote device. The Request PDU specifies the
    // starting address, ie the address of the first input specified, and the
    // number of inputs. In the PDU Discrete Inputs are addressed starting at
    // zero. Therefore Discrete inputs numbered 1-16 are addressed as 0-15.

    // The discrete inputs in the response message are packed as one input per
    // bit of the data field. Status is indicated as 1= ON; 0= OFF. The LSB of
    // the first data byte contains the input addressed in the query. The other
    // inputs follow toward the high order end of this byte, and from low order
    // to high order in subsequent bytes.

    // If the returned input quantity is not a multiple of eight, the
    // remaining bits in the final data byte will be padded with zeros
    // (toward the high order end of the byte). The Byte Count field specifies
    // the quantity of complete bytes of data.
    2 :	function (pdu, cb) {
            console.log("Client handling: read discrete inputs response.");
            var fc          = pdu.readUInt8(0),
                byteCount   = pdu.readUInt8(1),
                bitCount    = byteCount * 8;
            var resp = {
                    fc          : fc,
                    byteCount   : byteCount,
                    coils       : [] 
                };
            var cntr = 0;
            for (var i = 0; i < byteCount; i+=1) {
                var h = 1, cur = pdu.readUInt8(2 + i);
                for (var j = 0; j < 8; j+=1) {
                    resp.coils[cntr] = (cur & h) > 0 ;
                    h = h << 1;
                    cntr += 1;
                } 
            }
            cb(resp);
        },
        // read holding registers TODO TEST
        // This function code is used to read the contents of a contiguous block
        // of holding registers in a remote device. The Request PDU specifies the
        // starting register address and the number of registers. In the PDU
        // Registers are addressed starting at zero. Therefore registers numbered
        // 1-16 are addressed as 0-15.
    3 : function (pdu, cb) {
            console.log("handling read holding registers response.");
            var fc          = pdu.readUInt8(0),
                byteCount   = pdu.readUInt8(1),
                bitCount    = byteCount * 8;
            var resp = {
                    fc          : fc,
                    byteCount   : byteCount,
                    registers       : [] 
            };
            var registerCount = byteCount / 2;
            // TODO 1 <= byteCount <= 0x7d // or registerCount sanity check !!
            for (var i = 0; i < registerCount; i += 1) {
                resp.registers.push(pdu.readUInt16BE(2 + (i * 2)));
            }
            cb(resp);
    },
    // ReadInputRegister
    4 : function (pdu, cb) {
            console.log("handling read input register response.");
            console.log("0:"+pdu.readUInt8(0)); // FC
            console.log("1:"+pdu.readUInt8(1)); // Byte count
            
            var fc          = pdu.readUInt8(0),
                byteCount   = pdu.readUInt8(1);
            var resp = {
                fc          : fc,
                byteCount   : byteCount,
                register    : []
            };
            var registerCount = byteCount / 2;
            for (var i = 0; i < registerCount; i += 1) {
                resp.register.push(pdu.readUInt16BE(2 + (i * 2)));
            }
            cb(resp);
        },
    5 : function (pdu, cb) {
            console.log("Client handling: write single coil response.");
            console.log(pdu);
            console.log(cb);
            var fc              = pdu.readUInt8(0),
                outputAddress   = pdu.readUInt16BE(1),
                outputValue     = pdu.readUInt16BE(3);
            console.log(fc);
            console.log(outputAddress);
            console.log(outputValue);
            var resp = {
                fc              : fc,
                outputAddress   : outputAddress,
                outputValue     : outputValue // outputValue === 0x0000?true:outputValue===0xFF00?true:undefined
            };
            console.log(resp);
            cb(resp);
        },
    6 : function (pdu, cb) {
            console.log("handling write single register response.");
            console.log(pdu);
            console.log(cb);
            var fc              = pdu.readUInt8(0),
                outputAddress   = pdu.readUInt16BE(1),
                outputValue     = pdu.readUInt16BE(3);
            console.log(fc);
            console.log(outputAddress);
            console.log(outputValue);
            var resp = {
                fc              : fc,
                outputAddress   : outputAddress,
                outputValue     : outputValue // outputValue === 0x0000?true:outputValue===0xFF00?true:undefined
            };
            console.log(resp);
            cb(resp);
        },
    15 : function (pdu, cb) {
            console.log("TODO: handling write multiple coils response.");
            console.log(pdu);
            console.log(cb);
            var fc              = pdu.readUInt8(0),
                outputAddress   = pdu.readUInt16BE(1),
                outputValue     = pdu.readUInt16BE(3);
            console.log(fc);
            console.log(outputAddress);
            console.log(outputValue);
            var resp = {
                fc              : fc,
                outputAddress   : outputAddress,
                outputValue     : outputValue // outputValue === 0x0000?true:outputValue===0xFF00?true:undefined
            };
            console.log(resp);
            cb(resp);
        },
    // Preset Multiple Registers (FC=16)
    16 : function (pdu, cb) {
            console.log("TODO: handling write multiple coils response.");
/*
            Request:
            This command is writing the contents of two analog output holding registers # 40002 & 40003 to the slave device with address 17.
            11 10 0001 0002 04 000A 0102 C6F0
            11: The Slave Address (17 = 11 hex)
            10: The Function Code (Preset Multiple Registers 16 = 10 hex)
            0001: The Data Address of the first register. (# 40002 - 40001 = 1 )
            0002: The number of registers to write
            04: The number of data bytes to follow (2 registers x 2 bytes each = 4 bytes)
            000A: The value to write to register 40002
            0102: The value to write to register 40003
            C6F0: The CRC (cyclic redundancy check) for error checking.
*/
            var fc          = pdu.readUInt8(0),
            registerAddress = pdu.readUInt16BE(1),
            registerValue   = pdu.readUInt16BE(3);

/*
            Response:
            11 10 0001 0002 1298
            11: The Slave Address (17 = 11 hex)
            10: The Function Code (Preset Multiple Registers 16 = 10 hex)
            0001: The Data Address of the first register. (# 40002 - 40001 = 1 )
            0002: The number of registers written.
            1298: The CRC (cyclic redundancy check) for error checking.
*/
            var resp = {
                fc              : fc,
                registerAddress : registerAddress,
                registerValue   : registerValue
            };
            cb(resp);
        }
};


