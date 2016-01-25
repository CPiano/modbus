
var Put     = require('put'),
    util    = require('util'),
    log     = function (msg) {  };

exports.setLogger = function (logger) {
    log = logger;
};

exports.ExceptionMessage = {

    0x01 : 'ILLEGAL FUNCTION',
    0x02 : 'ILLEGAL DATA ADDRESS',
    0x03 : 'ILLEGAL DATA VALUE',
    0x04 : 'SLAVE DEVICE FAILURE',
    0x05 : 'ACKNOWLEDGE',
    0x06 : 'SLAVE DEVICE BUSY',
    0x08 : 'MEMORY PARITY ERROR',
    0x0A : 'GATEWAY PATH UNAVAILABLE',
    0x0B : 'GATEWAY TARGET DEVICE FAILED TO RESPOND'

};

var FC = {
	// Derived from Section 5.1 of "MODBUS Application Protocol Specification V1.1b3"
	// Data Access Function Codes
	//   For Bit-level Access
	//     Physical Discrete Inputs
	readDiscreteInputs         : 2,
	
	//     Internal Bits or Physical Coils
	readCoils                  : 1,
	writeSingleCoil            : 5,
	writeMultipleCoils         : 15,
	
	//   For 16-bits Access
	//     Physical Input Register
    readInputRegister          : 4,
	
	//     Internal Registers or Physical Output Registers
	readHoldingRegisters       : 3,
	writeSingleRegister        : 6,
	writeMultipleRegisters     : 16,
	readWriteMultipleRegisters : 23,
	maskWriteRegister          : 22,
	readFifoQueue              : 24,
	
	//   File Record Access
	readFileRecord             : 20,
	writeFileRecord            : 21
	
};

exports.FC = FC;

exports.Server = { 
	/**
	 *  Server response handler. Put new function call
	 *  responses in here. The parameters for the function
	 *  are defined by the handle that has been delivered to 
	 *  the server objects addHandler function.
	 */
	ResponseHandler : {},
	
	/**
	 *  The RequestHandler on the server side. The
	 *  functions convert the incoming pdu to a 
	 *  usuable set of parameter that can be handled
	 *  from the server objects user handler (see addHandler 
	 *  function in the servers api).
	 */
	RequestHandler : {}
};

exports.Server.ResponseHandler[FC.readCoils] = function (register) {
	var flr = Math.floor(register.length / 8),
		len = register.length % 8 > 0 ? flr + 1 : flr,
		res = Put().word8(FC.readCoils).word8(len);

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
}

exports.Server.RequestHandler[FC.readCoils] = function (pdu) {
	var startAddress    = pdu.readUInt16BE(1),
		quantity        = pdu.readUInt16BE(3);

	return [ startAddress, quantity ];   
}

exports.Server.ResponseHandler[FC.readInputRegister] = function (register) {
	var res = Put().word8(FC.readInputRegister).word8(register.length * 2);

	for (var i = 0; i < register.length; i += 1) {
		res.word16be(register[i]);
	}

	return res.buffer();
}

exports.Server.RequestHandler[FC.readInputRegister] = function (pdu) {
	var startAddress    = pdu.readUInt16BE(1),
		quantity        = pdu.readUInt16BE(3);

	if ((1 <= quantity) && (quantity <= 125)) {
		return [ startAddress, quantity ];
	}
	
	return { error : 0x03 };
}

exports.Server.ResponseHandler[FC.writeSingleCoil] = function (outputAddress, outputValue) {
	var res = Put()
	    .word8(FC.writeSingleCoil)
		.word16be(outputAddress)
		.word16be(outputValue?0xFF00:0x0000)
		.buffer();

	return res;
}

exports.Server.RequestHandler[FC.writeSingleCoil] = function (pdu) {
	var outputAddress   = pdu.readUInt16BE(1),
		outputValue     = pdu.readUInt16BE(3),
		boolValue       = outputValue===0xFF00?true:outputValue===0x0000?false:undefined;

	return [ outputAddress, boolValue ];
}

exports.Server.ResponseHandler[FC.readHoldingRegisters] = function (register) {
    var res = Put().word8(FC.readHoldingRegisters).word8(register.length * 2);
    
	for (var i = 0; i < register.length; i += 1) {
        res.word16be(register[i]);
    }

    return res.buffer();
};

exports.Server.RequestHandler[FC.readHoldingRegisters] = function (pdu) {
	var startAddress    = pdu.readUInt16BE(1),
		quantity        = pdu.readUInt16BE(3);

	if ((1 <= quantity) && (quantity <= 125)) {
		return [ startAddress, quantity ];
	}
	
	return { error : 0x03 };
}

exports.Server.ResponseHandler[FC.writeSingleRegister] = function (outputAddress, outputValue) {
	var res = Put().word8(FC.writeSingleRegister).word16be(outputAddress).word16be(outputValue).buffer();

	return res;
};

exports.Server.RequestHandler[FC.writeSingleRegister] = function (pdu) {
	var outputAddress   = pdu.readUInt16BE(1),
		outputValue     = pdu.readUInt16BE(3);

	return [ outputAddress, outputValue ]; 

}

exports.Server.ResponseHandler[FC.writeMultipleRegisters] = function (outputAddress, outputRegCount) {
	var res = Put().word8(FC.writeMultipleRegisters).word16be(outputAddress).word16be(outputRegCount).buffer();

	return res;
};

exports.Server.RequestHandler[FC.writeMultipleRegisters] = function (pdu) {
	var outputAddress   = pdu.readUInt16BE(1),
		outputRegCount  = pdu.readUInt16BE(3),
		outputBytes     = pdu.readUInt8(5),
		outputValues    = [];
	
	if ((1 <= outputRegCount) && (outputRegCount <= 123)) {
		for (var i = 0; i < outputRegCount; i += 1) {
			outputValues.push(pdu.readUInt16BE(6 + (2 * i)));
		}
			
		return [ outputAddress, outputValues ];
	}
	
	return { error : 0x03 };
}

exports.Client = { };

/**
 *  The response handler for the client
 *  converts the pdu's delivered from the server
 *  into parameters for the users callback function.
 */
exports.Client.ResponseHandler = {
    // ReadCoils
    1 : function (pdu, cb) {

            log("handeling read coils response.");

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
    // ReadDiscreteInput
    2 : function (pdu, cb) {
    
            log("handle read discrete input register response.");

            var fc          = pdu.readUInt8(0),
                byteCount   = pdu.readUInt8(1),
                cntr        = 0,
                resp        = {
                    fc          : fc,
                    byteCount   : byteCount,
                    coils       : []
                };

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

    // ReadHoldingRegister
    3: function (pdu, cb) {
    
            log("handling read holding register response.");

            var fc          = pdu.readUInt8(0),
                byteCount   = pdu.readUInt8(1);

            var resp = {
                fc          : fc,
                byteCount   : byteCount,
                register    : [ ]
            };

            var registerCount = byteCount / 2;

            for (var i = 0; i < registerCount; i += 1) {
                resp.register.push(pdu.readUInt16BE(2 + (i * 2)));
            }

            cb(resp);
        
    },
    // ReadInputRegister
    4 : function (pdu, cb) {
          
            log("handling read input register response.");

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
            
            log("handling write single coil response.");

            var fc              = pdu.readUInt8(0),
                outputAddress   = pdu.readUInt16BE(1),
                outputValue     = pdu.readUInt16BE(3);

            var resp = {
                fc              : fc,
                outputAddress   : outputAddress,
                outputValue     : outputValue === 0x0000?false:outputValue===0xFF00?true:undefined
            };

            cb(resp);

        },
    6 : function (pdu, cb) {
            
            log("handling write single register response.");

            var fc              = pdu.readUInt8(0),
        registerAddress = pdu.readUInt16BE(1),
        registerValue   = pdu.readUInt16BE(3);

            var resp = {
                fc              : fc,
                registerAddress : registerAddress,
                registerValue   : registerValue
            };

            cb(resp);
        },
    // WriteMultipleCoils
    15 : function (pdu, cb) {
    
            log("handling write multiple coils response");

            var fc              = pdu.readUInt8(0),
                startAddress    = pdu.readUInt16BE(1),
                quantity        = pdu.readUInt16BE(3);
    
            var resp = {
                fc              : fc,
                startAddress    : startAddress,
                quantity        : quantity
            };

            cb(resp);

    }
        
};


