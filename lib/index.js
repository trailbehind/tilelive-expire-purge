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
                superThis._source = content.source;
                superThis._purgeUrlTemplate = handlebars.compile(content.purgeUrlTemplate);
                superThis._purgeHeaders = content.headers;
                superThis._purgeMethod = content.method || "PURGE";
                superThis._purgeHeaders = {};
                Object.keys(content.headers).forEach(function(key) {
                    superThis._purgeHeaders[key] = handlebars.compile(content.headers[key]);
                });

                deferred.resolve(superThis._source);
            }
        });
        return deferred.promise; 
    }

    function load_source(s){
        // Function that loads the source specified in the json file 
        var deferred = Q.defer(); 
        tilelive.load(s, function(err,src){
            if(err) {
                console.log("error loading source : " + this._source); 
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
        .then(load_source); 

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
    var headerTemplate = this._purgeHeaders;
    var templateParameters = {"zoom":z, "x":x, "y":y};
    var purgeUrl = this._purgeUrlTemplate(templateParameters);
    var headers = {};
    Object.keys(headerTemplate).forEach(function(key) {
        headers[key] = headerTemplate[key](templateParameters);
    });

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

    function sendPurge() {
        var options = {
            url: purgeUrl,
            method: this._purgeMethod,
            headers: headers
        }; 
        
        request(options, function (err, response, body){
            if(err) {
                console.log("Error purging:"  + err);
                callback(err); 
            } else { 
                console.log("Purge request completed"); 
                callback(null); // Call the callback of the original putTile call
            }
        }); 
    } 
 
    updateTile(this._loaded)
    .then(sendPurge); 
}

/*
    Class methods that gets forwarded if called 
*/
ExpirePurge.prototype.startWriting = function(callback){ 
    this._loaded.startWriting(callback);   
}

ExpirePurge.prototype.stopWriting = function(callback){ 
    this._loaded.stopWriting(callback); 
}

ExpirePurge.prototype.putInfo = function(info, callback){ 
    this._loaded.putInfo(info, callback);  
}

ExpirePurge.prototype.putGrid = function(z, x, y, grid, callback){ 
    this._loaded.putGrid(z, x, y, grid, callback);   
}
