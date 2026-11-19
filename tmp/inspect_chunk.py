with open('tmp/bundle_expense_manager.txt', 'r', encoding='utf-8') as f:
    text = f.read()

import re
print("Length:", len(text))
# Find strings inside text
strings = re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', text)
print("Unique strings in bundle chunk:", len(set(strings)))
print("Sample relevant strings:")
for s in sorted(set(strings)):
    if any(k in s.lower() for k in ['statement', 'expense statement', 'prepared by', 'approved by', 'net sale', 'net balance', 'summary of expenditure']):
        print('  -', s)
