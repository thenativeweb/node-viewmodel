//     lib/databases/couchDb.js v0.1.0
//     (c) 2012 Adriano Raiano (adrai); under MIT License

var cradle = require('cradle')
  , _ = require('underscore');

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
            host: 'http://localhost',
            port: 5984,
            dbName: 'context'
        };
        
        _.defaults(options, defaults);

        var defaultOpt = {
            cache: true,
            raw: false//,
            // secure: true,
            // auth: { username: 'login', password: 'pwd' }
        };

        options.options = options.options || {};

        _.defaults(options.options, defaultOpt);

        if (this.isConnected) {
            if (callback) { return callback(null); }
            return;
        }

        this.isConnected = false;
        var self = this;

        var client = new(cradle.Connection)(options.host, options.port, options.options);
        var db = client.database(options.dbName);
        db.exists(function (err, exists) {

            function finish() {
                self.client = client;
                self.db = db;
                self.isConnected = true;

                db.save('_design/collection', {
                    views: {
                        find: {
                            map: function(doc) {
                              function split4(obj, pre) {
                                if (obj) {
                                  if (Array.isArray(obj)) {
                                    for (var j = 0, len = obj.length; j < len; j++) {
                                      pre.collectionName = doc.collectionName;
                                      emit(pre, doc);
                            //          split5(obj[j], pre);
                                    }
                                  } else {
                                    for (var i in obj) {
                                     if (isNaN(i)) {
                                      var item = obj[i];
                                      var newI = pre ? pre + '.' + i : i;
                                      var key = {};
                                      key[newI] = item;
                                      key.collectionName = doc.collectionName;
                                      emit(key, doc);
                            //          split5(item, newI);
                                    }
                                   }
                                  }
                                }
                              }

                              function split3(obj, pre) {
                                if (obj) {
                                  if (Array.isArray(obj)) {
                                    for (var j = 0, len = obj.length; j < len; j++) {
                                      pre.collectionName = doc.collectionName;
                                      emit(pre, doc);
                                      split4(obj[j], pre);
                                    }
                                  } else {
                                    for (var i in obj) {
                                     if (isNaN(i)) {
                                      var item = obj[i];
                                      var newI = pre ? pre + '.' + i : i;
                                      var key = {};
                                      key[newI] = item;
                                      key.collectionName = doc.collectionName;
                                      emit(key, doc);
                                    
                                      split4(item, newI);
                                    }
                                   }
                                  }
                                }
                              }

                              function split2(obj, pre) {
                                if (obj) {
                                  if (Array.isArray(obj)) {
                                    for (var j = 0, len = obj.length; j < len; j++) {
                                      pre.collectionName = doc.collectionName;
                                      emit(pre, doc);
                                      split3(obj[j], pre);
                                    }
                                  } else {
                                    for (var i in obj) {
                                     if (isNaN(i)) {
                                      var item = obj[i];
                                      var newI = pre ? pre + '.' + i : i;
                                      var key = {};
                                      key[newI] = item;
                                      key.collectionName = doc.collectionName;
                                      emit(key, doc);
                                    
                                      split3(item, newI);
                                    }
                                   }
                                  }
                                }
                              }
                              function split(obj) {
                                if (obj) {
                                  if (Array.isArray(obj)) {
                                    for (var j = 0, len = obj.length; j < len; j++) {
                                      emit({ collectionName: obj.collectionName }, doc);
                                      split2(obj[j]);
                                    }
                                  } else {
                                    for (var i in obj) {
                                     if (isNaN(i)) {
                                      if (i != '_rev' && i != '_id') {
                                        var item = obj[i];
                                        var key = {};
                                        key[i] = item;
                                        key.collectionName = doc.collectionName;
                                        emit(key, doc);
                                    
                                        split2(item, i);
                                      }
                                     }
                                    }
                                  }
                                }
                              }

                              var key = {};
                              key.collectionName = doc.collectionName;
                              emit(key, doc);

                              split(doc);
                            }
                        }
                    }
                }, function(err) {
                    if (callback) { return callback(err, self); }
                });
            }

            if (err) {
                if (callback) { return callback(err, self); }
            } else if (!exists) {
                db.create(function(err) {
                    finish();
                });
            } else {
                finish();
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
        
        this.client.uuids(function(err, uuids) {
            if (err) {
                return callback(err);
            } else {
                callback(err, uuids.toString());
            }
        });
    },

    // __get:__ Use this function to get the viewmodel.
    // 
    // `repo.get(id, callback)`
    //
    // - __id:__ The id to identify the viewmodel.
    // - __callback:__ `function(err, vm){}`
    get: function(id, callback) {

        this.checkConnection();

        var self = this;

        function getObj(ident, clb) {
            self.db.get(ident, function(err, obj) {

                if(!obj) {
                    var ret = self.getNewViewModel(ident);
                    if (ret) {
                        ret.id = ident;
                        ret._id = ident;
                    }

                    return clb(null, ret);
                }

                var res = self.fromObject(obj);
                res.id = ident;
                res._id = ident;
                res._revision = res.revision;
                delete res.revision;

                clb(null, res);

            });
        }

        if(_.isFunction(id)) {
            callback = id;
            this.getNewId(function(err, id) {
                getObj(id, callback);
            });
        } else {
            getObj(id, callback);
        }

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
        query = arguments.length === 2 ? query: {};

        var self = this;

        query.collectionName = this.collectionName;

        this.db.view('collection/find', { key: query }, function(err, vms) {
            var res = [];

            for(var i = 0, len = vms.length; i < len; i++){
                var vm = vms[i].value;
                vm._revision = vm.revision;
                delete vm.revision;
                vm.id = vm._id;
                var obj = self.fromObject(vm);
                var found = _.find(res, function(r) {
                    return r.id === obj.id;
                });

                if (!found) {
                    res.push(obj);
                }
            }

            callback(err, res);

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

        switch(vm.actionOnCommit) {
            case 'delete':
                var self = this;
                this.db.get(vm._id, function(err, doc){
                    if (doc) {
                        self.db.remove(vm._id, vm._rev, callback);
                    } else {
                        callback(null);
                    }
                });
                break;
            case 'create':
                // Intended Fall-through
            case 'update':
                var obj = this.fromViewModel(vm);
                obj.revision = obj._revision;
                delete obj._revision;
                obj.id = obj._id;
                obj.collectionName = this.collectionName;
                this.db.save(obj._id, obj, function(err) {
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
