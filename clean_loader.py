import os
import re

directory = '.'

loader_html_regex = re.compile(r'\s*<!-- Mass Loader -->\s*<div class=\"spinner-overlay\" id=\"loader\".*?</div>\s*', re.DOTALL)
loader_js_regex = re.compile(r'\s*document\.getElementById\([\'\"]loader[\'\"]\)\.style\.display\s*=\s*[\'\"]none[\'\"];\s*')
loader_admin_regex = re.compile(r'\s*const loader = document\.getElementById\([\'\"]loader[\'\"]\);\s*if\s*\(loader\)\s*loader\.style\.display\s*=\s*[\'\"]none[\'\"];\s*')
loader_admin2_regex = re.compile(r'\s*const loader = document\.getElementById\([\'\"]loader[\'\"]\);\s*loader\.style\.display\s*=\s*[\'\"]none[\'\"];\s*')


count = 0
for root, dirs, files in os.walk(directory):
    for file in files:
        if file.endswith('.html') and file != 'check-result.html':
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            new_content = loader_html_regex.sub('\n', content)
            new_content = loader_js_regex.sub('\n', new_content)
            new_content = loader_admin_regex.sub('\n', new_content)
            new_content = loader_admin2_regex.sub('\n', new_content)
            
            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                count += 1
                print(f'Cleaned {file}')
                
print(f'Total files cleaned: {count}')
