# Change Log

All notable changes to this project will be documented in this file.

## [0.0.8]

- Very basic hover and completion providers

## [0.0.7]

- Import latest TextIndexer version (line ending agnostic)

## [0.0.6]

- Reimplemented in terms of TextIndexer, this provides a better balance between lookup performance and memory usage.

## [0.0.5]

- Some memory usage enhancements
  - Create RegExp for pattern on lookup rather than index
  - Use Symbol registry for directory names (there is probably a more efficient way of doing this)
  - Don't store symbol name in index
  - Process tags as they are emitted from the tag reader

## [0.0.4]

- Destroy fs.ReadStream after resolving match (prevents file handle leaks)

## [0.0.3]

- Fix up handling of tags without an end of line anchor (#defines?)
- Improved console logging
- Use a trie to index tags

## [0.0.2]

- Updated extension icon

## [0.0.1]

- Initial release of extension
