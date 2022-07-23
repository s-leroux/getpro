"use strict";
const Promise = require("bluebird");
//const debug = require("debug")("getpro:");
const http = require("http");
const https = require("https");
const zlib = require("zlib");
const obut = require("obut");

const { URL, urlToHttpOptions } = require("url");
const { Writable, Transform } = require("stream");
const {
  createFormStream,
  createMultipartStream,
} = require("./content.js");

const {
  HttpInvalidProtocolError,
  HttpProtocolError,
  HttpStatusError,
  HttpTooManyRedirectsError,
  HttpUnsupportedEncodingError,
} = require("./errors.js").codes;

const MAX_REDIRECTS = 10;
const CHARSET_RE = /charset=([^\s;]*)/;

function sanityze(err) {
  return obut.pick(err, {
    httpVersionMajor: undefined,
    httpVersionMinor: undefined,
    httpVersion: undefined,
    headers: undefined,
    rawHeaders: undefined,
    tailers: undefined,
    rawTrailers: undefined,
    url: undefined,
    method: undefined,
    statusCode: undefined,
    statusMessage: undefined,
    client: { _host: undefined },
    req: {
      _header: undefined,
      method: undefined,
      path: undefined,
    },
  });
}

/**
 *  Convert an URL object into an ordinary option object suitable for http.request
 *
 *  Starting with v14.18.0, Node.js provides this utility method. Fallback to
 *  our implementation if it's not defined.
 */
function _urlToHttpOptions(url) {
  if (urlToHttpOptions) {
    return urlToHttpOptions(url);
  }
  else {
    const options = {
      hash: url.hash,
      hostname: url.hostname,
      href: url.href,
      path: `${url.pathname || ''}${url.search || ''}`,
      pathname: url.pathname,
      protocol: url.protocol,
      search: url.search,
    };

    if (typeof options.hostname === 'string' && options.hostname.startsWith('[')) {
      options.hostname = options.hostname.slice(1, -1);
    }
    if (url.port !== '') {
      options.port = Number(url.port);
    }
    if (url.username || url.password) {
      options.auth = `${url.username}:${url.password}`;
    }

    return options;
  }
}

/**
 *  An instance of HTTP response
 *
 *  Wrapper arroung node's native response object.
 */
class Response extends Transform {
  constructor(res) {
    super();

    this._consumer = false;
    this._done = false;
    this._buffer = null;
    this._node_res = res;
    this._stream = res;

    // copy public properties
    this.headers = res.headers;
    this.statusCode = res.statusCode;

    const content_encoding = this.headers["content-encoding"] || "identity";
    switch(content_encoding) {
    case "gzip":
      this._stream = zlib.createGunzip();
      this._node_res.pipe(this._stream);
      break;
    case "identity":
      break;
    default:
      throw new HttpUnsupportedEncodingError("unsupported encoding " + content_encoding, { response: sanityze(res) });
    }

    this._stream.pipe(this);
  }

  /**
   *  Returns the raw data.
   *
   *  This method will load the entire response into memory.
   */
  get data() {
    if (this._done) {
      return Promise.resolve(this._buffer);
    }
    else return new Promise((resolve, reject) => {
      const chunks = [];

      this.on("error", (err) => { this._done = true; reject(err); });
      this.on("data", (chunk) => { chunks.push(chunk); });
      this.on("end", () => {
        this._done = true;
        if (chunks.length > 0) {
          if (typeof chunks[0] === "string") {
            this._buffer = chunks.join();
          }
          else {
            this._buffer = Buffer.concat(chunks);
          }
        }
        //console.log(this._buffer.toString("utf8"));
        resolve(this._buffer);
      });
    });
  }

  get json() {
    return this.data.then(JSON.parse);
  }

  get text() {
    return this.data.then((buffer) => buffer.toString());
  }

  /**
   *  Consumer interface
   *
   *  Return the payload chunk by chunk into a promise.
   *  The promise resolves to `undefined` when the stream is exhausted.
   */
  consume() {
    if (this._done)
      return Promise.resolve();
    else return new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;

      if (!this._consumer) {
        this._consumer = true;

        /*
        We need a 'magic' indirection here to invoke the current resolve/reject
        functions and not the one bound when the callback was initially created
        */
        this.on("data", (chunk) => { this.pause(); this._resolve(chunk); });
        this.on("end", () => { this._done = true; this._resolve(); });
        this.on("error", (err) => { this._done = true; this._reject(err); });
      }
      else {
        this.resume();
      }
    });
  }

  /**
   *  Discard the response content
   */
  flush() {
    async function _flush(self) {
      while ((await self.consume())) {
        /* do nothing */
      }
    }

    return _flush(this);
  }

  /**
   *  @module ResponseStreamInterface
   */
  _transform(chunk, encoding, cb) {
    // console.log("transform", (chunk) ? chunk.length : "null");
    cb(null, chunk);
  }
}

/**
 *  An instance of a HTTP request.
 *
 *  Wrapper arroung node's native request object.
 */
class Request extends Writable {
  constructor(url, options) {
    super(options);

    this._ended = false;
    this._canRedirect = MAX_REDIRECTS;
    this._resPromise = new Promise((resolve, reject) => {
      this._resResolve = resolve;
      this._resReject = reject;
    });

    this.request(url, options);
  }

  request(url, options) {
    options = Object.assign({}, options);
    options.headers = options.headers || {};

    const failOnError = !(options.failOnError===false);
    const acceptGzip = !(options.acceptGzip===false);


    if (typeof url == "string") {
      url = new URL(url);
    }

    this._url = url;

    let protocol = null;
    if (url.protocol == "http:")
      protocol = http;
    else if (url.protocol == "https:")
      protocol = https;
    else
      return Promise.reject(HttpInvalidProtocolError("Unsupported protocol "+protocol, {url}));

    if (acceptGzip && (options.headers["Accept-Encoding"] === undefined)) {
      options.headers["Accept-Encoding"] = "gzip, deflate";
    }

    // Older versions of Node only had a 2-parameter request method.
    // Some libraries (notably `agent-base`) patch https.request
    // but do not handle the 3-parameter version of the method.
    options = Object.assign(options, _urlToHttpOptions(url));

    this._node_req = protocol.request(options, (res) => {
      if (!failOnError || (res.statusCode >= 200 && res.statusCode < 300)) {
        const contentType = res.headers["Content-Type"];
        let matches;

        if (contentType && (matches = CHARSET_RE.exec(contentType))) {
          res.setEncoding(matches[1]);
        }


        return this._resResolve(new Response(res));
      }
      else if (res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.headers["location"];

        if (location && this._canRedirect--) {
          this.request(new URL(location, url), options);
          if (this._ended) {
            this._node_req.end();
          }
          return this._resPromise;
        }

        // else
        if (!location) {
          return this._resReject(new HttpProtocolError("http redirect without a location", {response: sanityze(res) }));
        } else {
          return this._resReject(new HttpTooManyRedirectsError("Maximum redirects exceeded", {response: sanityze(res) }));
        }
      } else {
        this._resReject(new HttpStatusError("Bad status: " + res.statusCode, {response: sanityze(res)}));
      }
    }).on("error", (e) => this._resReject(e));
  }

  /**
   *  Sets a single header value.
   */
  setHeader(name, value) {
    this._node_req.setHeader(name, value);

    return this;
  }

  /**
   *  Attach JSON-encoded data as the request's payload
   */
  json(data) {
    const req = this._node_req;

    if (!req.hasHeader("Content-Type")) {
      req.setHeader("Content-Type", "application/json");
    }

    const json = JSON.stringify(data);
    req.setHeader("content-length", json.length);
    this.write(json);
    this.end();

    return this._resPromise;
  }

  /**
   *  Attach text as the request's payload
   */
  text(data) {
    const req = this._node_req;

    if (!req.hasHeader("Content-Type")) {
      req.setHeader("Content-Type", "text/plain; encoding=utf-8");
    }

    const buffer = Buffer.from(data, "utf8");
    req.setHeader("content-length", buffer.length);
    this.write(buffer);
    this.end();

    return this._resPromise;
  }

  /**
   *  Attach form  data as the request's payload
   *
   *  The data is a assumed to be a JavaScript objet whose properties
   *  will be send as key-value pairs encoded according to
   *  the multipart/form-data media type (see RFC 2388).
   */
  form(data) {
    return this.streamContent(createMultipartStream(data));
  }

  /**
   *  Attach data as the request's payload
   *
   *  If content is an object, the data will be form-encoded and the
   *  Content-Type header will be set to `application/x-www-form-urlencoded`
   *
   *  If the content is a string, the data will be send as-is.
   *  No Content-type header will be set.
   */
  data(content) {
    const req = this._node_req;

    if (typeof content !== "string") {
      return this.streamContent(createFormStream(content));
    }

    /* else */

    req.setHeader("Content-Length", content.length);
    this.write(content);
    this.end();

    return this._resPromise;
  }

  streamContent(content) {
    const req = this._node_req;
    return content
      .then((stream) => {
        if (!req.hasHeader("Content-Type")) {
          req.setHeader("Content-Type", stream.mimetype);
        }

        req.setHeader("Transfer-Encoding", "chunked"); // force transfer encoding to chunked. Was removed by defaut in node 0.10 for DELETE
        stream.pipe(this);
      })
      .catch((err) => this._resReject(err))
      .then(() => this._resPromise);
  }

  then(cont) {
    return this.end().then(cont);
  }

  /**
   * @module RequestStreamInterface
   */

  /**
   * Signal that the request is complete.
   *
   * @memberof RequestStreamInterface
   */
  end(chunk, encoding, cb) {
    super.end(chunk, encoding, cb);
    return this._resPromise;
  }

  _final(cb) {
    this._ended = true;
    this._node_req.end(cb);
  }

  /**
   * Write some data to the stream
   *
   * @memberof RequestStreamInterface
   */
  _write(chunk, encoding, cb) {
    return this._node_req.write(chunk, encoding, cb);
  }
}

function method(verb) {
  return function(url, options={}) {
    options.method = verb;
    return new Request(url, options);
  };
}

module.exports = {
  get(url, options={}) {
    return new Request(url, options).end();
  },
  request:  {
    delete: method("DELETE"),
    get: method("GET"),
    head: method("HEAD"),
    patch: method("PATCH"),
    post: method("POST"),
    put: method("PUT"),
  }
};
