var ECR = require('../index');
var Dp25 = require('../driver/dp25/dp25');

var ecr = new ECR('/dev/tty.usbserial-AM01FDPM', 115200, Dp25, function () {
	this.printer.testCommunication();
});
