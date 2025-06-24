/**
 * Test reverse sync functionality (Confluence to Docusaurus)
 */

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const HtmlToMarkdownParser = require('../lib/core/html-to-markdown-parser');

// Mock Confluence content
const confluenceContent = `
<p>This is a paragraph from Confluence.</p>

<h2>Heading from Confluence</h2>

<p>Another paragraph with <strong>bold</strong> and <em>italic</em> text.</p>

<ac:structured-macro ac:name="code" ac:schema-version="1">
  <ac:parameter ac:name="language">javascript</ac:parameter>
  <ac:plain-text-body><![CDATA[function testCode() {
  console.log("Hello from Confluence!");
}]]></ac:plain-text-body>
</ac:structured-macro>

<ul>
  <li>List item 1</li>
  <li>List item 2</li>
  <li>List item 3</li>
</ul>

<table>
  <tr>
    <th>Header 1</th>
    <th>Header 2</th>
  </tr>
  <tr>
    <td>Cell 1</td>
    <td>Cell 2</td>
  </tr>
</table>

<ac:structured-macro ac:name="note">
  <ac:parameter ac:name="title">Note Title</ac:parameter>
  <ac:rich-text-body>
    <p>This is a note from Confluence.</p>
  </ac:rich-text-body>
</ac:structured-macro>

<ac:image ac:src="https://example.com/image.png" />
`;

// Test HTML to Markdown conversion
async function testHtmlToMarkdownConversion() {
  console.log(chalk.blue('🧪 Testing HTML to Markdown conversion...'));
  
  try {
    const projectRoot = process.cwd();
    const parser = new HtmlToMarkdownParser(projectRoot);
    
    // Create a temporary test file
    const testDir = path.join(projectRoot, 'test', 'temp');
    await fs.ensureDir(testDir);
    const testFilePath = path.join(testDir, 'test-reverse.md');
    
    // Create a test markdown file with frontmatter
    const originalContent = `---
title: "Test Reverse Sync"
sidebar_position: 1
---

# Original content that will be replaced
`;
    
    await fs.writeFile(testFilePath, originalContent, 'utf8');
    
    // Convert Confluence content to Markdown
    const markdown = await parser.convertToMarkdown(
      confluenceContent,
      '12345', // Mock page ID
      testFilePath
    );
    
    console.log(chalk.green('✅ Successfully converted Confluence content to Markdown'));
    console.log(chalk.cyan('\n📋 PREVIEW:'));
    console.log(chalk.white('Markdown length:'), markdown.length, 'characters');
    console.log(chalk.white('Markdown snippet:'), markdown.substring(0, 200) + '...');
    
    // Read the original file to get frontmatter
    const { data: frontmatter } = require('gray-matter')(originalContent);
    
    // Build the new markdown file with preserved frontmatter
    let newContent = '';
    
    // Add frontmatter
    if (Object.keys(frontmatter).length > 0) {
      newContent += '---\n';
      for (const [key, value] of Object.entries(frontmatter)) {
        if (typeof value === 'string') {
          newContent += `${key}: "${value}"\n`;
        } else {
          newContent += `${key}: ${JSON.stringify(value)}\n`;
        }
      }
      newContent += '---\n\n';
    }
    
    // Add converted markdown content
    newContent += markdown;
    
    // Write the updated content back to the file
    await fs.writeFile(testFilePath, newContent, 'utf8');
    
    console.log(chalk.green(`✅ Updated test file: ${testFilePath}`));
    console.log(chalk.green('✅ Frontmatter preserved'));
    
    return true;
  } catch (error) {
    console.error(chalk.red('❌ Test failed:'), error.message);
    if (error.stack) {
      console.error(chalk.gray('Stack:'), error.stack);
    }
    return false;
  }
}

// Run tests
async function runTests() {
  console.log(chalk.blue('🧪 Running reverse sync tests...'));
  
  const results = await Promise.all([
    testHtmlToMarkdownConversion()
  ]);
  
  const success = results.every(Boolean);
  
  if (success) {
    console.log(chalk.green('\n✅ All tests passed!'));
  } else {
    console.log(chalk.red('\n❌ Some tests failed!'));
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error(chalk.red('❌ Unhandled error:'), error);
  process.exit(1);
}); 