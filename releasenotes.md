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
