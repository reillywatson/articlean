var http = require('http');

var app = http.createServer(handler);

var port = process.env.PORT || 5000;
app.listen(port, function() {
	console.log("Listening on " + port);
});

function handler (req, res) {
	http.get("http://www.google.com/index.html", function(res) {
		console.log("Got response: " + res.statusCode);
	}).on('error', function(e) {
		console.log("Got error: " + e.message);
	});
	function (err, data) {
		res.writeHead(200);
		res.end(data);
	});
}

