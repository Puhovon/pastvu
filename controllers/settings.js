var Settings;
var UserSettingsDef;
var step = require('step');
var logger = require('log4js').getLogger('settings.js');
var appvar;
var appEnv = {};

var clientSettings;
var userSettingsDef;
var userSettingsVars = {};
var userRanks;
var userRanksHash = {};

/**
 * Заполняем объект для параметров клиента
 */
function fillClientParams(cb) {
    var params = {
        server: appEnv.serverAddr,
        appHash: appEnv.hash,
        appVersion: appEnv.version
    };
    step(
        function () {
            Settings.find({}, { _id: 0, key: 1, val: 1 }, { lean: true }, this);
        },
        function (err, settings) {
            if (err) {
                logger.error(err);
                return cb(err);
            }
            for (var i = 0; i < settings.length; i++) {
                params[settings[i].key] = settings[i].val;
            }
            clientSettings = params;
            cb();
        }
    );
}

/**
 * Заполняем объект для параметров пользователя по умолчанию
 */
function fillUserSettingsDef(cb) {
    var params = {};
    step(
        function () {
            UserSettingsDef.find({ key: { $ne: 'ranks' } }, { _id: 0, key: 1, val: 1, vars: 1 }, { lean: true }, this);
        },
        function (err, settings) {
            if (err) {
                logger.error(err);
                return cb(err);
            }
            for (var i = 0; i < settings.length; i++) {
                params[settings[i].key] = settings[i].val;
                userSettingsVars[settings[i].key] = settings[i].vars;
            }
            userSettingsDef = params;
            cb();
        }
    );
}

/**
 * Заполняем объект для возможных званий пользователя
 */
function fillUserRanks(cb) {
    step(
        function () {
            UserSettingsDef.findOne({ key: 'ranks' }, { _id: 0, vars: 1 }, { lean: true }, this);
        },
        function (err, row) {
            if (err) {
                logger.error(err);
                return cb(err);
            }
            for (var i = 0; i < row.vars.length; i++) {
                userRanksHash[row.vars[i]] = 1;
            }
            userRanks = row.vars;
            cb();
        }
    );
}

module.exports.getClientParams = function () {
    return clientSettings;
};
module.exports.getUserSettingsDef = function () {
    return userSettingsDef;
};
module.exports.getUserSettingsVars = function () {
    return userSettingsVars;
};
module.exports.getUserRanks = function () {
    return userRanks;
};
module.exports.getUserRanksHash = function () {
    return userRanksHash;
};

module.exports.loadController = function (app, db, io, cb) {
    appvar = app;
    appEnv = app.get('appEnv');

    Settings = db.model('Settings');
    UserSettingsDef = db.model('UserSettingsDef');
    step(
        function () {
            fillClientParams(this.parallel());
            fillUserSettingsDef(this.parallel());
            fillUserRanks(this.parallel());
        },
        function (err) {
            io.sockets.on('connection', function (socket) {
                socket.on('giveClientParams', function () {
                    socket.emit('takeClientParams', clientSettings);
                });

                socket.on('giveUserSettingsVars', function () {
                    socket.emit('takeUserSettingsVars', userSettingsVars);
                });

                socket.on('giveUserAllRanks', function () {
                    socket.emit('takeUserAllRanks', userRanks);
                });
            });
            cb(err);
        }
    );
};