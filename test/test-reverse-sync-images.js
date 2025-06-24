const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');
const HtmlToMarkdownParser = require('../lib/core/html-to-markdown-parser');

/**
 * Test reverse sync image handling with attachment metadata
 */
async function testReverseSyncImages() {
  console.log(chalk.blue('🧪 Testing reverse sync image handling...'));
  
  try {
    const projectRoot = process.cwd();
    const testDir = path.join(projectRoot, 'test-output');
    const testFile = path.join(testDir, 'test-reverse-images.md');
    
    // Ensure test directory exists
    await fs.ensureDir(testDir);
    
    // Mock Confluence client for testing
    const mockConfluenceClient = {
      config: {
        baseUrl: 'https://test.atlassian.net'
      },
      getAttachmentDownloadUrl: (attachment) => {
        return `https://test.atlassian.net/wiki/download/attachments/${attachment.id}/${attachment.title}`;
      },
      downloadAttachment: async (url) => {
        // Mock download - return a small buffer
        console.log(chalk.blue(`📥 Mock downloading: ${url}`));
        return Buffer.from('mock-image-data');
      }
    };
    
    // Mock attachments data
    const mockAttachments = [
      {
        id: '12345',
        title: 'diagram.png',
        version: { when: '2025-01-27T10:00:00Z' },
        metadata: { createdDate: '2025-01-27T10:00:00Z' },
        _links: {
          download: '/wiki/download/attachments/12345/diagram.png'
        }
      },
      {
        id: '12346',
        title: 'screenshot.jpg',
        version: { when: '2025-01-27T10:00:00Z' },
        metadata: { createdDate: '2025-01-27T10:00:00Z' },
        _links: {
          download: '/wiki/download/attachments/12346/screenshot.jpg'
        }
      }
    ];
    
    // Sample Confluence storage format HTML with various image types
    const confluenceHtml = `
      <h1>Test Document</h1>
      <p>This document contains various types of images:</p>
      
      <h2>Attachment Images</h2>
      <p>Here's an attached diagram:</p>
      <ac:image>
        <ri:attachment ri:filename="diagram.png" />
      </ac:image>
      
      <p>And a screenshot:</p>
      <ac:image ac:width="500">
        <ri:attachment ri:filename="screenshot.jpg" />
      </ac:image>
      
      <h2>Direct URL Images</h2>
      <p>External image:</p>
      <ac:image>
        <ri:url ri:value="https://example.com/external-image.png" />
      </ac:image>
      
      <h2>Traditional Attachment URLs</h2>
      <p>Legacy format:</p>
      <img src="/wiki/download/attachments/98765/diagram.png" alt="Legacy attachment" />
      
      <h2>Code Block</h2>
      <ac:structured-macro ac:name="code">
        <ac:parameter ac:name="language">javascript</ac:parameter>
        <ac:plain-text-body><![CDATA[
console.log('Hello World');
        ]]></ac:plain-text-body>
      </ac:structured-macro>
      
      <h2>Info Macro</h2>
      <ac:structured-macro ac:name="info">
        <ac:parameter ac:name="title">Important Note</ac:parameter>
        <ac:rich-text-body>
          <p>This is an important information block.</p>
        </ac:rich-text-body>
      </ac:structured-macro>
    `;
    
    // Initialize parser with mock client
    const parser = new HtmlToMarkdownParser(projectRoot, mockConfluenceClient);
    
    console.log(chalk.blue('🔄 Converting Confluence HTML to Markdown...'));
    
    // Convert to markdown
    const markdown = await parser.convertToMarkdown(
      confluenceHtml,
      '98765',
      testFile,
      mockAttachments
    );
    
    // Write result to file
    await fs.writeFile(testFile, markdown, 'utf8');
    
    console.log(chalk.green('✅ Conversion completed!'));
    console.log(chalk.white('Output file:'), testFile);
    
    // Display the converted markdown
    console.log(chalk.cyan('\n📄 CONVERTED MARKDOWN:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(markdown);
    console.log(chalk.gray('─'.repeat(50)));
    
    // Check if images directory was created
    const imagesDir = path.join(testDir, 'images');
    if (await fs.pathExists(imagesDir)) {
      const imageFiles = await fs.readdir(imagesDir);
      console.log(chalk.green(`\n📁 Images directory created with ${imageFiles.length} files:`));
      imageFiles.forEach(file => {
        console.log(chalk.blue(`  - ${file}`));
      });
    }
    
    // Analyze the conversion results
    console.log(chalk.cyan('\n📊 CONVERSION ANALYSIS:'));
    
    const imageCount = (markdown.match(/!\[.*?\]\(.*?\)/g) || []).length;
    const codeBlockCount = (markdown.match(/```[\s\S]*?```/g) || []).length;
    const admonitionCount = (markdown.match(/:::.*?:::/gs) || []).length;
    
    console.log(chalk.white('Images found:'), imageCount);
    console.log(chalk.white('Code blocks:'), codeBlockCount);
    console.log(chalk.white('Admonitions:'), admonitionCount);
    
    // Verify specific conversions
    const tests = [
      {
        name: 'Attachment images converted',
        test: markdown.includes('![diagram.png](images/diagram.png)') || markdown.includes('images/diagram'),
        expected: true
      },
      {
        name: 'External URLs preserved',
        test: markdown.includes('https://example.com/external-image.png'),
        expected: true
      },
      {
        name: 'Code blocks converted',
        test: markdown.includes('```javascript') && markdown.includes("console.log('Hello World');"),
        expected: true
      },
      {
        name: 'Info macros converted to admonitions',
        test: markdown.includes(':::info') || markdown.includes('Important Note'),
        expected: true
      }
    ];
    
    console.log(chalk.cyan('\n🧪 TEST RESULTS:'));
    let passedTests = 0;
    
    tests.forEach(test => {
      const passed = test.test === test.expected;
      const icon = passed ? '✅' : '❌';
      const color = passed ? chalk.green : chalk.red;
      
      console.log(color(`${icon} ${test.name}`));
      if (passed) passedTests++;
    });
    
    console.log(chalk.cyan(`\n📈 SUMMARY: ${passedTests}/${tests.length} tests passed`));
    
    if (passedTests === tests.length) {
      console.log(chalk.green('🎉 All tests passed! Reverse sync image handling is working correctly.'));
    } else {
      console.log(chalk.yellow('⚠️ Some tests failed. Check the implementation.'));
    }
    
    return {
      success: passedTests === tests.length,
      passed: passedTests,
      total: tests.length,
      outputFile: testFile
    };
    
  } catch (error) {
    console.error(chalk.red('❌ Test failed:'), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    throw error;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testReverseSyncImages()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error(chalk.red('Test execution failed:', error.message));
      process.exit(1);
    });
}

module.exports = { testReverseSyncImages }; 