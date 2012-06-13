//     lib/databases/nStore.js v0.0.1
//     (c) 2012 Adriano Raiano (adrai); under MIT License

var path = require('path')
  , _ = require('underscore')
  , Tiny = require('tiny')
  , uuid = require('../uuid');

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
            dbPath: __dirname + '/'
        };
        
        _.defaults(options, defaults);

        this.dbPath = options.dbPath;

        this.isConnected = true;

        callback(null, this);
    },

    // __getNewId:__ Use this function to obtain a new id.
    // 
    // `repo.getNewId(callback)`
    //
    // - __callback:__ `function(err, id){}`
    getNewId: function(callback) {
        this.checkConnection(function() {
            callback(null, uuid().toString());
        });
    },

    // __get:__ Use this function to get the viewmodel.
    // 
    // `repo.get(id, callback)`
    //
    // - __id:__ The id to identify the viewmodel.
    // - __callback:__ `function(err, vm){}`
    get: function(id, callback) {

        var self = this;

        this.checkConnection(function() {

            if(_.isFunction(id)) {
                callback = id;
                id = uuid().toString();
            }

            self.collection.get(id, function(err, obj) {

                if(!obj) {
                    return callback(null, self.getNewViewModel(id));
                }

                callback(null, self.fromObject(obj));

            });

        });

    },

    // __find:__ Use this function to find viewmodels.
    // 
    // `repo.find(query, callback)`
    //
    // - __query:__ The query to find the viewmodels.
    // - __callback:__ `function(err, vms){}`
    find: function(query, callback) {

        var self = this;

        callback = callback || query;
        query = arguments.length === 2 ? query : null;

        this.checkConnection(function() {

            self.collection.find(query, function(err, docs) { 

                // Map to view models
                var vms = _.map(docs, function(value) {
                    return self.fromObject(value);
                });

                callback(err, vms);
            });

        });

    },

    // __commit:__ Use this function to commit a viewmodel.
    // 
    // `repo.commit(vm, callback)`
    //
    // - __vm:__ The viewmodel that should be commited.
    // - __callback:__ `function(err){}`
    commit: function(vm, callback) {

        var self = this;

        this.checkConnection(function() {

            if(!vm.actionOnCommit) return callback(new Error());

            switch(vm.actionOnCommit) {
                case 'delete':
                    self.collection.remove(vm.id, callback);
                    break;
                case 'create':
                    // Intended Fall-through
                case 'update':
                    var obj = self.fromViewModel(vm);
                    self.collection.set(vm.id, obj, callback);
                    break;
                default:
                    return callback(new Error());
            }

        });

    },

    // __checkConnection:__ Use this function to check if all is initialized correctly.
    // 
    // `this.checkConnection()`
    checkConnection: function(callback) {
        if(!this.collection) {
            var self = this;
            Tiny(path.join(this.dbPath, this.collectionName + '.tiny'), function(err, db) {
                self.collection = db;
                callback(null);
            });
        } else {
            callback(null);
        }
    },

    // __extend:__ Use this function to extend this repository with the appropriate collectionName.
    // 
    // `repo.extend(obj)`
    //
    // - __obj:__ The object that should be extended.
    extend: function(obj) {
        return _.extend(_.clone(this), obj);
    }

};