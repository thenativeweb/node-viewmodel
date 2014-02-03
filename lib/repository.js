var fs = require('fs')
  , _ = require('lodash')
  , tolerate = require('tolerance');

// __initialize:__ Initiate communication with the database.
// 
// `initialize(self, options, callback)`
//
// - __self:__ The object that should be extended.
// - __options:__ The options can have information like host, port, etc. [optional]
// - __callback:__ `function(err, queue){}`
function initialize(self, options, callback) {

    if(_.isFunction(options)) {
        callback = options;
        options = { type: 'inMemory' };
    }

    self.collectionName = options.collectionName;
    self.options = options;

    if (options.type !== 'inMemory') {
        options.type = options.type.toLowerCase();
    }

    var dbPath = __dirname + "/databases/" + options.type + ".js";

    var exists = fs.exists || require('path').exists;
    exists(dbPath, function (exists) {

        if (!exists) return callback('Implementation for db "' + options.type + '"" does not exist!');

        try {
            var db = require(dbPath);

            _.extend(self, db);

            if (!self.isConnected) {
                tolerate(function(callback) {
                    self.connect(options, callback);
                }, options.timeout || 0, callback);
            } else {
                callback(null, self);
            }
        } catch (err) {
            if (err.message.indexOf("Cannot find module") >= 0 && err.message.indexOf("'") > 0 && err.message.lastIndexOf("'") !== err.message.indexOf("'")) {
                var moduleName = err.message.substring(err.message.indexOf("'") + 1, err.message.lastIndexOf("'"));
                console.log('Please install "' + moduleName + '" to work with db implementation "' + options.type + '"!');
            }

            throw err;
        }

    });
    
}

function set(data) {
    if (arguments.length === 2) {
        this[arguments[0]] = arguments[1];
    } else {
        for(var m in data) {
            this[m] = data[m];
        }
    }
}

function get(attr) {
    return this[attr];
}

function destroy() {
    this.actionOnCommit = 'delete';
}

function fromViewModel(vm) {
    var obj = _.clone(vm);
    if (obj.actionOnCommit) delete obj.actionOnCommit;
    if (obj.destroy) delete obj.destroy;
    if (obj.commit) delete obj.commit;
    if (obj.toJSON) delete obj.toJSON;
    if (obj.set) delete obj.set;
    if (obj.get) delete obj.get;
    return obj;
}

var WriteRepository = function() {};

WriteRepository.prototype = {

    getNewViewModel: function(id) {
        return this.fromObject({ id: id, actionOnCommit: 'create' });
    },

    fromViewModel: fromViewModel,
    
    fromObject: function(obj) {
        var self = this;
        var vm = _.clone(obj);
        vm.actionOnCommit = vm.actionOnCommit || 'update';
        vm.destroy = destroy;
        vm.commit = function(callback) {
            self.commit(this, callback);
        };
        vm.toJSON = function() { return fromViewModel(this); };
        vm.set = set;
        vm.get = get;
        return vm;
    },

    init: function(options, callback) {
        initialize(this, options, callback);
    }

};

var ReadRepository = function() {};

ReadRepository.prototype = {

    getNewViewModel: function(id) {
        return null;
    },

    fromViewModel: fromViewModel,
    
    fromObject: function(obj) {
        return obj;
    },

    init: function(options, callback) {
        initialize(this, options, callback);
    }

};

var repository = {
    write: new WriteRepository(),
    read: new ReadRepository()
};

repository.write.create = function() {
    return new WriteRepository();
};

repository.read.create = function() {
    return new ReadRepository();
};

module.exports = repository;