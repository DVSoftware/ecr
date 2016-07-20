var SerialPort = require('serialport');

var ECR = function (device, baudRate, Driver, callback) {
	this.serialPort = new SerialPort.SerialPort(device, {
		baudrate: baudRate,
		parser: SerialPort.parsers.raw
	}, true, function (error) {
		this.printer = new Driver(this.serialPort);
		console.log(error, this.serialPort);
		this.serialPort.on('error', function (data) {
			console.log('error', data);
		});

		this.serialPort.on('data', function (data) {
			console.log('data', data);
		});

		this.serialPort.on('disconnected', function (data) {
			console.log('disconnected', data);
		});
		callback.call(this);

	}.bind(this));

	// console.log(this.serialPort);
};

module.exports = ECR;
