import sys

with open('README.md', 'r') as f:
    lines = f.readlines()

# Find the Level 2 block to move
start_idx = None
end_idx = None

for i, line in enumerate(lines):
    if "## 🟡 Level 2 — Yellow Belt Mandatory Proof" in line:
        start_idx = i - 1 # Include the previous --- or blank line
    if start_idx is not None and i > start_idx + 2 and line.strip() == "---":
        end_idx = i
        break

if start_idx is None or end_idx is None:
    print("Could not find Level 2 block")
    sys.exit(1)

block_to_move = lines[start_idx:end_idx+1]
del lines[start_idx:end_idx+1]

# Find the end of Level 3
level_3_idx = None
for i, line in enumerate(lines):
    if "## Level 3 - Orange Belt Submission" in line:
        level_3_idx = i
        break

if level_3_idx is None:
    print("Could not find Level 3 block")
    sys.exit(1)

# Find where to insert (end of Level 3 is right before another major heading)
# Wait, let's just insert it at the very bottom of the document or right after the Level 3 block finishes. 
# Level 3 block seems to end where the next Level or section starts. Let's find "## Level 1" or the end of the file.
insert_idx = len(lines)
for i in range(level_3_idx + 1, len(lines)):
    if lines[i].startswith("## "):
        if "Level " in lines[i] or "## Level" in lines[i]:
            insert_idx = i
            break

lines = lines[:insert_idx] + block_to_move + lines[insert_idx:]

with open('README.md', 'w') as f:
    f.writelines(lines)
print("Moved successfully")
