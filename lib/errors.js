"use strict";

const {
  E,
  codes,
} = require("@yesik/errors");

E("HttpInvalidProtocolError");
E("HttpProtocolError");
E("HttpStatusError");
E("HttpTooManyRedirectsError", codes.HttpProtocolError);
E("HttpUnsupportedEncodingError", codes.HttpProtocolError);

module.exports = { codes };
