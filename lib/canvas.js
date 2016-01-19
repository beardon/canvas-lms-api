'use strict';

var _ = require('underscore');
var Promise = require('bluebird');
var request = Promise.promisify(require('request'));
var resolve = require('url').resolve;
var qs = require('qs');
var merge = require('lodash.merge');
var isString = require('lodash.isstring');
var parseLink = require('parse-link-header');

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
    if (endpoint.substring(0, 1) != '/') {
        endpoint = '/' + endpoint;
    }

    return resolve(this.host,  '/api/' + this.apiVersion + endpoint);
};

Canvas.prototype._http = function (options, prevBody) {
    var that = this;
    options.headers = {
        Authorization: 'Bearer ' + this.accessToken
    };

    options.json = true;

    return request(options)
        .spread(function (response, body) {
            if ((response.statusCode !== 200) && (response.statusCode !== 201)) {
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
            return _.union(prevBody, body);
        });
};

Canvas.prototype._querify = function (query) {
    if (isString(query)) {
        query = qs.parse(query);
    }

    return merge({}, this.query, query);
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

module.exports = Canvas;
