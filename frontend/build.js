#!/usr/bin/env node
/**
 * Build script for SiteChat Widget
 * Obfuscates and minifies the chatbot widget for production use
 */

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const SRC_DIR = path.join(__dirname, 'src', 'widget');
const DIST_DIR = path.join(__dirname, 'widget');

const obfuscatorOptions = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: false,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: false,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.5,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 1,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 2,
    stringArrayWrappersType: 'variable',
    stringArrayThreshold: 0.5,
    transformObjectKeys: false,
    unicodeEscapeSequence: false
};

function buildWidget() {
    console.log('🔨 Building SiteChat Widget...\n');

    // Ensure dist directory exists
    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    // Read source file
    const srcFile = path.join(SRC_DIR, 'chatbot.js');
    
    if (!fs.existsSync(srcFile)) {
        console.error('❌ Widget source missing:', srcFile);
        console.error('   Edit and commit frontend/src/widget/chatbot.js in this repo, then re-run build.');
        console.error('   The files in frontend/widget/ are build output only.');
        process.exit(1);
    }

    const sourceCode = fs.readFileSync(srcFile, 'utf8');
    console.log(`📖 Read source: ${srcFile}`);
    console.log(`   Size: ${(sourceCode.length / 1024).toFixed(2)} KB`);

    // Add banner comment
    const banner = `/**
 * SiteChat Widget v1.0.0
 * (c) ${new Date().getFullYear()} SiteChat. All rights reserved.
 * This code is proprietary and confidential.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 * 
 * Built: ${new Date().toISOString()}
 */\n`;

    // Obfuscate
    console.log('\n🔐 Obfuscating code...');
    const startTime = Date.now();
    
    const obfuscationResult = JavaScriptObfuscator.obfuscate(sourceCode, obfuscatorOptions);
    const obfuscatedCode = banner + obfuscationResult.getObfuscatedCode();
    
    const endTime = Date.now();
    console.log(`   Completed in ${endTime - startTime}ms`);

    // Write output
    const outputFile = path.join(DIST_DIR, 'chatbot.js');
    fs.writeFileSync(outputFile, obfuscatedCode);
    
    console.log(`\n📦 Output: ${outputFile}`);
    console.log(`   Size: ${(obfuscatedCode.length / 1024).toFixed(2)} KB`);
    console.log(`   Compression: ${((1 - obfuscatedCode.length / sourceCode.length) * -100).toFixed(1)}% (obfuscation adds size)`);

    // Create minified version (without heavy obfuscation) for debugging
    const lightOptions = {
        compact: true,
        simplify: true,
        renameGlobals: false,
        identifierNamesGenerator: 'mangled',
        stringArray: false
    };
    
    const lightResult = JavaScriptObfuscator.obfuscate(sourceCode, lightOptions);
    const lightFile = path.join(DIST_DIR, 'chatbot.min.js');
    fs.writeFileSync(lightFile, banner + lightResult.getObfuscatedCode());
    console.log(`\n📦 Light version: ${lightFile}`);
    console.log(`   Size: ${(lightResult.getObfuscatedCode().length / 1024).toFixed(2)} KB`);

    console.log('\n✅ Build complete!\n');
    console.log('Files generated:');
    console.log('  - widget/chatbot.js     (fully obfuscated - production)');
    console.log('  - widget/chatbot.min.js (minified only - debugging)');
    console.log('\nSource files are in: src/widget/');
}

// Run build
buildWidget();
