# Introduction

[![travis](https://img.shields.io/travis/adrai/node-viewmodel.svg)](https://travis-ci.org/adrai/node-viewmodel) [![npm](https://img.shields.io/npm/v/viewmodel.svg)](https://npmjs.org/package/viewmodel)

Node-viewmodel is a node.js module for multiple databases.
It can be very useful if you work with (d)ddd, cqrs, eventdenormalizer, host, etc.

# Installation

    $ npm install viewmodel

# Usage

## Connecting to an in-memory repository in read mode

	var viewmodel = require('viewmodel');

	viewmodel.read(function(err, repository) {
        if(err) {
            console.log('ohhh :-(');
            return;
        }
    });

## Connecting to any repository (mongodb in the example / mode=write)
Make shure you have installed the required driver, in this example run: 'npm install mongodb'.

    var viewmodel = require('viewmodel');

    viewmodel.write(
        {
            type: 'mongodb',
            host: 'localhost',      // optional
            port: 27017,            // optional
            dbName: 'viewmodel',    // optional
            timeout: 10000          // optional
        }, 
        function(err, repository) {
            if(err) {
                console.log('ohhh :-(');
                return;
            }
        }
    );

## Define a collection...

    var dummyRepo = repository.extend({
        collectionName: 'dummy'
    });

## Create a new viewmodel (only in write mode)

    dummyRepo.get(function(err, vm) {
        if(err) {
            console.log('ohhh :-(');
            return;
        }

        vm.set('myProp', 'myValue');
        vm.set('myProp.deep', 'myValueDeep');

        console.log(vm.toJSON());

        console.log(vm.has('myProp.deep'));

        dummyRepo.commit(vm, function(err) {
        });
        // or you can call commit directly on vm...
        vm.commit(function(err) {
        });
    });

## Find...

    // the query object ist like in mongoDb...
    dummyRepo.find({ color: 'green' }, function(err, vms) {
        if(err) {
            console.log('ohhh :-(');
            return;
        }

        // vms is an array of all what is in the repository
        var firstItem = vms[0];
        console.log('the id: ' + firstItem.id);
        console.log('the saved value: ' + firstItem.get('color'));
    });

## Find by id...

    // the query object ist like in mongoDb...
    dummyRepo.get('myId', function(err, vm) {
        if(err) {
            console.log('ohhh :-(');
            return;
        }

        console.log('the id: ' + vm.id);
        console.log('the saved value: ' + vm.get('color'));
    });

## Delete a viewmodel (only in write mode)

    dummyRepo.get('myId', function(err, vm) {
        if(err) {
            console.log('ohhh :-(');
            return;
        }

        vm.destroy();

        dummyRepo.commit(vm, function(err) {
        });
        // or you can call commit directly on vm...
        vm.commit(function(err) {
        });
    });

## Obtain a new id

    myQueue.getNewId(function(err, newId) {
        if(err) {
            console.log('ohhh :-(');
            return;
        }

        console.log('the new id is: ' + newId);
    });


# Implementation differences

## mongodb
For mongodb you can define indexes for performance boosts in find function.

    var dummyRepo = repository.extend({
        collectionName: 'dummy',
        indexes: [
            { profileId: 1 },
            // or:
            { index: {profileId: 1}, options: {} }
        ]
    });

## redis
The find function does ignore the query argument and always fetches all items in the collection.


#[Release notes](https://github.com/adrai/node-viewmodel/blob/master/releasenotes.md)

# Database Support
Currently these databases are supported:

1. inmemory
2. mongodb ([node-mongodb-native] (https://github.com/mongodb/node-mongodb-native))
3. couchdb ([cradle] (https://github.com/cloudhead/cradle))
4. tingodb ([tingodb] (https://github.com/sergeyksv/tingodb))
5. redis ([redis] (https://github.com/mranney/node_redis))

## own db implementation
You can use your own db implementation by extending this...

    var Repository = require('viewmodel').Repository,
    util = require('util'),
        _ = require('lodash');

    function MyDB(options) {
      Repository.call(this, options);
    }

    util.inherits(MyDB, Repository);

    _.extend(MyDB.prototype, {

      ...

    });

    module.exports = MyDB;



# License

Copyright (c) 2014 Adriano Raiano

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
