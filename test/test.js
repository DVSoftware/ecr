const ECR = require('../index');
const Dp25 = require('../driver/intraster/dp25/dp25');


const ecr = new ECR(
	'/dev/tty.usbserial-AK05EWNA',
	115200,
	Dp25,
	(err, printer) => {
		if (err) {
			if (printer) {
				printer.serialPort.close();
			}
			throw new Error(err);
		}
		printer.testCommunication((error) => {
			if (error) {
				printer.serialPort.close();
				throw new Error(error);
			}

			printer.getTotals()
				.then((totals) => {
					printer.serialPort.close();
					console.log(totals);
				});
		});
	}
);
