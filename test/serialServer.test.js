
var assert = require('assert'),
    util = require('util'),
    Put = require('put'),
    sinon = require('sinon'),
    eventEmitter = require('events').EventEmitter,
    modbusHandler = require('../src/handler');

describe('Modbus Serial Server', function () {

  var modbusServer, serverApiDummy, socketApiDummy;


  /**
   *  Setup socketApiDummy and load modbusServer module
   */   
  beforeEach(function (done) {

    socketApiDummy = {
      on     : function () { },
      write  : function () { },
      pipe   : function () { }
    };

    var dummy = function () { };

    modbusServer = require('../src/serialServer');
    modbusServer.setLogger(dummy);

    done();
  });

  /**
   *  Remove module from cache so that it can be reloaded
   */
  afterEach(function (done) {

    var sName = require.resolve('../src/serialServer');

    delete require.cache[sName];
    
    done();
  });

  /**
   *  Test for socket initialisation 
   */
  it('should do the setup', function () {

    var	socketMock = sinon.mock(socketApiDummy);

    socketMock.expects('on').once()
	.withArgs(sinon.match('data'), sinon.match.func);

    socketMock.expects('on').once()
	.withArgs(sinon.match('end'), sinon.match.func);

    var server = modbusServer.create(socketApiDummy);

    socketMock.verify();

  });

  describe('Requests', function () {

    var server;

    /**
     *  SocketApi is a Mock for simulating the socket
     *  therefor it uses the events.EventEmitter Module
     */
    var SocketApi = function () {
      eventEmitter.call(this);

      this.write = function () { };
      this.pipe = function () { };
    };

    util.inherits(SocketApi, eventEmitter);

    /**
     *  The SocketApi's instance, gets initiated before
     *  every test.
     */
    var socket;

    beforeEach(function (done) {

      socket = new SocketApi();

      server = modbusServer.create(
        socket,
        modbusHandler.Server.RequestHandler,
        modbusHandler.Server.ResponseHandler);

      done();
 
    });

    /**
     *  Make a request through the socket.emit call and
     *  check what socket.write will be called with
     */

    it('should respond to a readCoils function call', function () {

      var handler = sinon.stub().returns(
		[[true, false, true, true, false, true, false, true, true, false, true]]);

      server.addHandler(1, handler);

      var req = Put()
        .word8(1)      // function code    // PDU
        .word16be(13)  // start address
	.word16be(11)   // quantity
	.buffer();

      var res = Put()
	.word8(1)      // function code     // PDU
	.word8(2)      // byte count
	.word8(173)    // 0x10101101 -> reg[13] - reg[20]i
	.word8(5)      // 0x00000101 -> reg[20] - reg[23]
	.buffer();

      var spy = sinon.spy(socket, "write");

      socket.emit('data', req);

      assert.ok(handler.called);
      assert.deepEqual(handler.args[0], [13, 11]);
      assert.deepEqual(res, spy.getCall(0).args[0]);

    });

    it('should respond to a readInputRegister function call', function () {
      
      var stub = sinon.stub()
	.withArgs(13, 2)
	.returns([[13, 22]]);

      server.addHandler(4, stub);

      var req = Put()
        .word8(4)      // function code    // PDU
        .word16be(13)  // start address
	.word16be(2)   // quantity
	.buffer();

       var res = Put()
	.word8(4)      // function code     // PDU
	.word8(4)      // byte count
	.word16be(13)  // register[13] = 13
	.word16be(22)  // register[14] = 22
	.buffer();

       var spy = sinon.spy(socket, 'write');

       socket.emit('data', req);
  
       assert.ok(stub.called);
       assert.deepEqual(stub.args[0], [13, 2]); 
       assert.deepEqual(res, spy.getCall(0).args[0]);
    });

    it('should handle a write single coil request', function () {

      var stub = sinon.stub()
		.withArgs(10, true)
		.returns([10, true]);

      server.addHandler(5, stub);

      var req = Put()
	.word8(5)
	.word16be(10)
	.word16be(0xFF00)
	.buffer();

      var res = Put()
	.word8(5)
	.word16be(10)
	.word16be(0xFF00)
	.buffer();

      var spy = sinon.spy(socket, 'write');

      socket.emit('data', req);

      assert.ok(stub.called);
      assert.deepEqual(stub.args[0], [10, true]);
      assert.deepEqual(res, spy.getCall(0).args[0]); 

    });

    it('should handle a write single holding register request', function () {

      var stub = sinon.stub()
		.withArgs(10, 0xBEEF)
		.returns([10, 0xBEEF]);

      server.addHandler(6, stub);

      var req = Put()
	.word8(6)
	.word16be(10)
	.word16be(0xBEEF)
	.buffer();

      var res = Put()
	.word8(6)
	.word16be(10)
	.word16be(0xBEEF)
	.buffer();

      var spy = sinon.spy(socket, 'write');

      socket.emit('data', req);

      assert.ok(stub.called);
      assert.deepEqual(stub.args[0], [10, 0xBEEF]);
      assert.deepEqual(res, spy.getCall(0).args[0]); 

    });

    it('should handle a write multiple holding register request', function () {

      var stub = sinon.stub()
		.withArgs(10, [0xBEEF, 0xC0DE, 0xDEAD])
		.returns([10, 3]);

      server.addHandler(16, stub);

      var req = Put()
	.word8(16)
	.word16be(10)
	.word16be(3)
	.word8(6)
	.word16be(0xBEEF)
	.word16be(0xC0DE)
	.word16be(0xDEAD)
	.buffer();

      var res = Put()
	.word8(16)
	.word16be(10)
	.word16be(3)
	.buffer();

      var spy = sinon.spy(socket, 'write');

      socket.emit('data', req);

      assert.ok(stub.called);
      assert.deepEqual(stub.args[0], [10, [0xBEEF, 0xC0DE, 0xDEAD]]);
      assert.deepEqual(res, spy.getCall(0).args[0]); 

    });

    it('should handle a read holding registers request', function () {

      var stub = sinon.stub()
		.withArgs(10, 4)
		.returns([[15, 16, 17, 18]]);

      server.addHandler(3, stub);

      var req = Put()
	.word8(3)
	.word16be(10)
	.word16be(4)
	.buffer();

      var res = Put()
	.word8(3)
	.word8(8)
	.word16be(15)
	.word16be(16)
	.word16be(17)
	.word16be(18)
	.buffer();

      var spy = sinon.spy(socket, 'write');

      socket.emit('data', req);

      assert.ok(stub.called);
      assert.deepEqual(stub.args[0], [10, 4]);
      assert.deepEqual(res, spy.getCall(0).args[0]); 

    });

    it('should respond with an error response to read holding registers for too many registers', function () {
      var stub = sinon.stub()
		.withArgs(10, 4)
		.returns([[15, 16, 17, 18]]);

      server.addHandler(3, stub);

      var req = Put()
		.word8(3)
		.word16be(10)
		.word16be(200)
		.buffer();

       var res = Put()
		.word8(0x83)   // error code (0x03 + 0x80)
		.word8(0x03)   // expection code (illegal value)
		.buffer();

        var spy = sinon.spy(socket, 'write');

	socket.emit('data', req);
	
	assert.deepEqual(res, spy.getCall(0).args[0]);

    });
	
	it('should respond with an error response', function () {

      var req = Put()
	.word8(4)      // function code     // PDU
	.word16be(13)  // start address
	.word16be(2)   // quantity
	.buffer();

       var res = Put()
	.word8(0x84)   // error code (0x04 + 0x80)
	.word8(0x01)   // expection code (illegal function)
	.buffer();

        var spy = sinon.spy(socket, 'write');

	socket.emit('data', req);
	
	assert.deepEqual(res, spy.getCall(0).args[0]);

    });

    it('should respond with an some error response', function () {

      server.addHandler(4, function () { });

      var req = Put()
	.word8(4)
	.word16be(13)
	.word8(2)
	.buffer();

      var res = Put()
	.word8(0x84)
	.word8(0x02)
	.buffer();

      var handlerSpy = sinon.stub(modbusHandler.Server.RequestHandler, '4'),
          writeSpy = sinon.spy(socket, 'write');

      handlerSpy.returns({error: 0x02 }); // ILLEGAL DATA ADDRESS

      socket.emit('data', req);

      assert.deepEqual(res, writeSpy.getCall(0).args[0]);

    });
  });

});
