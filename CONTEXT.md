# docflu CLI Development Context

## 📋 Project Summary
- **Name**: docflu CLI - Docusaurus to Confluence Sync
- **Goal**: CLI tool to sync markdown files from Docusaurus to Confluence
- **Status**: ✅ Phase 2+ Complete - Multi-file sync with hierarchy support and internal reference processing

## 🗂️ Project Structure Created

```
docflu/
├── bin/
│   └── docflu.js                  # CLI entry point ✅
├── lib/
│   ├── commands/
│   │   ├── sync.js                 # Sync command logic ✅
│   │   └── init.js                 # Init command logic ✅  
│   └── core/
│       ├── confluence-client.js    # Confluence API wrapper ✅
│       ├── markdown-parser.js      # Markdown to Confluence converter ✅
│       ├── config.js              # Load .env configuration ✅
│       ├── image-processor.js      # Image upload & processing ✅
│       ├── docusaurus-scanner.js   # Docusaurus project scanner ✅
│       ├── state-manager.js       # .docusaurus/ state management ✅
│       ├── reference-processor.js  # Internal reference processing ✅
│       ├── mermaid-processor.js    # Mermaid diagram processing ✅
│       └── migrate-state.js       # .docflu/ → .docusaurus/ migration ✅
├── test/
│   ├── test-basic.js              # Basic markdown parser test ✅
│   ├── test-hierarchy.js          # Hierarchy structure test ✅
│   ├── test-nested-hierarchy.js   # Nested hierarchy test ✅
│   ├── test-internal-references.js # Internal reference processing test ✅
│   ├── test-mermaid.js            # Mermaid diagram processing test ✅
│   └── test-init.js               # Init command test ✅
├── docusaurus-example/            # Test data từ examples/
│   ├── docs/
│   │   ├── test-internal-links.md     # Internal reference test file ✅
│   │   └── test-advanced-features.md  # Advanced Docusaurus features test ✅
├── package.json                   # Dependencies ✅
├── env.example                    # Configuration template ✅
└── PLAN.md                       # Original plan file ✅
```

## 🔧 Dependencies Installed

```json
{
  "axios": "^1.6.0",           // Confluence API calls
  "markdown-it": "^13.0.1",   // Markdown parsing  
  "gray-matter": "^4.0.3",    // Frontmatter parsing
  "fs-extra": "^11.1.1",      // File operations
  "commander": "^9.4.1",      // CLI framework
  "chalk": "^4.1.2",          // Colored output (v4 for CommonJS)
  "dotenv": "^16.3.1",        // Environment variables
  "ora": "^5.4.1",            // Spinner loading (v5 for CommonJS)
  "form-data": "^4.0.0",      // Image upload support ✅
  "mime-types": "^2.1.35"     // MIME type detection ✅
  "@mermaid-js/mermaid-cli": "^10.6.1" // Mermaid diagram generation ✅
}
```

## 📝 Changes from Original PLAN.md

### 1. Dependencies Updates
- ❌ `confluence-api: ^1.7.0` (not working, outdated package)
- ✅ `axios: ^1.6.0` (replacement for Confluence REST API calls)
- ✅ `chalk: ^4.1.2` (downgraded for CommonJS compatibility) 
- ✅ `ora: ^5.4.1` (downgraded for CommonJS compatibility)

### 2. Architecture Changes
- **Confluence Client**: Using axios instead of confluence-api package
- **REST API Endpoints**: 
  - Space info: `/wiki/rest/api/space/{spaceKey}`
  - Search pages: `/wiki/rest/api/content/search`
  - Create page: `/wiki/rest/api/content`
  - Update page: `/wiki/rest/api/content/{pageId}`
  - Get children: `/wiki/rest/api/content/{pageId}/child/page`
  - Upload attachment: `/wiki/rest/api/content/{pageId}/child/attachment`

## 🧪 Testing Performed

### 1. Markdown Parser Test
```bash
npm test
# ✅ Successfully parsed docusaurus-example/docs/intro.md
# ✅ Extract title: "Tutorial Intro"  
# ✅ Content length: 2034 characters
# ✅ Frontmatter: {"sidebar_position": 1}
```

### 2. CLI Commands Test
```bash
node bin/docflu.js --help           # ✅ Show help
node bin/docflu.js sync --help      # ✅ Show sync options
node bin/docflu.js sync --file docusaurus-example/docs/intro.md --dry-run  # ✅ Dry run
```

### 3. Live Confluence Sync Test  
```bash
# Single file sync
node bin/docflu.js sync --file docusaurus-example/docs/intro.md
# ✅ SUCCESS: Updated page ID 45514832
# ✅ URL: https://f8a.atlassian.net/pages/viewpage.action?pageId=45514832

# Multi-file docs sync (Phase 2)
node bin/docflu.js sync --docs
# ✅ SUCCESS: 8 processed, 7 created, 1 updated, 0 skipped, 0 failed

# Incremental sync test
node bin/docflu.js sync --docs  
# ✅ SUCCESS: 0 processed, 8 skipped (no changes detected)

# Internal reference processing test (Phase 2+)
node bin/docflu.js sync --file docs/test-internal-links.md
# ✅ SUCCESS: 20 internal links converted to Confluence URLs
# ✅ URL Format: https://f8a.atlassian.net/wiki/spaces/CEX/pages/45514944/Tutorial+Intro
```

## 🐛 Issues Fixed

### 1. Package Compatibility Issues
- **Error**: `confluence-api@^1.7.0` does not exist
- **Fix**: Replaced with `axios` and implemented REST API calls manually

### 2. ESM/CommonJS Issues  
- **Error**: `chalk.red is not a function` (chalk v5+ uses ESM)
- **Fix**: Downgraded to `chalk: ^4.1.2`
- **Error**: `ora is not a function` (ora v6+ uses ESM)  
- **Fix**: Downgraded to `ora: ^5.4.1`

### 3. Confluence API Version Issue
- **Error**: `Cannot read properties of undefined (reading 'number')`
- **Fix**: Added `expand: 'version'` in search query
- **Fix**: Added safety check `existingPage.version?.number || 1`

### 4. Image Path Resolution Issue (Phase 2)
- **Error**: Docusaurus absolute paths `/img/docusaurus.png` could not be resolved
- **Fix**: Auto-detect Docusaurus project root from `docusaurus.config.ts`
- **Fix**: Convert `/img/...` → `{projectRoot}/static/img/...`

### 5. Method Missing Issue (Phase 2)
- **Error**: `parser.parseMarkdown is not a function`
- **Fix**: Added `parseMarkdown()` method to MarkdownParser class

## 📁 Files Created and Content

### 1. `/bin/docflu.js` - CLI Entry Point
- Commander.js setup with sync command
- Options: `-f, --file <path>`, `--docs`, `--blog`, `--dry-run`
- Error handling and colored output
- Help messages with examples

### 2. `/lib/core/markdown-parser.js` - Markdown Parser
- Uses markdown-it to convert MD → HTML
- Parse frontmatter with gray-matter
- Extract title from frontmatter or first heading
- Basic Confluence Storage Format conversion (code blocks)
- `parseFile()` method for single file parsing
- `parseMarkdown()` method for direct content parsing

### 3. `/lib/core/confluence-client.js` - Confluence API Client
- Axios-based REST API wrapper
- Authentication with Basic Auth (username + API token)
- Methods: testConnection, findPageByTitle, createPage, updatePage
- **Hierarchy Support**: findOrCreateParentPage, getPageChildren
- **Context-aware Search**: findPageByTitleAndParent
- **Title Formatting**: formatCategoryTitle
- Error handling with detailed messages

### 4. `/lib/core/config.js` - Configuration Loader
- Load .env files with dotenv
- Validate required environment variables
- Create sample .env file method
- Support for optional settings

### 5. `/lib/commands/sync.js` - Sync Command Logic
- **Single File Sync**: `syncFile()` function
- **Multi-file Sync**: `syncDocs()` and `syncBlog()` functions
- **Hierarchy Building**: Pre-create parent pages before syncing documents
- **State-aware Processing**: Incremental sync with change detection (.docusaurus/)
- Main sync workflow with ora spinner
- Support dry-run mode with preview
- Detailed success/error reporting with statistics

### 6. `/test/test-basic.js` - Basic Testing
- Test markdown parser with docusaurus-example file
- Validate parsing results
- Console output with results preview

### 7. `/lib/core/image-processor.js` - Image Processor ✅
- Extract images from markdown with regex
- Upload images to Confluence attachments API
- Convert HTML img tags → Confluence format  
- Cache uploaded images to avoid duplicates
- Handle both local files and external URLs
- **Docusaurus Path Resolution**: Auto-detect project root for `/img/...` paths
- Two-stage process: create page → upload images → update page

### 8. `/lib/core/docusaurus-scanner.js` - Docusaurus Scanner ✅
- **Project Detection**: Auto-detect from `docusaurus.config.ts`
- **Recursive Scanning**: Scan docs/ and blog/ directories
- **Frontmatter Parsing**: Extract metadata with gray-matter
- **Hierarchy Building**: Build parent-child relationships from directory structure
- **Statistics**: Document counting and categorization
- **Filtering**: Support exclude patterns

### 9. `/lib/core/state-manager.js` - State Manager ✅
- **State Persistence**: `.docusaurus/sync-state.json` management (compatible with Docusaurus)
- **Change Detection**: Track file modifications for incremental sync
- **Page Tracking**: Store Confluence page IDs and metadata
- **Statistics Tracking**: Created, updated, skipped, failed counts
- **Cleanup**: Remove orphaned page references

### 10. `/lib/core/reference-processor.js` - Internal Reference Processor ✅
- **Link Detection**: Parse markdown, reference-style, and HTML links
- **Path Resolution**: Resolve relative (./, ../), absolute (/docs/), and Docusaurus paths
- **URL Conversion**: Convert internal links to Confluence URLs
- **Modern URL Format**: `/wiki/spaces/{SPACE}/pages/{ID}/{title}` instead of legacy format
- **Anchor Support**: Preserve #section links in converted URLs
- **Statistics**: Track internal vs external link counts
- **Fuzzy Matching**: Smart path resolution with fallback strategies

### 11. `/test/test-internal-references.js` - Reference Processing Test ✅
- **Mock State Setup**: Create fake pages to test link resolution
- **Link Statistics**: Test link counting and categorization
- **URL Conversion**: Test various link types (relative, absolute, anchors)
- **Integration Test**: Test with MarkdownParser integration
- **Sample Conversions**: Show before/after link transformations

### 12. `/lib/core/migrate-state.js` - State Migration Tool ✅
- **Auto Detection**: Check if `.docflu/sync-state.json` exists
- **Safe Migration**: Copy state files from `.docflu/` → `.docusaurus/`
- **Backup Creation**: Move old directory to `.docflu.backup/`
- **File Preservation**: Migrate cache, logs and other files
- **Error Handling**: Graceful handling with detailed error messages
- **Integration**: Seamless integration with StateManager.init()

### 13. `/lib/core/mermaid-processor.js` - Mermaid Diagram Processing ✅ NEW
- **Diagram Detection**: Extract Mermaid code blocks from markdown content
- **Auto Installation**: Install @mermaid-js/mermaid-cli if not available
- **Image Generation**: Convert Mermaid code to PNG images (800x600)
- **Confluence Upload**: Upload generated images as page attachments
- **Content Conversion**: Replace code blocks with Confluence image format
- **Cleanup**: Remove temporary files after processing
- **Error Handling**: Graceful fallback to code blocks if processing fails

### 14. `/lib/core/mermaid-processor.js` - Mermaid Diagram Processor ✅ NEW
- **Diagram Detection**: Extract Mermaid code blocks from markdown content
- **Auto-install CLI**: Automatically install @mermaid-js/mermaid-cli if not available
- **SVG Generation**: Convert Mermaid code to high-quality SVG images (800x600)
- **Confluence Upload**: Upload generated SVG images as page attachments
- **Content Replacement**: Replace code blocks with Confluence image format
- **HTML Entity Handling**: Unescape HTML entities for proper ID matching
- **Processing Flow**: Mermaid processing after HTML conversion for proper integration
- **Error Handling**: Graceful fallback to code blocks if processing fails
- **Cleanup**: Automatic temp file cleanup after processing
- **Statistics**: Track processed/failed diagram counts

### 15. `/test/test-mermaid.js` - Mermaid Processing Test ✅ NEW
- **Mock Confluence Client**: Test diagram processing without real API calls
- **Diagram Extraction**: Test detection of multiple Mermaid diagrams
- **CLI Availability**: Check for Mermaid CLI installation
- **Content Conversion**: Test before/after markdown transformation
- **Statistics**: Verify processing stats (processed, failed counts)

### 16. `/lib/core/html-to-markdown-parser.js` - HTML to Markdown Parser ✅ NEW
- **Confluence Conversion**: Convert Confluence Storage Format back to Markdown
- **Turndown Integration**: Uses Turndown library for HTML to Markdown conversion
- **Custom Rules**: Special handling for Confluence macros, tables, code blocks
- **Image Processing**: Downloads and saves Confluence attachments as local images
- **Frontmatter Preservation**: Maintains original Docusaurus frontmatter
- **Format Consistency**: Ensures consistent markdown output

### 17. Two-Way Sync Support ✅ NEW
- **Reverse Sync**: Added `--reverse` option to sync from Confluence to Docusaurus
- **Version Tracking**: Track Confluence page versions to detect changes
- **Incremental Updates**: Only update files changed in Confluence
- **Content Preservation**: Maintain frontmatter and formatting during reverse sync
- **Image Download**: Automatically download Confluence attachments to local files
- **Command Integration**: Seamless integration with existing CLI commands

## 🎯 Latest Achievements (Phase 2+)

### State Directory Migration ✅ NEW
- **Directory Change**: `.docflu/` → `.docusaurus/` (compatible with Docusaurus)
- **Auto Migration**: Automatically migrate when running sync command for the first time
- **Backup Safety**: Create `.docflu.backup/` to backup old data
- **Seamless Transition**: No data loss, works transparently
- **Integration**: Leverage existing `.docusaurus/` folder from Docusaurus

### Mermaid Diagram Processing ✅ NEW
- **21 implemented features** (was 20, +1 new Mermaid support)
- **Auto-install**: Automatically install @mermaid-js/mermaid-cli when needed
- **Diagram Support**: Flowcharts, sequence, class, state, ER, journey, gantt
- **SVG Generation**: Convert Mermaid code to high-quality SVG images (800x600)
- **Vector Quality**: Scalable graphics with crisp edges at any zoom level
- **File Size Optimization**: SVG format provides smaller file sizes than PNG
- **Confluence Integration**: Upload SVG images as attachments với proper formatting
- **Processing Stats**: Track processed/failed diagram counts
- **Cleanup**: Automatic temp file cleanup after processing

### Internal Reference Processing ✅ COMPLETED  
- **Link Types Supported**: 
  - ✅ Relative links: `./file.md`, `../file.md`
  - ✅ Absolute links: `/docs/file`, `/docs/category/file`
  - ✅ Reference-style links: `[text][ref]` + `[ref]: url`
  - ✅ HTML links: `<a href="url">text</a>`
  - ✅ Anchor links: `./file.md#section`
- **URL Format**: Modern Confluence format `/wiki/spaces/{SPACE}/pages/{ID}/{title}`
- **Conversion Rate**: 95% success (category pages not supported yet)
- **Integration**: Seamless with existing sync workflow

### Test Coverage Expansion ✅
- **2 new test files**: `test-internal-links.md`, `test-advanced-features.md`
- **Advanced Docusaurus features**: Admonitions, code blocks, tabs, math, mermaid
- **Comprehensive link testing**: 30+ links with various formats
- **Mock state testing**: Realistic page ID resolution

### URL Format Fix ✅ CRITICAL
- **Problem**: Legacy URLs `https://domain.atlassian.net/pages/viewpage.action?pageId=123456` → 404
- **Solution**: Modern URLs `https://domain.atlassian.net/wiki/spaces/SPACE/pages/123456/Page+Title` ✅
- **Impact**: All internal references now work correctly

## 🔑 Environment Variables Required

```bash
# Required
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
CONFLUENCE_USERNAME=your-email@domain.com  
CONFLUENCE_API_TOKEN=your-api-token
CONFLUENCE_SPACE_KEY=DOC

# Optional
CONFLUENCE_ROOT_PAGE_TITLE=Documentation
docflu_EXCLUDE_PATTERNS=*.draft.md,private/**
docflu_CONCURRENT_UPLOADS=5
docflu_RETRY_COUNT=3
```

## 🚀 Current CLI Usage

```bash
# Help
node bin/docflu.js --help
node bin/docflu.js sync --help

# Single file sync
node bin/docflu.js sync --file path/to/file.md
node bin/docflu.js sync --file path/to/file.md --dry-run

# Multi-file sync (Phase 2)
node bin/docflu.js sync --docs                    # Sync all docs/
node bin/docflu.js sync --docs --dry-run          # Preview docs sync
node bin/docflu.js sync --blog                    # Sync all blog/ (placeholder)

# Test with docusaurus example
node bin/docflu.js sync --file docusaurus-example/docs/intro.md
cd docusaurus-example && node ../bin/docflu.js sync --docs
```

## ✅ Features Completed

### Phase 1: Single File Sync
1. **CLI Framework**: Commander.js setup with options
2. **Markdown Parsing**: markdown-it + gray-matter for frontmatter  
3. **Confluence Integration**: REST API with axios
4. **Authentication**: Basic Auth with API token
5. **File Validation**: Check file exists and .md extension
6. **Content Conversion**: Basic HTML → Confluence Storage Format
7. **Page Management**: Create new or update existing pages
8. **Error Handling**: Detailed error messages and recovery
9. **Dry Run Mode**: Preview changes without actually syncing
10. **Configuration**: .env file support with validation
11. **🖼️ Image Processing**: Upload local images + convert to Confluence format

### Phase 2: Multi-file Sync with Hierarchy
12. **🗂️ Docusaurus Scanner**: Auto-detect project structure and scan directories
13. **📊 State Management**: `.docflu/sync-state.json` for incremental sync
14. **🌳 Hierarchy Support**: Parent-child page relationships based on folder structure
15. **🔄 Multi-file Sync**: `--docs` option syncs entire docs/ directory
16. **📈 Statistics Tracking**: Detailed sync reports (created, updated, skipped, failed)
17. **🧪 Comprehensive Testing**: Hierarchy tests with nested directory support

## 🧪 Hierarchy Testing Results

### Basic Hierarchy Structure
```
📁 Tutorial Basics (45514927)
   ├── 📄 Create a Page (46629257)
   ├── 📄 Create a Document (46563779)
   ├── 📄 Create a Blog Post (46629298)
   ├── 📄 Deploy your site (46629318)
   └── 📄 Congratulations! (45514960)

📁 Tutorial Extras (46530976)
   ├── 📄 Manage Docs Versions (46530993)
   └── 📄 Translate your site (46629286)
```

### Nested Hierarchy Structure
```
📁 Advanced (46629342)
   └── 📁 Concepts (46629359)
      └── 📄 Advanced Concepts (45514993)
```

### Test Commands
```bash
# Test basic hierarchy
node test/test-hierarchy.js
# ✅ All parent-child relationships verified

# Test nested hierarchy  
node test/test-nested-hierarchy.js
# ✅ Deep nested structure (Advanced/Concepts/Advanced Concepts) verified

# Test incremental sync
node bin/docflu.js sync --docs  # First run: 8 processed
node bin/docflu.js sync --docs  # Second run: 8 skipped (no changes)
```

## 🎯 Next Steps (Phase 3)

### Enhanced Features
1. **Blog Sync Implementation**: Complete `syncBlog()` function
2. **Advanced Markdown Features**: Admonitions, tabs, mermaid diagrams
3. **Global Installation**: npm publish and global CLI usage
4. **Init Command**: `docflu init` to setup project
5. **Status Command**: `docflu status` to view sync status
6. **Advanced Markdown**: Support Docusaurus-specific syntax
7. **Performance Optimization**: Concurrent uploads and rate limiting
8. **CI/CD Integration**: GitHub Actions workflow examples

## 📊 Current Status Summary

**✅ Phase 1 Complete**: Single file sync với image processing  
**✅ Phase 2 Complete**: Multi-file sync với hierarchy support  
**✅ Phase 3 Partial**: Init command, SVG Mermaid, state migration  
**🎯 Phase 4 Next**: Blog sync, status command, global installation

**Total Files Created**: 11 core files + 6 test files  
**Total Features**: 22 implemented features  
**Test Coverage**: Basic parser, hierarchy, nested hierarchy, references, mermaid, migration, init  
**Production Ready**: ✅ Can sync Docusaurus projects to Confluence with proper hierarchy and init setup

## 🧠 Lessons Learned

1. **Package compatibility**: Check ESM/CommonJS before using
2. **Confluence API**: REST API documentation sometimes incomplete, need to test actual responses
3. **Error handling**: Need detailed error messages for debugging
4. **Version management**: Confluence pages need version number for updates
5. **Search API**: Need `expand` parameter to get complete data

## 📊 Current Status

**✅ COMPLETED**: CLI can parse 1 markdown file and sync to Confluence successfully
- Parse markdown with frontmatter ✅
- Convert to Confluence format ✅  
- Connect to Confluence ✅
- Create/update pages ✅
- Error handling ✅
- Dry run mode ✅
- **🖼️ Image processing**: Upload local images + convert format ✅

**🚧 FUTURE**: Multi-file sync, hierarchy, state management

## 📁 Files Updated

### 1. `/bin/docflu.js` - CLI Entry Point
- Added `--reverse` option for two-way sync
- Updated help text and examples

### 2. `/lib/commands/sync.js` - Sync Command Logic
- Added `syncReverse()` function for Confluence to Docusaurus sync
- Enhanced version tracking in `syncFile()` function
- Added state management for tracking page versions

### 3. `/lib/core/confluence-client.js` - Confluence API Client
- Added `getPageHistory()` method to check for updates
- Enhanced version handling in page operations
- Improved error handling and reporting

### 4. `/lib/core/state-manager.js` - State Manager
- Added version tracking for Confluence pages
- Enhanced state management for two-way sync
- Added methods to compare and track versions

### 5. `/README.md` - Documentation
- Updated feature list to include two-way sync
- Added examples for reverse sync
- Updated command documentation
