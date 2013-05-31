var http = require('http');
var fs = require('fs');
var Spooky = require('spooky');
var readability = require('./readability.js');

var app = http.createServer(handler);

var readability = fs.readFileSync(__dirname + '/readability.js');

var port = process.env.PORT || 5000;
app.listen(port, function() {
	console.log("Listening on " + port);
});

var get_clean_article = function(url, res) {
	var spooky = new Spooky({
	        casper: {
	            logLevel: 'debug',
	            verbose: true
	        }
	    }, function (err) {
	        if (err) {
	            e = new Error('Failed to initialize SpookyJS');
	            e.details = err;
	            throw e;
	        }

	        spooky.on('error', function (e) {
	            console.error(e);
	        });

	        
	        // Uncomment this block to see all of the things Casper has to say.
	        // There are a lot.
	        // He has opinions.
	        spooky.on('console', function (line) {
	            console.log(line);
	        });
	        

	        spooky.on('log', function (log) {
	            if (log.space === 'remote') {
	                console.log(log.message.replace(/ \- .*/, ''));
	            }
	        });
		spooky.start(url);
//		spooky.thenEvaluate(function() {
//			readability.init();
//		});
		spooky.thenEvaluate(function () {
			res.end(this.getHTML());
		});
		spooky.run();
	});
};

function handler (req, res) {
	get_clean_article('http://en.wikipedia.org/wiki/Spooky_the_Tuff_Little_Ghost', res);
}

