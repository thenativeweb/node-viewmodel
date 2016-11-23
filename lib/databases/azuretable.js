'use strict';

var util = require('util'),
    Repository = require('../base'),
    ViewModel = Repository.ViewModel,
    ConcurrencyError = require('../concurrencyError'),
    azure = Repository.use('azure-storage'),
    async = require('async'),
    uuid = require('uuid').v4,
    _ = require('lodash'),
    jsondate = require('jsondate'),
    eg = azure.TableUtilities.entityGenerator,
    collections = [];

//helpers
function generateEntity(obj) {
    var entity = _.clone(obj);
    for (var property in entity) {
        if (property !== '_metadata') {
            if (_.isArray(entity[property])) {
                entity[property] = eg.String(JSON.stringify(entity[property]));
                continue;
            }
            if (_.isBoolean(entity[property])) {
                entity[property] = eg.Boolean(entity[property]);
                continue;
            }
            if (_.isDate(entity[property])) {
                entity[property] = eg.DateTime(entity[property]);
                continue;
            }
            if (_.isString(entity[property])) {
                entity[property] = eg.String(entity[property]);
                continue;
            }
            if (_.isObject(entity[property])) {
                entity[property] = eg.String(JSON.stringify(entity[property]));
                continue;
            }

            entity[property] = eg.Entity(entity[property]);
        }
    }
    return entity;
}

var generateObject = function (entity) {
    var obj = _.clone(entity);
    obj._link = {'$': 'Edm.String', '_': entity.PartitionKey._ + '#' + entity.RowKey._};

    obj = _.omit(obj, 'PartitionKey', 'RowKey', 'Timestamp', '.metadata');


    function isJsonString(str) {
        try {
            jsondate.parse(str);
        } catch (e) {
            return false;
        }
        return true;
    }

    for (var property in obj) {
        if (property !== '.metadata') {
            if (isJsonString(obj[property]['_'])) {
                obj[property]['_'] = jsondate.parse(obj[property]['_']);
                if (!_.isArray(obj[property]['_'])
                    && !_.isObject(obj[property]['_'])
                    && obj[property]['$']
                    && obj[property]['$'] == 'Edm.String') {
                    obj[property]['_'] = obj[property]['_'].toString();
                }
            }
            obj[property] = obj[property]['_'];
        }
    }
    return obj;
};

var defaultQueryValues = function (queryValue) {
    var IsJsonString = function IsJsonString(str) {
        var parsed = true;
        try {
            parsed = jsondate.parse(str);
        } catch (e) {
            return false;
        }
        return _.isObject(parsed);
    };

    if (IsJsonString(queryValue)) {
        queryValue = JSON.parse(queryValue);
    } else {
        queryValue = {value: queryValue, operator: 'eq', isDate: false};
    }
    return _.defaults(queryValue, {operator: 'eq', isDate: false});
}

// Class
function AzureTable(options) {
    Repository.call(this, options);

    options = options || {};

    var azureConf = {
        storageAccount: 'nodeeventstore',
        storageAccessKey: 'aXJaod96t980AbNwG9Vh6T3ewPQnvMWAn289Wft9RTv+heXQBxLsY3Z4w66CI7NN12+1HUnHM8S3sUbcI5zctg==',
        storageTableHost: 'https://nodeeventstore.table.core.windows.net/'
    };

    this.options = _.defaults(options, azureConf);
}

util.inherits(AzureTable, Repository);

_.extend(AzureTable.prototype, {

    connect: function (callback) {
        var retryOperations = new azure.ExponentialRetryPolicyFilter();

        var self = this;

        this.client = azure.createTableService(this.options.storageAccount, this.options.storageAccessKey, this.options.storageTableHost).withFilter(retryOperations);

        self.emit('connect');

        if (callback) callback(null, self);
    },

    disconnect: function (callback) {
        this.emit('disconnect');
        if (callback) callback(null);
    },

    get: function (id, callback) {

        var self = this;
        var options = {};

        if (_.isFunction(id)) {
            callback = id;
            id = null;
        }

        if (!id) {
            id = uuid().toString();
        }
//Id can be a 'link' : 'PartitionKey#RowKey'
        var PartitionKey = id;
        var RowKey = id;

        if (id.indexOf('#') > -1) {
            PartitionKey = id.substring(0, id.indexOf('#'))
            RowKey = id.substring(id.indexOf('#') + 1);
        }

        options.autoResolveProperties = true;
        //options.entityResolver = generateObject;

        self.checkConnection(function (err) {
            if (err) {
                return callback(err);
            }

            self.client.retrieveEntity(self.collectionName,
                PartitionKey,
                RowKey,
                options,
                function (err, entity) {
                    if (err && err.code != 'ResourceNotFound') {
                        return callback(err);
                    }

                    if (!entity) {
                        return callback(null, new ViewModel({id: id}, self));
                    }

                    entity = generateObject(entity);
                    var vm = new ViewModel(entity, self);
                    vm.actionOnCommit = 'update';
                    callback(null, vm);
                });
        });
    },

    find: function (query, queryOptions, callback) {

        var self = this;

        var options = {
            autoResolveProperties: true,
            entityResolver: generateObject
        };

        queryOptions = _.defaults(queryOptions, {skip: 0, limit: -1});

        var tableQuery = new azure.TableQuery();
        var pageSize = queryOptions.skip + queryOptions.limit;


        tableQuery = _(query)
            .map(function (queryValue, queryKey) {
                if (_.isArray(queryValue)) {
                    return _.map(queryValue, function (qV) {
                        qV = defaultQueryValues(qV);
                        return {
                            key: queryKey + ' ' + qV.operator + ' ?' + (qV.isDate ? 'date?' : ''),
                            value: qV.isDate ? new Date(qV.value) : qV.value
                        }
                    });
                } else {
                    queryValue = defaultQueryValues(queryValue);
                    return {
                        key: queryKey + ' ' + queryValue.operator + ' ?' + (queryValue.isDate ? 'date?' : ''),
                        value: queryValue.isDate ? new Date(queryValue.value) : queryValue.value
                    }
                }
            })
            .flatten()
            .reduce(function (result, val, key) {
                if (result._where.length === 0) return tableQuery.where(val.key, val.value);
                return result.and(val.key, val.value);
            }, tableQuery);

        if (queryOptions.limit !== -1) {
            tableQuery = tableQuery.top(pageSize);
        }

        self.checkConnection(function (err) {
            if (err) {
                return callback(err);
            }

            var entities = [];
            var continuationToken = queryOptions.continuationToken;

            async.doWhilst(function (end) {
                // retrieve entities
                self.client.queryEntities(self.collectionName, tableQuery, continuationToken, options, function (err, results) {
                    if (err) {
                        return end(err);
                    }

                    continuationToken = results.continuationToken;

                    entities = entities.concat(results.entries);

                    end(null);
                });
            }, function () {
                // test if we need to load more
                return (entities.length < pageSize || pageSize == -1) ? continuationToken !== null : false;
            }, function (err) {

                // return results
                if (err) {
                    return callback(err);
                }
                if (queryOptions.skip !== undefined && queryOptions.limit !== undefined) {
                    if (queryOptions.limit === -1) {
                        entities = entities.slice(queryOptions.skip);
                    } else {
                        entities = entities.slice(queryOptions.skip, pageSize);
                    }
                }

                var vms = _.map(entities, function (data) {
                    var vm = new ViewModel(data, self);
                    vm.actionOnCommit = 'update';
                    return vm;
                });

                if (continuationToken) {
                    vms.continuationToken = continuationToken;
                }

                callback(null, vms);
            });
        });
    },

    commit: function (vm, callback) {

        var self = this;

        self.checkConnection(function (err) {
            if (err) {
                return callback(err);
            }

            if (!vm.actionOnCommit) return callback(new Error());

            // let us use custom PartitionKey / RowKey (useful for indexing and sharding)
            var objDescriptor = {
                PartitionKey: eg.String(vm.get('PartitionKey') || vm.id),
                RowKey: eg.String(vm.get('RowKey') || vm.id)
            };

            var obj;

            switch (vm.actionOnCommit) {
                case 'delete':

                    self.client.deleteEntity(self.collectionName, objDescriptor, function (err) {
                        //if (err) {
                        //  if (callback) callback(err);
                        //  return;
                        //}
                        if (callback) callback(null, vm);
                    });

                    break;

                case 'create':

                    obj = vm.toJSON();
                    obj = generateEntity(obj);
                    obj = _.assign(obj, objDescriptor);

                    self.client.insertEntity(self.collectionName, obj, function (err) {
                        if (err) {
                            if (err.code == 'EntityAlreadyExists') err = new ConcurrencyError();
                            if (callback) callback(err);
                            return;
                        }
                        vm.actionOnCommit = 'update';
                        if (callback) callback(null, vm);
                    });
                    break;

                case 'update':

                    obj = vm.toJSON();
                    obj = generateEntity(obj);
                    obj = _.assign(obj, objDescriptor);

                    self.client.insertOrReplaceEntity(self.collectionName, obj, function (err) {
                        if (err) {
                            if (err.code == 'ConditionNotMet' && err.statusCode == 412) err = new ConcurrencyError();
                            if (callback) callback(err);
                            return;
                        }
                        vm.actionOnCommit = 'update';
                        if (callback) callback(null, vm);
                    });
                    break;

                default:
                    return callback(new Error());
            }
        });
    },

    checkConnection: function (callback) {
        var self = this;
        this.client.createTableIfNotExists(this.collectionName, function (err) {
            if (err) {
                return callback(err);
            }

            if (collections.indexOf(self.collectionName) < 0) {
                collections.push(self.collectionName);
            }

            callback(null);
        });
    },

    clear: function (callback) {
        var self = this;

        this.checkConnection(function (err) {
            if (err) {
                return callback(err);
            }

            if (!self.collectionName) {
                if (callback) callback(null);
                return;
            }

            var query = new azure.TableQuery();

            self.client.queryEntities(self.collectionName, query, null, function (err, entities) {
                if (err) {
                    if (callback) callback(err);
                    return;
                }
                async.each(entities.entries, function (entity, callback) {
                        self.client.deleteEntity(self.collectionName, entity, function (error, response) {
                            if (callback) callback(error);
                        });
                    },
                    function (error) {
                        if (callback) callback(error);
                    }
                );
            });
        });
    },

    clearAll: function (callback) {
        var self = this;
        var query = new azure.TableQuery();

        async.each(collections, function (col, callback) {

            self.client.queryEntities(col, query, null, function (err, entities) {
                if (err) {
                    return callback(err);
                }
                async.each(entities.entries, function (entity, callback) {
                        self.client.deleteEntity(col, entity, function (error, response) {
                            callback(error);
                        });
                    },
                    function (error) {
                        callback(error);
                    });
            });
        }, callback);
    }

});

module.exports = AzureTable;
