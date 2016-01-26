var net         = require('net'),
    handler     = require('./handler');

var log = function () { };

exports.setLogger = function (logger) {
    log = logger;
    handler.setLogger(logger);
};

exports.createTCPClient = function (port, host, unit_id, cb) {

    var net             = require('net'),
    tcpClientModule     = require('./tcpClient'),
    serialClientModule  = require('./serialClient');

    tcpClientModule.setLogger(log);
    serialClientModule.setLogger(log);
    
    // retrieve arguments as array
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }
    // first argument is the port, 2nd argument is the host   
    port = args.shift();
    host = args.shift();
    // last argument is the callback function.    
    cb = args.pop();

    // if args still holds items, this is the unit_id
    if (args.length > 0) unit_id = args.shift(); else unit_id = 1;  //default to 1

    var socket    = net.connect(port, host),
        tcpClient = tcpClientModule.create(socket, unit_id);
    
    socket.on('error', function (e) {

        if (!cb) {
            return;
        }

        cb(e); 

    });

    socket.on('connect', function () {

        if (!cb) {
            return;
        }

        cb();

    });

    var client = serialClientModule.create(
        tcpClient,
        handler.Client.ResponseHandler);

        client.reconnect = function () {
            socket.connect(port, host);
        };

        return client;

};


exports.createTCPServer = function (port, host, newServerCallback, tcpServerErrorCallback, connectionErrorCallback) {

    var net             = require('net'),
    tcpServerModule     = require('./tcpServer'),
    serialServerModule  = require('./serialServer');

	if ('function' === typeof host) {
		connectionErrorCallback = tcpServerErrorCallback || function () {};
		tcpServerErrorCallback = newServerCallback || function () {};
		newServerCallback = host;
		host = null;		
	}
	
	tcpServerModule.setLogger(log);
    serialServerModule.setLogger(log);

    var socket = net.createServer();
	
	socket.on('error', tcpServerErrorCallback);
	
    socket.on('connection', function (s) {
		s.on('error', connectionErrorCallback);
		
        var tcpServer = tcpServerModule.create(s);

        var server = serialServerModule.create(
            tcpServer,
            handler.Server.RequestHandler,
            handler.Server.ResponseHandler);

            newServerCallback(server);

    });

	if (null == host) {
		socket.listen(port);
	} else {
		socket.listen(port, host);
	}
};

exports.FC = handler.FC;

