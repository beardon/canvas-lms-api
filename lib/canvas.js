'use strict';

var _ = require('lodash');
var Promise = require('bluebird');
var qs = require('qs');
var merge = require('lodash.merge');
var isString = require('lodash.isstring');
var parseLink = require('parse-link-header');
var request = Promise.promisify(require('request'), { multiArgs: true });
var resolve = require('url').resolve;

function Canvas(host, options) {
    options = options || {};
    options.json = true;
    this.name = 'canvas';
    this.accessToken = options.accessToken || options.token || '';
    this.apiVersion = options.apiVersion || options.version || 'v1';
    this.query = options.query || {};
    this.host = host;
}

Canvas.prototype._buildApiUrl = function (endpoint) {
    return resolve(this.host,  '/api/' + this.apiVersion + (endpoint[0] === '/' ? '' : '/') + endpoint);
};

Canvas.prototype._http = function (options, prevBody) {
    var that = this;
    options.headers = {
        Authorization: 'Bearer ' + this.accessToken
    };

    options.json = true;

    // If we've exhausted half the rate limit start delaying our requests so we don't run out the rest
    var throttle = 0;
    if(this.rateLimitRemaining && this.rateLimitRemaining < this.rateLimitMax / 2) {
       throttle = getRandomInt(50, 100);
    }

    return Promise.delay(throttle).then(function() {
      return request(options).spread(function (response, body) {
            if ((response.statusCode !== 200) && (response.statusCode !== 201)) {
                // Check for throttling and retry after a delay
                if (response.statusCode === 403 && /Rate Limit Exceeded/.test(response.body)) {
                    // Use a random delay so that we don't retry a ton of requests at the same time and exhaust the limit again
                    return Promise.delay(getRandomInt(200, 500)).then(function() {
                        return that._http(options, prevBody);
                     });
                }
                var err = new Error();
                try {
                    err.message = body.errors.map(function (err) {
                        return err.message;
                    }).join('\n');
                }
                catch (e) {
                    err.message = body.message;
                }
                err.errors = body.errors;
                err.code = response.statusCode;
                throw err;
            }
            if (! that.rateLimitMax) {
                that.rateLimitMax = response.headers['x-rate-limit-remaining'];
            }
            that.rateLimitRemaining = response.headers['x-rate-limit-remaining'];
            if(response.headers.link){
                var nextLink = parseLink(response.headers.link);
                if (nextLink.next) {
                    nextLink = nextLink.next.url.split('?');
                    var nextOptions = {
                        method: options.method,
                        url: nextLink[0],
                        qs: qs.parse(nextLink[1])
                    };
                    return that._http(nextOptions, _.union(prevBody, body));
                }
            }
            if(prevBody){
                return _.union(prevBody, body);
            }
            return body;
        });
    });
};

Canvas.prototype._querify = function (query) {
    return _.merge({}, this.query, _.isString(query) ? qs.parse(query) : query);
};

Canvas.prototype.delete = function (endpoint, querystring, qsStringifyOptions) {
    var options = {
        method: 'DELETE',
        url: this._buildApiUrl(endpoint),
        qs: this._querify(querystring),
        qsStringifyOptions: qsStringifyOptions
    };

    return this._http(options);
};

Canvas.prototype.get = function (endpoint, querystring, qsStringifyOptions) {
    var options = {
        method: 'GET',
        url: this._buildApiUrl(endpoint),
        qs: this._querify(querystring),
        qsStringifyOptions: qsStringifyOptions
    };

    return this._http(options);
};

Canvas.prototype.post = function (endpoint, querystring, form, qsStringifyOptions) {
    var options = {
        method: 'POST',
        url: this._buildApiUrl(endpoint),
        qs: this._querify(querystring),
        qsStringifyOptions: qsStringifyOptions,
        form: form
    };

    return this._http(options);
};

Canvas.prototype.put = function (endpoint, querystring, form, qsStringifyOptions) {
    var options = {
        method: 'PUT',
        url: this._buildApiUrl(endpoint),
        qs: this._querify(querystring),
        qsStringifyOptions: qsStringifyOptions,
        form: form
    };

    return this._http(options);
};

function getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min)) + min;
}

module.exports = Canvas;
