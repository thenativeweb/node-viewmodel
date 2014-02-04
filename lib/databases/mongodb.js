var mongo = require('mongodb')
  , ObjectID = mongo.BSONPure.ObjectID
  , _ = require('lodash')
  , ConcurrencyError = require('../concurrencyError');

module.exports = {

    // __connect:__ Initiate communication with the database.
    // 
    // `db.connect(options, callback)`
    //
    // - __options:__ The options can have information like host, port, etc. [optional]
    // - __callback:__ `function(err, queue){}`
    connect: function(options, callback) {

        if(_.isFunction(options)) {
            callback = options;
        }

        var defaults = {
            host: 'localhost',
            port: 27017,
            dbName: 'context'
        };
        
        _.defaults(options, defaults);

        var defaultOpt = {
            auto_reconnect: true,
            ssl: false
        };

        options.options = options.options || {};

        _.defaults(options.options, defaultOpt);

        this.isConnected = false;
        var self = this;
        var server = new mongo.Server(options.host, options.port, options.options);
        new mongo.Db(options.dbName , server, { safe: true }).open(function(err, client) {
            if (err) {
                if (callback) callback(err);
            } else {
                var finish = function(err) {
                    self.client = client;
                    self.isConnected = true;
                    if (callback) callback(err, self);
                };

                if (options.username) {
                    client.authenticate(options.username, options.password, finish);
                } else {
                    finish();
                }
            }
        });

    },

    // __getNewId:__ Use this function to obtain a new id.
    // 
    // `repo.getNewId(callback)`
    //
    // - __callback:__ `function(err, id){}`
    getNewId: function(callback) {
        this.checkConnection();
        
        callback(null, new ObjectID().toString());
    },

    // __get:__ Use this function to get the viewmodel.
    // 
    // `repo.get(id, callback)`
    //
    // - __id:__ The id to identify the viewmodel.
    // - __callback:__ `function(err, vm){}`
    get: function(id, callback) {

        this.checkConnection();

        if(_.isFunction(id)) {
            callback = id;
            id = new ObjectID().toString();
        }

        var self = this;

        this.collection.findOne({ _id: id }, function(err, obj) {

            if(!obj) {
                return callback(null, self.getNewViewModel(id));
            }

            callback(null, self.fromObject(obj));

        });

    },

    // __find:__ Use this function to find viewmodels.
    // 
    // `repo.find(query, callback)`
    //
    // - __query:__ The query to find the viewmodels.
    // - __callback:__ `function(err, vms){}`
    find: function(query, callback) {

        this.checkConnection();

        callback = callback || query;
        query = arguments.length === 2 ? query: null;

        var self = this;

        this.collection.find(query).toArray(function(err, vms) {

            // Map to view models
            vms = _.map(vms, function(value) {
                return self.fromObject(value);
            });

            callback(err, vms);

        });

    },

    // __commit:__ Use this function to commit a viewmodel.
    // 
    // `repo.commit(vm, callback)`
    //
    // - __vm:__ The viewmodel that should be commited.
    // - __callback:__ `function(err){}`
    commit: function(vm, callback) {

        this.checkConnection();
        
        if(!vm.actionOnCommit) return callback(new Error());

        var obj;

        switch(vm.actionOnCommit) {
            case 'delete':
                this.collection.remove({ _id: vm.id }, { safe: true }, callback);
                break;
            case 'create':
                obj = this.fromViewModel(vm);
                obj._id = obj.id;
                obj._hash = new ObjectID().toString();
                this.collection.insert(obj, { safe: true }, function(err) {
                    if (err && err.message && err.message.indexOf('duplicate key') >= 0) {
                        return callback(new ConcurrencyError());
                    }
                    vm.actionOnCommit = 'update';
                    callback(err, vm);
                });
                break;
            case 'update':
                obj = this.fromViewModel(vm);
                obj._id = obj.id;
                var currentHash = obj._hash;
                obj._hash = new ObjectID().toString();
                var query = { _id: obj._id };
                if (currentHash) {
                    query._hash = currentHash;
                }
                this.collection.update(query, obj, { safe: true, upsert: !currentHash }, function(err, modifiedCount) {
                    if (modifiedCount === 0) {
                        return callback(new ConcurrencyError());
                    }
                    vm.actionOnCommit = 'update';
                    callback(err, vm);
                });
                break;
            default:
                return callback(new Error());
        }

    },

    // __checkConnection:__ Use this function to check if all is initialized correctly.
    // 
    // `this.checkConnection()`
    checkConnection: function() {
        if(!this.collection) {
            this.collection = new mongo.Collection(this.client, this.collectionName);
        }
    },

    // __extend:__ Use this function to extend this repository with the appropriate collectionName.
    // 
    // `repo.extend(obj)`
    //
    // - __obj:__ The object that should be extended.
    extend: function(obj) {
        var res = _.assign(_.assign({}, this), obj);
        for (var f in this) {
            if (_.isFunction(this[f])) {
                res[f] = this[f];
            }
        }
        return res;
    }

};
