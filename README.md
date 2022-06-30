getpro
======

A simple promise-based wrapper arround NodeJS to download files using
http/http.


[![Build Status](https://github.com/s-leroux/getpro/actions/workflows/npm-test.yml/badge.svg)](https://github.com/s-leroux/getpro/actions/workflows/npm-test.yml)

## Installation

    npm install --save getpro
    
## Description

`getpro` is designed for no-caching asynchronous promise-oriented file download
over http/https.


* promise-oriented
* very little dependencies
* follows 3xx redirections
* reject promise in case of 4xx or 5xx response or error (no synchronous exceptions thrown)
* supports the _stream_ interface (so you can `.pipe` data as fast as they arrive)
* supports the _consumer_ interface to obtain a `Promise` that will be resolved
when the next chuck of data arrives or when the stream is exhausted

The _consumer_ interface integrates nicely with ECMAScript 2017 asynchronous functions (async/await) as well as with bluebird coroutines (see examples below).

## Basic usage

    const gp = require('getpro');
    
    // Stream interface
    const fs = require('fs');
    
    gp.get('http://httpbingo.org/encoding/utf8')
      .then((res) => {
        const output = fs.createWriteStream('/tmp/utf8');
        res.pipe(output);
      });
      
    // Consumer interface (bluebird coroutine)
    const Promise = require('bluebird');
    gp.get('http://httpbingo.org/encoding/utf8')
      .then(Promise.coroutine(function*(res) {
        let chunk = null;

        while (chunk = yield res.consume()) {
          console.log(chunk);
        };
      }));

      
    // Consumer interface (ECMAScript 2017 (ECMA-262) async/await)
    gp.get('http://httpbingo.org/encoding/utf8')
      .then(async function (res) {
        let chunk = null;

        while (chunk = await res.consume()) {
          console.log(chunk);
        };
      });

## Advanced usage

The advanced interface available through the `request` object allows greater control on the request.
This is especially usefull for requests with a body (like the POST request):

    const { request } = require('getpro');
    
    // Stream interface
    const fs = require('fs');
    
    request.get('http://httpbingo.org/encoding/utf8')
      .setHeader("accept-encoding", "deflate")
      .then((res) => {
        const output = fs.createWriteStream('/tmp/utf8');
        res.pipe(output);
      });

    request.post('http://httpbingo.org/post')
      .json({some: "data"})
      .then((res) => {
        const output = fs.createWriteStream('/tmp/out.json');
        res.pipe(output);
      });


## Node version
Requires NodeJS >= v12.0
Tested with v12.0 and v14.15
 
## License 

(The MIT License)

Copyright (c) 2018-2022 [Sylvain Leroux](mailto:sylvain@chicoree.fr)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
