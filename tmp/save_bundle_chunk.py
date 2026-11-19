with open('dist/assets/index-DUgogy-C.js', 'r', encoding='utf-8') as f:
    bundle = f.read()

start = 3462727
end = 3625000
chunk = bundle[start:end]

with open('tmp/bundle_expense_manager.txt', 'w', encoding='utf-8') as f_out:
    f_out.write(chunk)

print('Saved chunk of length:', len(chunk))
