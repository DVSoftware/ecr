'use strict';

const ByteLength = require('@serialport/parser-byte-length');

const SEQUENCE_MIN = 0x22;
const SEQUENCE_MAX = 0x7f;
const MAX_RETRIES = 12;
const ERROR = {
	FATAL_INVALID_COMMAND: 0,
	FATAL_SYNTAX_ERROR: 1,
	FATAL_NOT_ALLOWED: 2,
	FATAL_OVERFLOW: 3,
	FATAL_OUT_OF_PAPER: 4,
	FISCAL_WRITE_ERROR: 5,
	FISCAL_MEMORY_FULL: 6,
	FISCAL_MEMORY_READONLY: 7,
};
const STATUS = {
	DISPLAY_NOT_CONNECTED: 1,
	DATE_TIME_NOT_SET: 2,
	LESS_THAN_50_BLOCKS: 3,
	IBFM_SET: 4,
	PIB_SET: 5,
	NON_FISCAL_OPEN: 6,
	FISCAL_OPEN: 7,
	TAX_GROUPS_SET: 8,
	FISCAL_MODE: 9,
	MEMORY_FORMATTED: 10,
};

class Dp25 {
	constructor(serialPort) {
		let reading = false;
		let retries = 0;
		let position = 0;
		let subPosition = 0;
		let message;

		this.messageQueue = [];
		this.sequence = 0x22;
		this.serialPort = serialPort;

		this.parser = this.serialPort.pipe(new ByteLength({ length: 1 }));

		this.parser.on('data', (buffer) => {
			// console.log(buffer);
			// @todo implement timeout and retry after 500ms
			if (reading === false && buffer[0] === 0x15) {
				// NAK 15H
				retries += 1;
				this.runQueue();
				if (retries === MAX_RETRIES) {
					throw new Error('Maximum retries reached');
				}
			} else if (reading === false && buffer[0] === 0x16) {
				// SYN 16H
				// @todo wait
			} else if (reading === false && buffer[0] === 0x01) {
				// Preamble
				position += 1;
				reading = true;
			} else if (reading === true && position === 1) {
				// Length
				message = {
					length: buffer[0],
					data: Buffer.alloc(buffer[0] - 0x20 - 11),
					status: Buffer.alloc(6),
					checksum: Buffer.alloc(4),
				};
				position += 1;
			} else if (reading === true && position === 2) {
				// Sequence
				message.sequence = buffer[0];
				position += 1;
			} else if (reading === true && position === 3) {
				// Command
				message.command = buffer[0];
				position += 1;
			} else if (reading === true && position < message.length - 0x20 - 7) {
				message.data[subPosition] = buffer[0];
				subPosition += 1;
				position += 1;
			} else if (reading === true && position === message.length - 0x20 - 7) {
				if (buffer[0] !== 0x04) {
					throw new Error(`Invalid delimiter. Expected 0x04 got ${buffer[0]}`);
				}
				subPosition = 0;
				position += 1;
			} else if (reading === true && position < message.length - 0x20) {
				message.status[subPosition] = buffer[0];
				subPosition += 1;
				position += 1;
			} else if (reading === true && position === message.length - 0x20) {
				if (buffer[0] !== 0x05) {
					throw new Error(`Invalid postamble. Expected 0x05 got ${buffer[0]}`);
				}
				subPosition = 0;
				position += 1;
			} else if (reading === true && position < (message.length - 0x20) + 5) {
				message.checksum[subPosition] = buffer[0];
				subPosition += 1;
				position += 1;
			} else if (reading === true && position === (message.length - 0x20) + 5) {
				if (buffer[0] !== 0x03) {
					throw new Error(`Invalid terminator. Expected 0x03 got ${buffer[0]}`);
				}
				subPosition = 0;
				position = 0;
				reading = false;
				retries = 0;

				this.parseStatus(message.status, (err, statuses) => {
					message.statuses = statuses;
					const queueMessage = this.messageQueue.shift();
					if (typeof queueMessage.callback === 'function') {
						queueMessage.callback.call(this, err, message);
	 				} else {
						 if (err) {
							// hack to get message when we are out of paper
							if (err[4]) {
								return queueMessage.resolve.call(this, [message, true]);
							}
							 return queueMessage.reject.call(this, err);
						 }
						 queueMessage.resolve.call(this, [message]);
					 }
				});
			} else {
				throw new Error('Malformed response from the printer');
			}
		});
	}

	queue(message, callback) {
		return new Promise((resolve, reject) => {
			this.messageQueue.push({
				message, callback, resolve, reject,
			});
			if (this.messageQueue.length === 1) {
				this.runQueue();
			}
		});
	}

	runQueue() {
		this.serialPort.write(this.messageQueue[0].message);
	}

	parseStatus(status, callback) {
		const errors = {};
		const statuses = {};
		let error = false;

		if ((status[0] & 32) === 32) {
			// Fatal error
			if ((status[0] & 2) === 2) {
				errors[ERROR.FATAL_INVALID_COMMAND] = new Error('Fatal Error: Invalid command');
			}

			if ((status[0] & 1) === 1) {
				errors[ERROR.FATAL_SYNTAX_ERROR] = new Error('Fatal Error: Syntax error');
			}

			if ((status[1] & 2) === 2) {
				errors[ERROR.FATAL_NOT_ALLOWED] = new Error('Fatal Error: Command not allowed in the current fiscal mode');
			}

			if ((status[1] & 1) === 1) {
				errors[ERROR.FATAL_OVERFLOW] = new Error('Fatal Error: Arithmetic overflow');
			}

			if ((status[2] & 1) === 1) {
				errors[ERROR.FATAL_OUT_OF_PAPER] = new Error('Fatal Error: Out of paper');
			}

			error = true;
		}

		if ((status[4] & 32) === 32) {
			// Fiscal memory error
			if ((status[4] & 1) === 1) {
				errors[ERROR.FISCAL_WRITE_ERROR] = new Error('Fiscal Memory Error: Error writing to the fiscal memory');
			}

			if ((status[4] & 16) === 16) {
				errors[ERROR.FISCAL_MEMORY_FULL] = new Error('Fiscal Memory Error: Fiscal memory full');
			}

			if ((status[5] & 1) === 1) {
				errors[ERROR.FISCAL_MEMORY_READONLY] = new Error('Fiscal Memory Error: Fiscal memory is read only');
			}

			error = true;
		}

		if ((status[0] & 8) === 8) {
			statuses[STATUS.DISPLAY_NOT_CONNECTED] = 'Display not connected';
		}

		if ((status[0] & 4) === 4) {
			statuses[STATUS.DATE_TIME_NOT_SET] = 'Date and time not set';
		}

		if ((status[4] & 8) === 8) {
			statuses[STATUS.LESS_THAN_50_BLOCKS] = 'Less than 50 free blocks left in fiscal memory';
		}

		if ((status[4] & 4) === 4) {
			statuses[STATUS.IBFM_SET] = 'IBFM is set';
		}

		if ((status[4] & 2) === 2) {
			statuses[STATUS.PIB_SET] = 'PIB is set';
		}

		if ((status[2] & 32) === 32) {
			statuses[STATUS.NON_FISCAL_OPEN] = 'Non fiscal receipt open';
		}

		if ((status[2] & 8) === 8) {
			statuses[STATUS.FISCAL_OPEN] = 'Fiscal receipt open';
		}

		if ((status[5] & 16) === 16) {
			statuses[STATUS.TAX_GROUPS_SET] = 'Tax groups are set';
		}

		if ((status[5] & 8) === 8) {
			statuses[STATUS.FISCAL_MODE] = 'Register is in fiscal mode';
		}

		if ((status[5] & 2) === 2) {
			statuses[STATUS.MEMORY_FORMATTED] = 'Fiscal memory is formatted';
		}

		callback(error ? errors : null, statuses);
	}

	packMessage(cmd, inputData) {
		let message;
		const data = inputData || '';

		message = '';
		message += String.fromCharCode(0x01); // Preamble
		message += String.fromCharCode((36 + data.length)); // Length
		message += String.fromCharCode(this.sequence); // Sequence
		message += String.fromCharCode(cmd); // Command
		message += data; // Data
		message += String.fromCharCode(0x05); // Postamble
		message += this.calculateBcc(this.sequence, cmd, data); // Checksum
		message += String.fromCharCode(0x03); // Terminator

		this.sequence += 1;
		if (this.sequence > SEQUENCE_MAX) {
			this.sequence = SEQUENCE_MIN;
		}
		return message;
	}

	calculateBcc(seq, cmd, data) {
		let bcc;
		let i;
		let output;
		let tmp;

		output = ''; // Output should be string

		bcc = 0; // Bcc is the sum of all bytes after 0x01 until 0x05 (inclusive)
		bcc += (36 + data.length); // Add length
		bcc += seq; // Add sequence
		bcc += cmd; // Add cmd

		for (i = 0; i < data.length; i++) {
			bcc += data.charCodeAt(i); // Add each character of the data
		}

		bcc += 0x05; // Postamble
		output += String.fromCharCode(0x30 + ((bcc - (bcc % 4096)) / 4096)); // Encode the bcc
		tmp = bcc % 4096;
		output += String.fromCharCode(0x30 + ((tmp - (tmp % 256)) / 256));
		tmp = bcc % 256;
		output += String.fromCharCode(0x30 + ((tmp - (tmp % 16)) / 16));
		tmp = bcc % 16;
		output += String.fromCharCode(0x30 + tmp);

		return output;
	}

	clearDisplay() {
		return this.queue(this.packMessage(0x21));
	}

	displayBottom(text) {
		return this.queue(this.packMessage(0x23, (text || '').substring(0, 20)));
	}

	displayTop(text) {
		return this.queue(this.packMessage(0x2F, (text || '').substring(0, 20)));
	}

	testCommunication() {
		return this.queue(this.packMessage(0x2D));
	}

	openFiscalReceipt(operator, password, till) {
		return this.queue(this.packMessage(0x30, `${operator};${password},${till}`))
			.then(([message, outOfPaper]) => {
				const split = message.data.toString().split(',');
				return {
					receipts: split[0],
					fiscalReceipts: split[1],
					outOfPaper,
				};
			});
	}
	closeFiscalReceipt() {
		return this.queue(this.packMessage(0x38))
			.then(([message, outOfPaper]) => {
				const split = message.data.toString().split(',');
				return {
					allReceipt: split[0],
					fiscalReceipt: split[1],
					total: split[2],
					outOfPaper,
				};
			});
	}

	status(option) {
		return this.queue(this.packMessage(0x4C, option))
			.then(([message, outOfPaper]) => {
				const [open, items, amount, tender] = message.data.toString().split(',');
				return {
					open,
					items,
					amount,
					tender,
					outOfPaper,
				};
			});
	}

	total(paidMode, amount) {
		return this.queue(this.packMessage(0x35, `${paidMode}${amount}`))
			.then(([message, outOfPaper]) => {
				const [paidCode, ...paidAmount] = message.data.toString().split(',');

				if (paidCode === 'F') {
					throw new Error({
						paidCode,
					});
				}
				return {
					paidCode,
					amount: paidAmount.join(''),
					outOfPaper,
				};
			});
	}
	register(sign, plu, quantity, price) {
		return this.queue(this.packMessage(0x34, `S${sign}${plu}*${quantity}#${price}`))
			.then(([message, outOfPaper]) => ({
				message,
				outOfPaper,
			}));
	}

	subtotal(display, callback) {
		return this.queue(this.packMessage(0x33, display || 0))
			.then(([message, outOfPaper]) => {
				const split = message.data.toString().split(',');
				return callback.call(this, null, {
					subTotal: split.shift(),
					tax: split,
					outOfPaper,
				});
			});
	}

	programRead(plu, callback) {
		this.queue(this.packMessage(0x6B, `R,${plu}`), (err, message) => {
			if (err) {
				return callback.call(this, err);
			}
			const split = message.data.toString().split(',');
			if (split.length === 1) {
				return callback.call(this, null, {
					errStatus: split.shift(),
				});
			}
			return callback.call(this, null, {
				errStatus: split.shift(),
				plu: split.shift(),
				taxGroup: split.shift(),
				priceType: split.shift(),
				price: split.shift(),
				total: split.shift(),
				sold: split.shift(),
				ean: split.shift(),
				ean2: split.shift(),
				pack: split.shift(),
				name: split.join(','),
			});
		});
	}

	programWrite(check, taxGroup, plu, priceType, price, ean, pack, name, callback) {
		this.queue(
			this.packMessage(
				0x6B,
				`P,${taxGroup},${plu},${priceType},${price},${ean},0,${pack},${name}`
			),
			(err, message) => {
				if (err) {
					return callback.call(this, err);
				}

				const split = message.data.toString().split(',');
				if (split.length === 1) {
					return callback.call(this, null, {
						errStatus: split.shift(),
					});
				}

				return null;
			}
		);
	}

	getTotals() {
		return this.queue(this.packMessage(
			0x41,
			'4'
		))
			.then(([message, outOfPaper]) => {
				const split = message.data.toString().split(',');

				if (split[0] === 'F') {
					throw new Error('F');
				}

				return {
					errStatus: split.shift(),
					cash: parseInt(split.shift(), 10) / 100,
					check: parseInt(split.shift(), 10) / 100,
					card: parseInt(split.shift(), 10) / 100,
					outOfPaper,
				};
			});
	}

	getFirstSoldItem(from = '') {
		return new Promise((resolve, reject) => {
			this.queue(this.packMessage(
				0x6B,
				`f${from}`
			), (err, message) => {
				if (err) {
					return reject(err);
				}

				const split = message.data.toString().split(',');

				if (split[0] === 'F') {
					return resolve(null);
				}

				return resolve({
					plu: split.shift().substring(1),
					taxGroup: split.shift(),
					price: split.shift(),
					sold: split.shift(),
					total: split.shift(),
					name: split.join(','),
				});
			});
		});
	}

	getNextSoldItem() {
		return new Promise((resolve, reject) => {
			this.queue(this.packMessage(
				0x6B,
				'n'
			), (err, message) => {
				if (err) {
					return reject(err);
				}

				const split = message.data.toString().split(',');

				if (split[0] === 'F') {
					return resolve(null);
				}

				return resolve({
					plu: split.shift().substring(1),
					taxGroup: split.shift(),
					price: split.shift(),
					sold: split.shift(),
					total: split.shift(),
					name: split.join(','),
				});
			});
		});
	}
}

module.exports = Dp25;
