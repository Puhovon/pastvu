var auth = require('./auth.js'),
	Settings = require('mongoose').model('Settings'),
	User = require('mongoose').model('User'),
	Step = require('step');

module.exports.loadController = function (app, io) {
	
	var iterator = 0;
	app.get('/u/:login', function(req, res){
		var login = req.params.login,
			userObject;
		if (!login) throw new errS.e404();
		
		Step(
			function findUser() {
				User.findOne({ $and: [ {login : new RegExp(login, 'i')}, { active: true } ] }, {_id:0, active:0} , this);
			},
			function findUser(err, user) {
				userObject = user.toObject;
				if (err || !user) {
					throw new errS.e404();
				} else {
					res.render('profile.jade', {prettyprint:true, pageTitle: user.login, appVersion: app.version});
				}
			}
		);
		
	});

	app.get('/p/:file', function(req, res, next) {
		console.log(99);
		console.dir(res.sendfile);
		//next();
		console.log(88);
		//res.send('updateCookie2', 200);
	});
	
	io.sockets.on('connection', function (socket) {
		var hs = socket.handshake,
			session = hs.session;
	});
	
	//////////////////////
   /* var filePath = '.' + request.url;
    if (filePath == './')
        filePath = './index.htm';
         
    var extname = path.extname(filePath);
    var contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
    }
     
    path.exists(filePath, function(exists) {
     
        if (exists) {
            fs.readFile(filePath, function(error, content) {
                if (error) {
                    response.writeHead(500);
                    response.end();
                }
                else {
                    response.writeHead(200, { 'Content-Type': contentType });
                    response.end(content, 'utf-8');
                }
            });
        }
        else {
            response.writeHead(404);
            response.end();
        }
    });
	*/
	 
};