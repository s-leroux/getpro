"use strict";
const { Readable } = require("stream");

const {
  randomBytes,
} = require("crypto");

function encodeFormComponent(str) {
  return encodeURIComponent(str).replace(/%20/g,"+");
}

class Content extends Readable {
  constructor(mimetype, iterator, options) {
    super(options);

    this._mimetype = mimetype;
    this._iterator = iterator;
  }

  get mimetype() {
    return this._mimetype;
  }

  async readAsync(n) {
    while (n > 0) {
      const it = this._iterator.next();
      if (it.done) {
        this.push(null);
        return;
      }

      const value = await it.value;
      if (value) {
        if (!this.push(value)) {
          return;
        }

        n -= value.length;
      }
    }

  }

  _read(n) {
    this.readAsync(n)
      .catch((err) => {
        this.emit("error", err);
      });
  }
}

/**
 *  EXPERIMENTAL
 */
async function defaultFilter(kv, dequeue) {
  return {
    key: kv.key,
    value: kv.value.toString(),
  };
}

/**
 *  EXPERIMENTAL
 */
async function defaultObjectFilter(kv, dequeue) {
  throw new Error("Nested data structure are not supported in forms");
}

/**
 *  EXPERIMENTAL
 */
async function defaultArrayFilter(kv, dequeue) {
  const a = kv.value;
  const k = kv.key;
  let i = a.length;
  while(i--) {
    dequeue.unshift({ key: k, value: a[i] });
  }
}

/**
 *  EXPERIMENTAL
 */
function *fieldGenerator(object, filters) {
  const dequeue = [];
  for(const k of Object.getOwnPropertyNames(object)) {
    dequeue.push({ key: k, value: object[k] });
  }

  while(dequeue.length) {
    let kv = dequeue.shift();
    let filter;

    if (Array.isArray(kv.value)) {
      filter = filters.array || defaultArrayFilter;
    }
    else switch (typeof kv.value) {
    case "object":
      filter = filters.object || defaultObjectFilter;
      break;
    default:
      filter = filters[typeof kv.value] || defaultFilter;
    }

    yield filter(kv, dequeue);
  }
}

async function createFormStream(object, options) {
  const filters = options?.filters || {};
  let sep = "";
  object = Object.assign({}, object);

  return new Content("application/x-www-form-urlencoded", encoder(object, filters), options);

  function *encoder(object, filters) {
    for(const kv of fieldGenerator(object, filters)) {
      yield Promise.resolve(kv).then((kv) => kv && formFieldEncode(kv));
    }
  }

  function formFieldEncode(kv) {
    const encodedKey = encodeURIComponent(kv.key);
    const encodedValue = encodeFormComponent(kv.value);
    const result = sep + encodedKey + "=" + encodedValue;

    sep = "&";
    return result;
  }
}

async function createMultipartStream(object, options) {
  const filters = options?.filters || {};
  object = Object.assign({}, object);
  const boundary = "--------" + randomBytes(10).toString("hex");
  //                01234567

  return new Content("multipart/form-data; boundary=" + boundary, encoder(object, filters), options);

  function *encoder(object, filters) {
    for(const kv of fieldGenerator(object, filters)) {
      yield kv.then((kv) => kv && multipartEncode(kv));
    }
    yield "--" + boundary + "--\r\n";
  }

  function multipartEncode(kv) {
    return "--" + boundary + "\r\n" +
      "Content-Disposition: form-data; name=\""+kv.key+"\"\r\n" +
      "\r\n" +
      kv.value.toString() + // use a buffer ?
      "\r\n";
  }
}

module.exports = {
  createFormStream,
  createMultipartStream,
};
