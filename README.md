# Exuberant CTags extension for VSCode

A CTags definitions provider for VSCode.

## Features

- Registers with VSCode as a definitions provider for C/C++ files.
- Provides fast lookup even on large tags files.
- Handles symbols with multiple definitions.
- Provides commands for regenerating and reindexing the tags file.
- Integrates with the status bar to provide progress updates during tags file generation and indexing.

## Requirements

The extension looks for a file called 'tags' in the workspace root directory. If this file cannot be found a new tags file can be created
and indexed using the _regenerate tags file_ command. This requires the ctags command to be on your path and will generate tags for source files
in the workspace root directory recursively (equivalent to running: `ctags -R -f tags .`).

## Known Issues

- Not possible to configure the name of the tags file.
- Not possible to add additional paths to index (e.g. /usr/include).
- Does not regenerate and reindex the tags file on save.

## Release Notes

_Unreleased_
