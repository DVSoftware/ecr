const SerialPort = require('serialport');

class ECR {
	constructor(device, baudRate, Driver, callback) {
		this.serialPort = new SerialPort(device, {
			baudRate,
			autoOpen: true,
		}, (error) => {
			if (error) {
				return callback.call(this, error);
			}
			this.printer = new Driver(this.serialPort);

			this.serialPort.on('error', (data) => {
				console.log('error', data);
			});

			this.serialPort.on('disconnected', (data) => {
				console.log('disconnected', data);
			});

			return callback.call(this, null, this.printer);
		});
	}
}

module.exports = ECR;
