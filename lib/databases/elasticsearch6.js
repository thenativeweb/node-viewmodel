"use strict";

var util = require("util"),
	Repository = require("../base"),
	ViewModel = Repository.ViewModel,
	ConcurrencyError = require("../concurrencyError"),
	elasticsearch = Repository.use("elasticsearch"),
	uuid = require("uuid").v4,
	jsondate = require("jsondate"),
	_ = require("lodash"),
	async = require("async"),
	indexAndTypeNames = [];

function Elasticsearch(options) {
	Repository.call(this, options);

	var defaults = {
		index: "context",
		pingInterval: 1000
	};

	_.defaults(options, defaults);

	if (!options.hosts && !options.host) {
		options.host = "localhost";
	}

	if (options.port === undefined) {
		options.port = 9200;
  }
  	
	this.options = options;
	this.index = this.options.index;
  this.indexAndTypeName = null;

	// not sure those are the best default settings, but they certanly work for local testing enviorment.
	this.numberOfShards  = options.numberOfShards || 1;
	this.numberOfReplicas  = options.numberOfReplicas || 0;
	this.refresh = options.refresh || true;
	this.waitForActiveShards = options.waitForActiveShards || 1;
}

util.inherits(Elasticsearch, Repository);

function dummyCallback(err, result) {
	if (err) return false;
	return true;
}

_.extend(Elasticsearch.prototype, {
	connect: function(callback) {
		if (!callback) {
			callback = dummyCallback;
		}

		var self = this;
		var options = self.options;

		this.client = new elasticsearch.Client({
			host: options.host + ":" + options.port,
			log: options.log
		});

		this.closeCalled = false;

	self.client.ping(function(err) {
		if (err) {
			self.client = null;
			callback(err, self);
			return;
		}

		self.emit("connect");
		callback(err, self);
	});
	},

	disconnect: function(callback) {
	if (this.client) {
		this.client.close();
			this.client = null;
		this.emit("disconnect");
	}
		if (callback) callback(null);
	},

	getNewId: function(callback) {
		var id = uuid().toString();
		if (callback) callback(null, id);
	},

	get: function(id, callback) {
		if (_.isFunction(id)) {
			callback = id;
			id = null;
		}

		if (!id) {
			id = uuid().toString();
		}

		var self = this;

		this.checkConnection(function(err) {
			if (err) {
				return callback(err);
			}

			self.client.get(
				{
					index: self.indexAndTypeName,
					type: self.indexAndTypeName,
					id: id
				},
				function(err, res) {
					if (err && err.status !== 404) {
						return callback(err);
					}

					if (!res || !res._source) {
						return callback(null, new ViewModel({ id: id }, self, null));
					}

					var data = jsondate.parse(JSON.stringify(res._source));
					var vm = new ViewModel(data, self, res._version);
					vm.actionOnCommit = "update";
					// old style ViewModel
					vm.version = res._version;
					return callback(null, vm);
				}
			);
		});
	},

	find: function(query, queryOptions, callback) {
		var self = this;

		this.checkConnection(function(err) {
			if (err) {
				return callback(err);
			}

			// only native search queries are supported for now
			var body = _.merge({ query: query }, queryOptions);

			self.client.search(
				{
					version: true,
					index: self.indexAndTypeName,
					type: self.indexAndTypeName,
					body: body
				},
				function(err, res) {
					if (err) {
						return callback(err);
					}

					// Map to view models
					var vms = _.map(res.hits.hits, function(res) {
						var data = jsondate.parse(JSON.stringify(res._source));
						var vm = new ViewModel(data, self, res._version);
						vm.actionOnCommit = "update";
						// old style ViewModel ( no version )
						vm.version = res._version;
						return vm;
					});

					callback(err, vms);
				}
			);
		});
	},

	findOne: function(query, queryOptions, callback) {
		queryOptions.size = 1;

		this.find(query, queryOptions, function(err, vms) {
			if (err) {
				return callback(err);
			}

			if (vms.length === 0) {
				return callback(null, null);
			}
			callback(null, vms[0]);
		});
	},

	commit: function(vm, callback) {
		if (!callback) callback = dummyCallback;
		if (!vm.actionOnCommit) return callback(new Error());

		var self = this;

		this.checkConnection(function(err) {
			if (err) {
				return callback(err);
			}

			switch (vm.actionOnCommit) {
				case "delete":
					if (!vm.version) {
						return callback(null);
					}
					self.client.delete(
						{
							index: self.indexAndTypeName,
							type: self.indexAndTypeName,
							refresh: self.refresh,
							waitForActiveShards: self.waitForActiveShards,
							version: vm.version,
							id: vm.id
						},
						function(err, res) {
							if (err && err.status === 409) {
								return callback(new ConcurrencyError());
							}
							callback(err);
						}
					);
					break;
				case "create":
				// upsert ( put if absent )
				case "update":
					var obj = vm.toJSON();
					self.client.index(
						{
							index: self.indexAndTypeName,
              type: self.indexAndTypeName,
              opType: (vm.version) ? 'index' : 'create',
							id: vm.id,
							version: vm.version || null,
							refresh: self.refresh,
							waitForActiveShards: self.waitForActiveShards,
							body: obj
						},
						function(err, res) {
							if (err && err.status === 409) {
								return callback(new ConcurrencyError());
							}
							vm.actionOnCommit = "update";
							vm.version = res._version;
							callback(err, vm);
						}
					);
					break;
				default:
					return callback(new Error());
			}
		});
	},

	checkConnection: function(callback) {
		// callback is not always passed
		if (!callback) callback = dummyCallback;


		if (this.indexAndTypeName)
			return callback(null);

		this.indexAndTypeName = this.index + '.' + this.collectionName;


		if (indexAndTypeNames.indexOf(this.indexAndTypeName) < 0) {
				indexAndTypeNames.push(this.indexAndTypeName);
			}

		var self = this;
			
		// override default settings if any repository specific are given
		if (self.repositorySettings && self.repositorySettings.elasticsearch6) {
			if (self.repositorySettings.elasticsearch6.refresh) {
				self.refresh = self.repositorySettings.elasticsearch6.refresh;
			}
			if (self.repositorySettings.elasticsearch6.waitForActiveShards) {
				self.waitForActiveShards = self.repositorySettings.elasticsearch6.waitForActiveShards;
			}
		}
		

		this.client.indices.exists({ index: self.indexAndTypeName }, function(error, result) {
			if (error || result) {
				return callback(error, result);
			}

			self.client.indices.create(
			{
				index: self.indexAndTypeName,
				body: self._buildCreateIndexBody()
			},
			function(err) {
				if (err) {
					self.indexAndTypeName = null;
					var i = indexAndTypeNames.indexOf(self.indexAndTypeName);
					if (i > -1) {
						indexAndTypeNames.splice(i,1);
					}
					return callback(err);
				}
				callback(null)
			}
			);

		})
	},

	clear: function(callback) {
		if (!callback) callback = dummyCallback();

		if (!this.indexAndTypeName) {
			return callback(null);
		}

		var self = this;

		self._clearIndex(self.indexAndTypeName, callback);
	},

	clearAll: function(callback) {
		if (!callback) callback = dummyCallback();

		if (!indexAndTypeNames || !indexAndTypeNames.length) {
			return callback(null);
		}

		var self = this;

		async.each(indexAndTypeNames, this._clearIndex.bind(this), callback);
	},

	_clearIndex: function(index, callback) {
		var self = this;
		self.client.indices.exists({index: index}, function(err, found){
			if (err || !found)
				return callback(err, found);

			self.client.indices.delete({ index: index }, function(err){
				if (err && err.status === 404)  {
					return callback(null);
				}

				if (!err) {
          if (self.indexAndTypeName === index) {
            self.indexAndTypeName = null;
          }
          var i = indexAndTypeNames.indexOf(index);
					if (i > -1) {
						indexAndTypeNames.splice(i,1);
					}
				}
				callback(err);
			});
		});
	},

	_getDefaultIndexSettings: function() {
		var self = this;
		var body = {
			settings: {
				number_of_shards: self.numberOfShards,
				number_of_replicas: self.numberOfReplicas
			},
      mappings: {}
    };

		body.mappings[self.indexAndTypeName] = {
					dynamic_templates: [
						{
								non_analyzed_string: {
									match: "*",
									match_mapping_type: "string",
									mapping: {
									type: "text",
										fields: {
										keyword: {
											type: 'keyword',
											ignore_above: 256
										}
										},
									index: "not_analyzed"
									}
								}
						}
					]
				}
    return body;
  },

	_buildCreateIndexBody: function() {
		var body = this._getDefaultIndexSettings();
		var repositorySettings = this.repositorySettings;

		if (!repositorySettings || !repositorySettings.elasticsearch6 || !repositorySettings.elasticsearch6.index)
			return body;

		var settings = repositorySettings.elasticsearch6.index;

		if (settings.settings)
			_.merge(body.settings, settings.settings);

		if (settings.mappings)
			_.merge(body.mappings[this.indexAndTypeName],  settings.mappings);

		return body;
	}
	
});

module.exports = Elasticsearch;
