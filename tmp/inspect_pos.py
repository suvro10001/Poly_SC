with open('tmp/bundle_expense_manager.txt', 'r') as f:
    text = f.read()

pos = text.find('Expense Statement Report - Print Preview')
print('Found at:', pos)
print('Before print preview (last 3000 chars):')
print(text[max(0, pos-3000):pos+500])
