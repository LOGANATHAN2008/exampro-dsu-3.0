import os
import re

html_files = [f for f in os.listdir('.') if f.endswith('.html')]

css_link = '    <link rel="stylesheet" href="theme.css">\n'
js_link = '    <script src="theme.js"></script>\n'

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if already injected
    if 'href="theme.css"' in content:
        print(f"Skipping {file} - already injected")
        continue

    # Inject right before </head>
    head_end_idx = content.find('</head>')
    if head_end_idx != -1:
        new_content = content[:head_end_idx] + css_link + js_link + content[head_end_idx:]
        with open(file, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Successfully injected theme into {file}")
    else:
        print(f"Warning: No </head> tag found in {file}")

print("Injection complete.")
