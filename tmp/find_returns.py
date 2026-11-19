with open('src/components/ExpenseManager.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Find where ExpenseManager main component starts
em_start = text.find("const ExpenseManager: React.FC<ExpenseManagerProps> =")
print('ExpenseManager starts at:', em_start)

# Find all 'return (' after em_start
import re
for m in re.finditer(r'return\s*\(', text[em_start:]):
    idx = em_start + m.start()
    print('return ( at line:', text[:idx].count('\n') + 1)
