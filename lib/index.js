/*
    Exports and Requirements 
*/ 
module.exports = ExpirePurge;
var tilelive = require("tilelive"),
    fs = require('fs'),  
    Q = require("q"),
    request = require("request"), 
    handlebars = require("handlebars"); 

/*
    Constructor
*/ 
function ExpirePurge(uri, callback) { 
    var superThis = this;

    function readFilePromise(uri){ 
        // Function that reads a json and initialize attribute values 
        var deferred = Q.defer(); 
        fs.readFile(uri.path,'utf8', function(err,data){
            if(err) {
                deferred.reject(err); 
                console.log("Error in reading " + uri.href); 
            } else {
                var content = JSON.parse(data);
                superThis._destination = content.destination;
                var requests = [];
                if(content.requests && content.requests.length > 0) {
                    for (var i = 0; i < content.requests.length; i++) {
                        var requestDefinition = content.requests[i];
                        var requestContent = {};
                        requestContent.urlTemplate = handlebars.compile(requestDefinition.urlTemplate);
                        requestContent.method = requestDefinition.method || "PURGE";
                        requestContent.headers = {};
                        Object.keys(requestDefinition.headers).forEach(function(key) {
                            requestContent.headers[key] = handlebars.compile(requestDefinition.headers[key]);
                        });
                        requests.push(requestContent);
                    }
                } else {
                    throw("Request definitions not found");
                }
                superThis._requests = requests;

                deferred.resolve(superThis._destination);
            }
        });
        return deferred.promise; 
    }

    function load_destination(s){
        // Function that loads the source specified in the json file 
        var deferred = Q.defer(); 
        tilelive.load(s, function(err,src) {
            if(err) {
                console.log("error loading destination:" + s); 
                deferred.reject(err); 
            } else {
                superThis._loaded = src;  
                deferred.resolve();
                callback(null, superThis); 
            }
        }); 
        return deferred.promise; 
    }

    readFilePromise(uri)
        .then(load_destination);

    // Returns undefined otherwise
    return undefined;
}

/*
    Register protocol with tilelive 
*/ 
ExpirePurge.registerProtocols = function(tilelive) {
    tilelive.protocols['expirepurge:'] = ExpirePurge;
};
ExpirePurge.registerProtocols(tilelive);

/*
    Class methods 
*/ 
ExpirePurge.prototype.putTile = function(z, x, y, data, callback) {
    var requests = this._requests,
        templateParameters = {"zoom":z, "x":x, "y":y};

    function updateTile(src) {
        // Function that calls putTile on the source which is the actual destination of the tile
        var deferred = Q.defer(); 
        src.putTile(z, x, y, data, function(err) {
            if(err) {
                console.log(err); 
                deferred.reject(err);
            } else {
                deferred.resolve(src);                 
            }
        }); 
        return deferred.promise; 
    }

    function sendPurgeRequests() {
        var promises = [];
        for(var i = 0; i < requests.length; i++) {
            var requestDefinition = requests[i];
            var headers = {};
            Object.keys(requestDefinition.headers).forEach(function(key) {
                headers[key] = requestDefinition.headers[key](templateParameters);
            });
            var options = {
                url: requestDefinition.urlTemplate(templateParameters),
                method: requestDefinition.method,
                headers: headers
            }; 
            var deferred = Q.defer();
            request(options, function (err, response, body) {
                if(err) {
                    console.log("Error purging:"  + err);
                    deferred.reject(err);
                } else {
                    deferred.resolve();
                }
            });
            promises.push(deferred);
        }

        Q.all(promises).then(function() {
            callback(null);
        }, function(err) {
            callback(err);
        });
    }
 
    updateTile(this._loaded).then(sendPurgeRequests);
}

/*
    Class methods that gets forwarded if called 
*/
ExpirePurge.prototype.startWriting = function(callback) {
    this._loaded.startWriting(callback);
};

ExpirePurge.prototype.stopWriting = function(callback) {
    this._loaded.stopWriting(callback); 
};

ExpirePurge.prototype.putInfo = function(info, callback) {
    this._loaded.putInfo(info, callback);
};

ExpirePurge.prototype.putGrid = function(z, x, y, grid, callback) {
    this._loaded.putGrid(z, x, y, grid, callback);
};
