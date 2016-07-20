
const SEQUENCE_MIN = 0x22;
const SEQUENCE_MAX = 0x7f;

var Dp25 = function (serialPort) {
	this.sequence = 0x22;
	this.serialPort = serialPort;

	this.serialPort.on('data', function (buffer) {
		this.parseStatus(buffer);
	}.bind(this));
}

Dp25.prototype.parseStatus = function (buffer) {
	var status;

	status = buffer.slice(5, 11);

	if (buffer[0] & 4 === 4) {
		console.log('[STATUS] Error');
	}

	if (buffer[0] & 16 === 16) {
		console.log('[STATUS] Display not connected');
	}

	if (buffer[0] & 32 === 32) {
		console.log('[STATUS] Date and time not set');
	}

	if (buffer[0] & 64 === 64) {
		console.log('[STATUS] Invalid command');
	}

	if (buffer[0] & 128 === 128) {
		console.log('[STATUS] Invalid command');
	}

	if (buffer[1] & 64 === 64) {
		console.log('[STATUS] Command not allowed in the current fiscal mode');
	}

	if (buffer[1] & 128 === 128) {
		console.log('[STATUS] Arithmetic overflow');
	}

	if (buffer[2] & 4 === 4) {
		console.log('[STATUS] Non fiscal receipt open');
	}

	if (buffer[2] & 16 === 16) {
		console.log('[STATUS] Fiscal receipt open');
	}

	if (buffer[2] & 128 === 128) {
		console.log('[STATUS] Out of paper');
	}

	if (buffer[4] & 4 === 4) {
		console.log('[STATUS] Fiscal memory error');
	}

	if (buffer[4] & 8 === 8) {
		console.log('[STATUS] Fiscal memory full');
	}

	if (buffer[4] & 16 === 16) {
		console.log('[STATUS] Less than 50 free blocks left in fiscal memory');
	}

	if (buffer[4] & 32 === 32) {
		console.log('[STATUS] IBFM is set');
	}

	if (buffer[4] & 64 === 64) {
		console.log('[STATUS] PIB is set');
	}

	if (buffer[4] & 128 === 128) {
		console.log('[STATUS] Error writing to fiscal memory');
	}

	if (buffer[5] & 8 === 8) {
		console.log('[STATUS] Tax groups are set');
	}

	if (buffer[5] & 16 === 16) {
		console.log('[STATUS] Register is in fiscal mode');
	}

	if (buffer[5] & 64 === 64) {
		console.log('[STATUS] Fiscal memory is formatted');
	}

	if (buffer[5] & 128 === 128) {
		console.log('[STATUS] Fiscal memory is read only');
	}



};

Dp25.prototype.packMessage = function (cmd, data) {
	var message;

	data = data || '';

	message = '';
	message += String.fromCharCode(0x01); //Preamble
	message += String.fromCharCode((36 + data.length)); //Length
	message += String.fromCharCode(this.sequence); //Sequence
	message += String.fromCharCode(cmd); //Command
	message += data; //Data
	message += String.fromCharCode(0x05); //Postamble
	message += this.calculateBcc(this.sequence, cmd, data); //Checksum
	message += String.fromCharCode(0x03); //Terminator

	this.sequence++;
	if (this.sequence > SEQUENCE_MAX) {
		this.sequence = SEQUENCE_MIN;
	}
	console.log(new Buffer(message));
	return message;
};

Dp25.prototype.calculateBcc = function (seq, cmd, data) {
	var bcc, i, output, tmp;

	output = ''; //Output should be string

	bcc = 0; //Bcc is the sum of all bytes after 0x01 until 0x05 (inclusive)
	bcc += (36 + data.length); //Add length
	bcc += seq; //Add sequence
	bcc += cmd; //Add cmd

	for (i = 0; i < data.length; i++) {
		bcc += data.charCodeAt(i); //Add each character of the data
	}

	bcc += 0x05; //Postamble
	output += String.fromCharCode(0x30 + (bcc - (bcc % 4096)) / 4096); //Encode the bcc
	tmp = bcc % 4096;
	output += String.fromCharCode(0x30 + (tmp - (tmp % 256)) / 256);
	tmp = bcc % 256;
	output += String.fromCharCode(0x30 + (tmp - (tmp % 16)) / 16);
	tmp = bcc % 16;
	output += String.fromCharCode(0x30 + tmp);
	console.log('bcc',output);

	return output;
};

Dp25.prototype.testCommunication = function () {
	this.serialPort.write(this.packMessage(0x41,'sCASH_LOC'), console.log.bind(console));
};

module.exports = Dp25;
