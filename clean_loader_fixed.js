const fs = require('fs');
const path = require('path');

const directory = '.';

// This regex matches the entire <div id="loader"> block, down to the closing </div> of the loader.
const loaderHtmlRegex = /\s*<!-- Mass Loader -->\s*<div class="spinner-overlay" id="loader"[\s\S]*?<p class="loader-text">[\s\S]*?<\/p>\s*<\/div>\s*/g;
const loaderHtmlNoCommentRegex = /\s*<div class="spinner-overlay" id="loader"[\s\S]*?<p class="loader-text">[\s\S]*?<\/p>\s*<\/div>\s*/g;

const loaderJsRegex = /\s*document\.getElementById\(['"]loader['"]\)\.style\.display\s*=\s*['"]none['"];\s*/g;
const loaderAdminRegex = /\s*const loader = document\.getElementById\(['"]loader['"]\);\s*if\s*\(loader\)\s*loader\.style\.display\s*=\s*['"]none['"];\s*/g;
const loaderAdmin2Regex = /\s*const loader = document\.getElementById\(['"]loader['"]\);\s*loader\.style\.display\s*=\s*['"]none['"];\s*/g;

let count = 0;

function walk(dir) {
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        const filepath = path.join(dir, file);
        const stat = fs.statSync(filepath);
        if (stat && stat.isDirectory()) {
            if (file !== '.git' && file !== 'node_modules') {
                walk(filepath);
            }
        } else {
            if (file.endsWith('.html') && file !== 'check-result.html') {
                const content = fs.readFileSync(filepath, 'utf8');
                let newContent = content.replace(loaderHtmlRegex, '\n');
                newContent = newContent.replace(loaderHtmlNoCommentRegex, '\n');
                newContent = newContent.replace(loaderJsRegex, '\n');
                newContent = newContent.replace(loaderAdminRegex, '\n');
                newContent = newContent.replace(loaderAdmin2Regex, '\n');
                
                if (newContent !== content) {
                    fs.writeFileSync(filepath, newContent, 'utf8');
                    count++;
                    console.log(`Cleaned ${file}`);
                }
            }
        }
    });
}

walk(directory);
console.log(`Total files cleaned: ${count}`);
