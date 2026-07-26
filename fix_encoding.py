import os

def fix_encoding(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check if corrupted by looking for common mojibake
    if 'ðŸ' in content or 'â€' in content or 'Ã' in content:
        try:
            # Reverse the Windows-1252 to UTF-8 corruption
            # We encode the string back to windows-1252 bytes
            raw_bytes = content.encode('windows-1252')
            # And then decode those bytes as UTF-8
            fixed_content = raw_bytes.decode('utf-8')
            
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(fixed_content)
            print(f"Fixed {filename}")
        except Exception as e:
            print(f"Failed to fix {filename}: {e}")
    else:
        print(f"No corruption detected in {filename}")

html_files = [f for f in os.listdir('.') if f.endswith('.html')]
for file in html_files:
    fix_encoding(file)
