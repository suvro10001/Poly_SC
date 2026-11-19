import re

with open('dist/assets/index-DUgogy-C.js', 'r', encoding='utf-8') as f:
    bundle = f.read()

# Look for report content text
matches = re.findall(r'expense-statement-report-content.*?(?=showReportPrintPreviewModal|deleteConfirmTarget|showDeleteConfirmModal|\}\)\;\}\;)', bundle, re.DOTALL)
print('Found matches in bundle:', len(matches))
if matches:
    print('First match snippet length:', len(matches[0]))
    with open('tmp/extracted_bundle_report.txt', 'w', encoding='utf-8') as out:
        out.write(matches[0][:5000])
