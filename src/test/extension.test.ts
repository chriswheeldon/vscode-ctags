//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import { CTagsIndex } from '../ctags';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// import * as vscode from 'vscode';
// import * as myExtension from '../extension';

// Defines a Mocha test suite to group tests of similar kind together
suite('Extension Tests', function() {
  // Defines a Mocha unit test
  test('integration', async function() {
    this.timeout(10000e3);
    const index = new CTagsIndex('/home/chris/dev/linux/', 'tags');
    return index.reindex();
  });
});
