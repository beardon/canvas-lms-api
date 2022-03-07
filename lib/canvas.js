import delay from 'delay';
import fetch from 'node-fetch';
import merge from 'lodash.merge';
import parseLink from 'parse-link-header';
import qs from 'qs';
import { resolve } from 'url';
import union from 'lodash.union';

function Canvas(host, options) {
    options = options || {};
    options.json = true;
    this.name = 'canvas';
    this.accessToken = options.accessToken || options.token || '';
    this.apiVersion = options.apiVersion || options.version || 'v1';
    this.query = options.query || {};
    this.host = host;
    this.qsStringifyOptions = { arrayFormat: 'brackets' };
}

function random(low, high) {
  return low + Math.floor(Math.random() * (high - low + 1));
};

Canvas.prototype._buildApiUrl = function (endpoint) {
    return resolve(this.host,  '/api/' + this.apiVersion + (endpoint[0] === '/' ? '' : '/') + endpoint);
};

Canvas.prototype._http = function (options, prevBody) {
    options.headers = {
        Authorization: 'Bearer ' + this.accessToken,
        'Content-Type': 'application/json'
    };

    // If we've exhausted half the rate limit start delaying our requests so we don't run out the rest
    let throttle = 0;

    if (this.rateLimitRemaining && this.rateLimitRemaining < this.rateLimitMax / 2) {
       throttle = random(50, 100);
    }

    const url = `${options.url}${options.qs && qs.stringify(options.qs) !== "" ? "?" + qs.stringify(options.qs, options.qsStringifyOptions): ""}`
    const myOptions = {...options};
    delete myOptions.url;
    delete myOptions.qs;
    delete myOptions.qsStringifyOptions;

    const that = this;
    return delay(throttle)
        .then(function () {
            return fetch(url, myOptions);
        })
        .then(async response => [response, await response.text()])
        .then(([response, body]) => {
            if (!response.ok) {
                // Check for throttling and retry after a delay
                if (response.status === 403 && /Rate Limit Exceeded/.test(body)) {
                    // Use a random delay so that we don't retry a ton of requests at the same time and exhaust the limit again
                    return delay(random(200, 500))
                        .then(function () {
                            return that._http(options, prevBody);
                        });
                }

                const err = new Error();
                body = JSON.parse(body);
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
            body = JSON.parse(body);
            if (!this.rateLimitMax) {
                this.rateLimitMax = response.headers.get('x-rate-limit-remaining');
            }

            this.rateLimitRemaining = response.headers.get('x-rate-limit-remaining');

            if (response.headers.get("link")) {
                let nextLink = parseLink(response.headers.get("link"));

                if (nextLink.next) {
                    nextLink = nextLink.next.url.split('?');

                    const nextOptions = {
                        method: options.method,
                        url: nextLink[0],
                        qs: qs.parse(nextLink[1]),
                        qsStringifyOptions: this.qsStringifyOptions
                    };

                    return that._http(nextOptions, union(prevBody, body));
                }
            }

            if (prevBody) {
                return union(prevBody, body);
            }

            return body;
        });
};

Canvas.prototype._querify = function (query) {
    return merge({}, this.query, query && typeof query.valueOf() === "string" ? qs.parse(query) : query);
};

Canvas.prototype.delete = function (endpoint, querystring, qsStringifyOptions) {
    const options = {
        method: 'DELETE',
        url: this._buildApiUrl(endpoint),
        qs: this._querify(querystring),
        qsStringifyOptions: qsStringifyOptions || this.qsStringifyOptions
    };

    return this._http(options);
};

Canvas.prototype.get = function (endpoint, querystring, qsStringifyOptions) {
    const options = {
        method: 'GET',
        url: this._buildApiUrl(endpoint),
        qs: this._querify(querystring),
        qsStringifyOptions: qsStringifyOptions || this.qsStringifyOptions
    };

    return this._http(options);
};

Canvas.prototype.post = function (endpoint, querystring, form, qsStringifyOptions) {
    const options = {
        method: 'POST',
        url: this._buildApiUrl(endpoint),
        qs: this._querify(querystring),
        qsStringifyOptions: qsStringifyOptions || this.qsStringifyOptions,
        body: JSON.stringify(form)
    };

    return this._http(options);
};

Canvas.prototype.put = function (endpoint, querystring, form, qsStringifyOptions) {
    const options = {
        method: 'PUT',
        url: this._buildApiUrl(endpoint),
        qs: this._querify(querystring),
        qsStringifyOptions: qsStringifyOptions || this.qsStringifyOptions,
        body: JSON.stringify(form)
    };

    return this._http(options);
};

export default Canvas;
