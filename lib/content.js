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

  _read(n) {
    while (n > 0) {
      const it = this._iterator.next();
      if (it.done) {
        this.push(null);
        return;
      }

      if (!this.push(it.value)) {
        return;
      }
      
      n -= it.value.length;
    }
  }
}

async function createFormStream(object, options) {
  object = Object.assign({}, object);

  return new Content("application/x-www-form-urlencoded", form(object), options);

  function *form(object) {
    let sep = false;
    for(const k of Object.getOwnPropertyNames(object)) {
      const encodedKey = encodeURIComponent(k);

      const value = object[k];
      if (Array.isArray(value)) {
        for(const v of value) {
          if (sep)
            yield "&";
          else
            sep = true;

          yield encodedKey+"="+encodeFormComponent(v);
        }
      }
      else {
        if (sep)
          yield "&";
        else
          sep = true;

        yield encodedKey+"="+encodeFormComponent(value);
      }
    }
  }
}

async function createMultipartStream(object, options) {
  object = Object.assign({}, object);
  const boundary = "--------" + randomBytes(10).toString('hex');
  //                01234567

  return new Content("multipart/form-data; boundary=" + boundary, multipart(object), options);

  function *multipart(object) {
    for(const key of Object.getOwnPropertyNames(object)) {
      let values = object[key];
      if (!Array.isArray(values))
        values = [values];

      for(const value of values) {
        yield "--" + boundary + "\r\n";
        yield "Content-Disposition: form-data; name=\""+key+"\"\r\n";
        yield "\r\n"
        yield value.toString(); // use a buffer ?
        yield "\r\n";
      }
    }

    yield "--" + boundary + "--\r\n";
  }
}

module.exports = {
  createFormStream,
  createMultipartStream,
}
