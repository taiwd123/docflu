const GoogleDocsConverter = require('../../lib/core/gdocs/google-docs-converter');
const chalk = require('chalk');

async function testGoogleDocsConverter() {
  console.log(chalk.blue('🧪 Testing Google Docs Converter'));
  console.log(chalk.gray('===================================='));

  const converter = new GoogleDocsConverter();
  let testsPassed = 0;
  let totalTests = 0;

  // Test 1: Simple paragraph
  totalTests++;
  try {
    console.log(chalk.blue('\n1. Testing simple paragraph conversion...'));
    const markdown = 'This is a simple paragraph.';
    const result = converter.convertFromMarkdown(markdown);
    const requests = result.requests;
    
    console.log(chalk.gray(`   Input: ${markdown}`));
    console.log(chalk.gray(`   Output: ${requests ? requests.length : 'undefined'} requests`));
    
    if (requests && requests.length > 0 && requests[0].insertText) {
      console.log(chalk.green('   ✅ Simple paragraph test passed'));
      testsPassed++;
    } else {
      console.log(chalk.red('   ❌ Simple paragraph test failed'));
    }
  } catch (error) {
    console.log(chalk.red('   ❌ Simple paragraph test error:', error.message));
  }

  // Test 2: Headings
  totalTests++;
  try {
    console.log(chalk.blue('\n2. Testing heading conversion...'));
    const markdown = '# Main Title\n## Subtitle\n### Section';
    const result = converter.convertFromMarkdown(markdown);
    const requests = result.requests;
    
    console.log(chalk.gray(`   Input: ${markdown.replace(/\n/g, '\\n')}`));
    console.log(chalk.gray(`   Output: ${requests ? requests.length : 'undefined'} requests`));
    
    // Should have insertText and updateTextStyle requests for each heading
    if (requests && requests.length > 0) {
      const headingRequests = requests.filter(r => r.updateTextStyle && r.updateTextStyle.textStyle && r.updateTextStyle.textStyle.bold);
      
      if (headingRequests.length >= 3) {
        console.log(chalk.green('   ✅ Heading test passed'));
        testsPassed++;
      } else {
        console.log(chalk.red('   ❌ Heading test failed'));
      }
    } else {
      console.log(chalk.red('   ❌ Heading test failed - no requests'));
    }
  } catch (error) {
    console.log(chalk.red('   ❌ Heading test error:', error.message));
  }

  // Test 3: Code blocks
  totalTests++;
  try {
    console.log(chalk.blue('\n3. Testing code block conversion...'));
    const markdown = '```javascript\nconsole.log("Hello World");\n```';
    const result = converter.convertFromMarkdown(markdown);
    const requests = result.requests;
    
    console.log(chalk.gray(`   Input: ${markdown.replace(/\n/g, '\\n')}`));
    console.log(chalk.gray(`   Output: ${requests ? requests.length : 'undefined'} requests`));
    
    // Should have code formatting
    if (requests && requests.length > 0) {
      const codeFormatting = requests.find(r => 
        r.updateTextStyle && 
        r.updateTextStyle.textStyle && 
        r.updateTextStyle.textStyle.fontFamily === 'Courier New'
      );
      
      if (codeFormatting) {
        console.log(chalk.green('   ✅ Code block test passed'));
        testsPassed++;
      } else {
        console.log(chalk.red('   ❌ Code block test failed'));
      }
    } else {
      console.log(chalk.red('   ❌ Code block test failed - no requests'));
    }
  } catch (error) {
    console.log(chalk.red('   ❌ Code block test error:', error.message));
  }

  // Test 4: Lists
  totalTests++;
  try {
    console.log(chalk.blue('\n4. Testing list conversion...'));
    const markdown = '- Item 1\n- Item 2\n- Item 3';
    const result = converter.convertFromMarkdown(markdown);
    const requests = result.requests;
    
    console.log(chalk.gray(`   Input: ${markdown.replace(/\n/g, '\\n')}`));
    console.log(chalk.gray(`   Output: ${requests ? requests.length : 'undefined'} requests`));
    
    // Should have bullet points
    if (requests && requests.length > 0) {
      const listItems = requests.filter(r => 
        r.insertText && r.insertText.text && r.insertText.text.includes('•')
      );
      
      if (listItems.length >= 3) {
        console.log(chalk.green('   ✅ List test passed'));
        testsPassed++;
      } else {
        console.log(chalk.red('   ❌ List test failed'));
      }
    } else {
      console.log(chalk.red('   ❌ List test failed - no requests'));
    }
  } catch (error) {
    console.log(chalk.red('   ❌ List test error:', error.message));
  }

  // Test 5: Inline formatting
  totalTests++;
  try {
    console.log(chalk.blue('\n5. Testing inline formatting...'));
    const markdown = 'This is **bold** and *italic* and `code`.';
    const result = converter.convertFromMarkdown(markdown);
    const requests = result.requests;
    
    console.log(chalk.gray(`   Input: ${markdown}`));
    console.log(chalk.gray(`   Output: ${requests ? requests.length : 'undefined'} requests`));
    
    // Should have bold, italic, and code formatting
    if (requests && requests.length > 0) {
      const boldFormatting = requests.find(r => 
        r.updateTextStyle && r.updateTextStyle.textStyle && r.updateTextStyle.textStyle.bold
      );
      const italicFormatting = requests.find(r => 
        r.updateTextStyle && r.updateTextStyle.textStyle && r.updateTextStyle.textStyle.italic
      );
      const codeFormatting = requests.find(r => 
        r.updateTextStyle && r.updateTextStyle.textStyle && r.updateTextStyle.textStyle.backgroundColor
      );
      
      if (boldFormatting && italicFormatting && codeFormatting) {
        console.log(chalk.green('   ✅ Inline formatting test passed'));
        testsPassed++;
      } else {
        console.log(chalk.red('   ❌ Inline formatting test failed'));
      }
    } else {
      console.log(chalk.red('   ❌ Inline formatting test failed - no requests'));
    }
  } catch (error) {
    console.log(chalk.red('   ❌ Inline formatting test error:', error.message));
  }

  // Test 6: Complex document
  totalTests++;
  try {
    console.log(chalk.blue('\n6. Testing complex document...'));
    const markdown = `# Documentation

This is a **complex** document with *multiple* features.

## Features

- Headings
- Lists
- Code blocks
- Inline formatting

\`\`\`javascript
function hello() {
  console.log("Hello World");
}
\`\`\`

### Conclusion

This document tests various markdown features.`;

    const result = converter.convertFromMarkdown(markdown);
    const requests = result.requests;
    
    console.log(chalk.gray(`   Input: ${markdown.split('\n').length} lines`));
    console.log(chalk.gray(`   Output: ${requests ? requests.length : 'undefined'} requests`));
    
    if (requests && requests.length > 10) {
      console.log(chalk.green('   ✅ Complex document test passed'));
      testsPassed++;
    } else {
      console.log(chalk.red('   ❌ Complex document test failed'));
    }
  } catch (error) {
    console.log(chalk.red('   ❌ Complex document test error:', error.message));
  }

  // Test 7: Empty content
  totalTests++;
  try {
    console.log(chalk.blue('\n7. Testing empty content...'));
    const markdown = '';
    const result = converter.convertFromMarkdown(markdown);
    const requests = result.requests;
    
    console.log(chalk.gray(`   Input: (empty)`));
    console.log(chalk.gray(`   Output: ${requests ? requests.length : 'undefined'} requests`));
    
    if (requests && requests.length === 0) {
      console.log(chalk.green('   ✅ Empty content test passed'));
      testsPassed++;
    } else {
      console.log(chalk.red('   ❌ Empty content test failed'));
    }
  } catch (error) {
    console.log(chalk.red('   ❌ Empty content test error:', error.message));
  }

  // Test 8: Table conversion
  totalTests++;
  try {
    console.log(chalk.blue('\n8. Testing table conversion...'));
    const markdown = `| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Row 1 Col 1 | Row 1 Col 2 | Row 1 Col 3 |
| Row 2 Col 1 | Row 2 Col 2 | Row 2 Col 3 |`;

    const result = converter.convertFromMarkdown(markdown);
    const requests = result.requests;
    
    console.log(chalk.gray(`   Input: Table with 3 columns, 2 rows`));
    console.log(chalk.gray(`   Output: ${requests ? requests.length : 'undefined'} requests`));
    
    if (requests && requests.length > 0) {
      const tableRequest = requests.find(r => r.insertTable);
      
      if (tableRequest && tableRequest.insertTable.rows === 3 && tableRequest.insertTable.columns === 3) {
        console.log(chalk.green('   ✅ Table conversion test passed'));
        testsPassed++;
      } else {
        console.log(chalk.red('   ❌ Table conversion test failed - incorrect table structure'));
      }
    } else {
      console.log(chalk.red('   ❌ Table conversion test failed - no requests'));
    }
  } catch (error) {
    console.log(chalk.red('   ❌ Table conversion test error:', error.message));
  }

  // Summary
  console.log(chalk.blue('\n📊 Test Results'));
  console.log(chalk.gray('================'));
  console.log(chalk.cyan(`Tests passed: ${testsPassed}/${totalTests}`));
  
  if (testsPassed === totalTests) {
    console.log(chalk.green('🎉 All tests passed!'));
    return true;
  } else {
    console.log(chalk.red(`❌ ${totalTests - testsPassed} tests failed`));
    return false;
  }
}

// Run test if called directly
if (require.main === module) {
  testGoogleDocsConverter()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error(chalk.red('Test runner error:', error.message));
      process.exit(1);
    });
}

module.exports = { testGoogleDocsConverter }; 