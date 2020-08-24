## [v1.11.2](https://github.com/adrai/node-viewmodel/compare/v1.11.1...v1.11.2)
- mongodb: Support mongo atomic operators [#74](https://github.com/adrai/node-viewmodel/pull/74) thanks to [OrH](https://github.com/OrH)

## [v1.11.1](https://github.com/adrai/node-viewmodel/compare/v1.11.0...v1.11.1)
- mongodb: useUnifiedTopology

## [v1.11.0](https://github.com/adrai/node-viewmodel/compare/v1.10.11...v1.11.0)
- introduce before and after database events

## [v1.10.11](https://github.com/adrai/node-viewmodel/compare/v1.10.10...v1.10.11)
- Fix options indexes [#68](https://github.com/adrai/node-viewmodel/pull/68) thanks to [tommiii](https://github.com/tommiii)

## [v1.10.10](https://github.com/adrai/node-viewmodel/compare/v1.10.8...v1.10.10)
- Increase DynamoDB performance [#66](https://github.com/adrai/node-viewmodel/pull/66) thanks to [Peter Schramm](https://github.com/Glockenbeat)

## [v1.10.8](https://github.com/adrai/node-viewmodel/compare/v1.10.7...v1.10.8)
- Allow to set dynamo DB document client options [#65](https://github.com/adrai/node-viewmodel/pull/65) thanks to [wrobel](https://github.com/wrobel)

## [v1.10.7](https://github.com/adrai/node-viewmodel/compare/v1.10.6...v1.10.7)
- elasticsearch6: upsert bulkCommit for elasticsearch6 ( handle create -> update -> update ) [#61](https://github.com/adrai/node-viewmodel/pull/61) thanks to [nanov](https://github.com/nanov)

## [v1.10.6](https://github.com/adrai/node-viewmodel/compare/v1.10.5...v1.10.6)
- elasticsearch6: fix potential concurrency error on multiple updates.

## [v1.10.5](https://github.com/adrai/node-viewmodel/compare/v1.10.4...v1.10.5)
- elasticsearch6: bulkCommit fix

## [v1.10.4](https://github.com/adrai/node-viewmodel/compare/v1.10.3...v1.10.4)
- bulkCommit: mongodb fix concurrency check for upserts

## [v1.10.3](https://github.com/adrai/node-viewmodel/compare/v1.10.2...v1.10.3)
- bulkCommit: check for empty bulkOperations

## [v1.10.2](https://github.com/adrai/node-viewmodel/compare/v1.10.1...v1.10.2)
- bulkCommit: mongodb wait for serverStatus call

## [v1.10.1](https://github.com/adrai/node-viewmodel/compare/v1.10.0...v1.10.1)
- bulkCommit: check for empty vms

## [v1.10.0](https://github.com/adrai/node-viewmodel/compare/v1.9.1...v1.10.0)
- bulkCommit for Elasticsearch 6.X implementation [#58](https://github.com/adrai/node-viewmodel/pull/58) thanks to [nanov](https://github.com/nanov)

## [v1.9.1](https://github.com/adrai/node-viewmodel/compare/v1.9.0...v1.9.1)
- fix typo in error case

## [v1.9.0](https://github.com/adrai/node-viewmodel/compare/v1.8.1...v1.9.0)
- introduce optional bulkCommit

## [v1.8.1](https://github.com/adrai/node-viewmodel/compare/v1.8.0...v1.8.1)
- remove deprecated option max_attempts from redis options

## [v1.8.0](https://github.com/adrai/node-viewmodel/compare/v1.7.6...v1.8.0)
- compatibility with new mongodb version (3.x)

## [v1.7.6](https://github.com/adrai/node-viewmodel/compare/v1.7.5...v1.7.6)
- Dynamodb filter expression fix [#55](https://github.com/adrai/node-viewmodel/pull/56) thanks to [Glockenbeat](https://github.com/Glockenbeat)

## [v1.7.5](https://github.com/adrai/node-viewmodel/compare/v1.7.4...v1.7.5)
- Switching DynamoDB scan to FilterExpression [#55](https://github.com/adrai/node-viewmodel/pull/55) thanks to [Glockenbeat](https://github.com/Glockenbeat)

## [v1.7.4](https://github.com/adrai/node-viewmodel/compare/v1.7.3...v1.7.4)
- fixing dynamodb DocumentClient initialization [#53](https://github.com/adrai/node-viewmodel/pull/54) thanks to [Glockenbeat](https://github.com/Glockenbeat)

## [v1.7.3](https://github.com/adrai/node-viewmodel/compare/v1.7.2...v1.7.3)
- move aws-sdk to dev dep

## [v1.7.2](https://github.com/adrai/node-viewmodel/compare/v1.7.1...v1.7.2)
- correct require statement

## [v1.7.1](https://github.com/adrai/node-viewmodel/compare/v1.7.0...v1.7.1)
- fix the Viewmodel toJSON method deserialize date ISO string to a date [#53](https://github.com/adrai/node-viewmodel/pull/53) thanks to [emmkong](https://github.com/emmkong)

## [v1.7.0](https://github.com/adrai/node-viewmodel/compare/v1.6.0...v1.7.0)
- AWS DynamoDb implementation [#52](https://github.com/adrai/node-viewmodel/pull/52) thanks to [emmkong](https://github.com/emmkong)

## [v1.6.0](https://github.com/adrai/node-viewmodel/compare/v1.5.22...v1.6.0)
- Elasticsearch 6.X and 5.x implementation [#51](https://github.com/adrai/node-viewmodel/pull/51) thanks to [nanov](https://github.com/nanov) and his company [eCollect](https://github.com/eCollect) which enabled him to work also during working hours

## [v1.5.22](https://github.com/adrai/node-viewmodel/compare/v1.5.20...v1.5.22)
- fix for new mongodb driver

## [v1.5.20](https://github.com/adrai/node-viewmodel/compare/v1.5.19...v1.5.20)
- update deps

## [v1.5.19](https://github.com/adrai/node-viewmodel/compare/v1.5.18...v1.5.19)
- mongodb: try to create collection earlier (on extend call)

## [v1.5.18](https://github.com/adrai/node-viewmodel/compare/v1.5.17...v1.5.18)
- redis, mongodb: call disconnect on ping error

## [v1.5.17](https://github.com/adrai/node-viewmodel/compare/v1.5.14...v1.5.17)
- Support mongo connection string

## [v1.5.14](https://github.com/adrai/node-viewmodel/compare/v1.5.13...v1.5.14)
- inmemory: now correctly instantiates with collectionName [#46](https://github.com/adrai/node-viewmodel/pull/46) thanks to [hilkeheremans](https://github.com/hilkeheremans)

## [v1.5.13](https://github.com/adrai/node-viewmodel/compare/v1.5.12...v1.5.13)
- redis, mongodb: call disconnect on ping error

## [v1.5.12](https://github.com/adrai/node-viewmodel/compare/v1.5.11...v1.5.12)
- redis: added optional heartbeat

## [v1.5.11](https://github.com/adrai/node-viewmodel/compare/v1.5.10...v1.5.11)
- azuretable: array properties were not properly stored in entity [#44](https://github.com/adrai/node-viewmodel/pull/44) thanks to [mpseidel](https://github.com/mpseidel)

## [v1.5.10](https://github.com/adrai/node-viewmodel/compare/v1.5.9...v1.5.10)
- redis: fix for new redis lib

## [v1.5.9](https://github.com/adrai/node-viewmodel/compare/v1.5.8...v1.5.9)
- mongodb: added optional heartbeat

## [v1.5.8](https://github.com/adrai/node-viewmodel/compare/v1.5.7...v1.5.8)
- mongodb: do not call ensureIndexes on clear

## [v1.5.7](https://github.com/adrai/node-viewmodel/compare/v1.5.6...v1.5.7)
- redis: fix wrong multi response handling

## [v1.5.6](https://github.com/adrai/node-viewmodel/compare/v1.5.5...v1.5.6)
- speed up mongodb and inmemory commits

## [v1.5.5](https://github.com/adrai/node-viewmodel/compare/v1.5.4...v1.5.5)
- give possibility to use mongodb with authSource

## [v1.5.4](https://github.com/adrai/node-viewmodel/compare/v1.5.3...v1.5.4)
- updated dep

## [v1.5.3](https://github.com/adrai/node-viewmodel/compare/v1.5.2...v1.5.3)
- added possiblity to query with regex

## [v1.5.2](https://github.com/adrai/node-viewmodel/compare/v1.5.1...v1.5.2)
- optimization for `npm link`'ed development

## [v1.5.1](https://github.com/adrai/node-viewmodel/compare/v1.4.2...v1.5.1)
- catch concurrency error on destroy commit

## [v1.4.2](https://github.com/adrai/node-viewmodel/compare/v1.3.4...v1.4.2)
- added elasticsearch support

## [v1.3.3](https://github.com/adrai/node-viewmodel/compare/v1.3.3...v1.3.4)
- redis: replace .keys() calls with .scan() calls => scales better

## [v1.3.3](https://github.com/adrai/node-viewmodel/compare/v1.3.2...v1.3.3)
- fix errors in azureTable implementation [#13](https://github.com/adrai/node-viewmodel/pull/13) thanks to [rvin100](https://github.com/rvin100)

## [v1.3.2](https://github.com/adrai/node-viewmodel/compare/v1.3.1...v1.3.2)
- added mongodb driver 2.x support

## [v1.3.1](https://github.com/adrai/node-viewmodel/compare/v1.3.0...v1.3.1)
- fix errors in azureTable implementation [#12](https://github.com/adrai/node-viewmodel/pull/12) thanks to [rvin100](https://github.com/rvin100)
- added mongodb driver 2.x support

## [v1.3.0](https://github.com/adrai/node-viewmodel/compare/v1.2.8...v1.3.0)
- added documentdb support [#11](https://github.com/adrai/node-viewmodel/pull/11) thanks to [sbiaudet](https://github.com/sbiaudet)
- added findOne functionality

## [v1.2.8](https://github.com/adrai/node-viewmodel/compare/v1.2.7...v1.2.8)
- some fix for azure-table [#9](https://github.com/adrai/node-viewmodel/pull/9) thanks to [sbiaudet](https://github.com/sbiaudet)

## [v1.2.7](https://github.com/adrai/node-viewmodel/compare/v1.2.6...v1.2.7)
- fix usage with own db implementation

## [v1.2.6](https://github.com/adrai/node-viewmodel/compare/v1.2.4...v1.2.6)
- added clear functionality to clear a collection

## [v1.2.4](https://github.com/adrai/node-viewmodel/compare/v1.2.3...v1.2.4)
- fix date issue for azure-table [#8](https://github.com/adrai/node-viewmodel/pull/8) thanks to [sbiaudet](https://github.com/sbiaudet)

## [v1.2.3](https://github.com/adrai/node-viewmodel/compare/v1.2.2...v1.2.3)
- automatically add commitStamp on commit

## v1.2.2
- azure-table: fix issue in find [#7](https://github.com/adrai/node-viewmodel/pull/7) thanks to [rvin100](https://github.com/rvin100)

## v1.2.1
- fix paging issue in azure-table [#6](https://github.com/adrai/node-viewmodel/pull/6) thanks to [rvin100](https://github.com/rvin100)

## v1.2.0
- added azure-table support [#5](https://github.com/adrai/node-viewmodel/pull/5) thanks to [sbiaudet](https://github.com/sbiaudet)

## v1.1.7
- added clear function (only for testing)

## v1.1.6
- fix undefined repository test in ViewModel constructor [#4](https://github.com/adrai/node-viewmodel/pull/4) thanks to [sbiaudet](https://github.com/sbiaudet)

## v1.1.5
- make redis commit transactional

## v1.1.3
- if no passing a callback when initing a new repo, do not automatically connect

## v1.1.2
- replace json-serialize with jsondate

## v1.1.1
- added possibility for inmemory implementation to search with multiple values

## v1.1.0
- added possibility to pass query options

## v1.0.3
- parse json with json-serialize

## v1.0.2
- mongodb define index as string too

## v1.0.1
- added toJSON function on result array of find function

## v1.0.0
- IMPORTANT: changed API!!!
- added redis support
