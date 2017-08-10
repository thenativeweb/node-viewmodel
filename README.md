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
            // authSource: 'authedicationDatabase',        // optional
      	    // username: 'technicalDbUser',                // optional
      	    // password: 'secret'                          // optional
            // url: 'mongodb://user:pass@host:port/db?opts // optional
        },
        function(err, repository) {
            if(err) {
                console.log('ohhh :-(');
                return;
            }
        }
    );

## Catch connect ad disconnect events

    var repository = viewmodel.write({ type: 'mongodb' });
    repository.on('connect', function() {
        console.log('hello from event');
    });
    repository.on('disconnect', function() {
        console.log('bye');
    });
    repository.connect();

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
    // or
    //dummyRepo.find({ 'deep.prop': 'dark' }, function(err, vms) {
    // or
    //dummyRepo.find({ age: { $gte: 10, $lte: 20 } }, function(err, vms) {
    // or
    //dummyRepo.find({ $or: [{age: 18}, {special: true}] }, function(err, vms) {
    // or
    //dummyRepo.find({ age: { $in: [1, 2, 3, 6] } }, function(err, vms) {
        if(err) {
            console.log('ohhh :-(');
            return;
        }

        // vms is an array of all what is in the repository
        var firstItem = vms[0];
        console.log('the id: ' + firstItem.id);
        console.log('the saved value: ' + firstItem.get('color'));
    });

## Find with query options

    // the query object ist like in mongoDb...
    dummyRepo.find({ color: 'green' }, { limit: 2, skip: 1, sort: { age: 1 } }, function(err, vms) {
    // or
    //dummyRepo.find({ color: 'green' }, { limit: 2, skip: 1, sort: [['age', 'desc']] }, function(err, vms) {
        if(err) {
            console.log('ohhh :-(');
            return;
        }

        // vms is an array of all what is in the repository
        var firstItem = vms[0];
        console.log('the id: ' + firstItem.id);
        console.log('the saved value: ' + firstItem.get('color'));
    });

## FindOne

    // the query object ist like in mongoDb...
    dummyRepo.findOne({ color: 'green' }, function(err, vm) {
        if(err) {
            console.log('ohhh :-(');
            return;
        }

        console.log('the id: ' + vm.id);
        if (vm.has('color')) {
            console.log('the saved value: ' + vm.get('color'));
        }
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

## Clear a "collection" (only in write mode)

    dummyRepo.clear(function(err) {
        if(err) {
            console.log('ohhh :-(');
            return;
        }
    });


# Implementation differences

## mongodb
For mongodb you can define indexes for performance boosts in find function.

    var dummyRepo = repository.extend({
        collectionName: 'dummy',
        // like that
        indexes: [
            'profileId',
            // or:
            { profileId: 1 },
            // or:
            { index: {profileId: 1}, options: {} }
        ]
        // or like that
        repositorySettings : {
            mongodb: {
                indexes: [ // same as above
                    'profileId',
                    // or:
                    { profileId: 1 },
                    // or:
                    { index: {profileId: 1}, options: {} }
                ]
            }
        }
    });

## redis
The find function does ignore the query argument and always fetches all items in the collection.

## Elasticsearch >= 5.X
Use the 'elasticsearch6' type for Elasticsearch versions 5.X and 6.X.

The find queries are not mongoDb compatible as the rest of the implementations due to the uneeded overhead and complexity of converting between both formats.

For find queries with elasticsearch6 use elasticsearch [native elastic Query DSL](https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html);

repository.find( onlyTheQueryClause, otherBodyOptions, callback);

```javascript
    repository.find(
        {
            range : {
                age : {
                    gte : 10,
                    lte : 20
                }
            }
        ),
        {
            from: 0,
            size: 10,
            sort: { age: 'asc' }
        },
        function(error, results) {
        });
```

Additionaly for elasticsearch6 the number of shards, number of replicas, the refresh behaivour on index and the mappings on index create can be addtionaly defined to optimize performace.

```javascript
    var dummyRepo = repository.extend({
        collectionName: 'dummy',
        repositorySettings: {
            elasticsearch6: {
                refresh: 'wait_for', // optional, refresh behaviour on index, default is true ( ie. force index refresh ) https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-refresh.html                
                waitForActiveShards: 2 // optional, defaults to 1 ( ie. wait only for primary ) https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-create-index.html#create-index-wait-for-active-shards
                index: { // optional applied on index create, https://www.elastic.co/guide/en/elasticsearch/reference/6.x/indices-create-index.html
                    settings : { // will be merged with the default ones,
                        number_of_shards: 3, // optional defaults to 1,
                        number_of_replicas: 1 // optional defaults to 0,
                    },
                    mappings : { // optiona will be merged with the default ones,
                        properties: { // specific properties to not be handled by dynamic mapper
                            title: {
                                type: "text"
                            }
                        }                    
                    }
                }
            }
        }
    });
```


# [Release notes](https://github.com/adrai/node-viewmodel/blob/master/releasenotes.md)

# Database Support
Currently these databases are supported:

1. inmemory
2. mongodb ([node-mongodb-native] (https://github.com/mongodb/node-mongodb-native))
3. couchdb ([cradle] (https://github.com/cloudhead/cradle))
4. tingodb ([tingodb] (https://github.com/sergeyksv/tingodb))
5. redis ([redis] (https://github.com/mranney/node_redis))
6. azuretable ([azure-storage](https://github.com/Azure/azure-storage-node))
7. documentdb ([documentdb](https://github.com/Azure/azure-documentdb-node), [doqmentdb](https://github.com/a8m/doqmentdb))
8. elasticsearch ([elasticsearch] (https://github.com/elastic/elasticsearch-js))
9. elasticsearch6 ([elasticsearch] (https://github.com/elastic/elasticsearch-js)) - for Elasticsearch 5.x and 6.x
10. dynamodb ([aws-sdk] (https://github.com/aws/aws-sdk-js))

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

Copyright (c) 2017 Adriano Raiano

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
