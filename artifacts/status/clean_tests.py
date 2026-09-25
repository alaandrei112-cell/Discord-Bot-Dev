import re

with open('tests/moderation.browser.spec.ts', 'r') as f:
    content = f.read()

# Pattern to find all blocks starting with:
# test("Take visual regression screenshots"
# and ending before the next test( or test.describe or at the end of the file/block.
# We'll just look for the exact injection block we added.

pattern = r'\s*test\("Take visual regression screenshots", async \(\{ page \}\) => \{.*?\}\);\n'
content = re.sub(pattern, '\n', content, flags=re.DOTALL)

with open('tests/moderation.browser.spec.ts', 'w') as f:
    f.write(content)
