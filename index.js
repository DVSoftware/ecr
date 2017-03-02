const SerialPort = require('serialport');

class ECR {
	constructor(device, baudRate, Driver, callback) {
		this.serialPort = new SerialPort(device, {
			baudrate: baudRate,
			parser: SerialPort.parsers.byteLength(1),
			autoOpen: true
		}, error => {
			if (error) {
				return callback.call(this, error)
			}
			this.printer = new Driver(this.serialPort);

			this.serialPort.on('error', function (data) {
				console.log('error', data);
			});

			this.serialPort.on('disconnected', function (data) {
				console.log('disconnected', data);
			});

			return callback.call(null, this);
		});
	}
}

module.exports = ECR;
