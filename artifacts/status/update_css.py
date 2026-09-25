import re

with open('src/pages/moderation/moderation.css', 'r') as f:
    css = f.read()

# Replace variables
new_vars = """
.mod-shell, .mod-shell.dark {
  --background: 0 18% 4%;
  --foreground: 30 22% 91%;
  
  --card: 0 20% 7%;
  --card-foreground: 30 22% 91%;
  
  --popover: 0 20% 9%;
  --popover-foreground: 30 22% 91%;
  
  --primary: 356 58% 57%;
  --primary-foreground: 30 22% 96%;
  
  --secondary: 0 17% 11%;
  --secondary-foreground: 30 22% 91%;
  
  --muted: 0 17% 11%;
  --muted-foreground: 18 11% 63%;
  
  --accent: 4 57% 48%;
  --accent-foreground: 30 22% 96%;
  
  --destructive: 3 68% 55%;
  --destructive-foreground: 30 22% 96%;
  
  --border: 0 17% 15%;
  --input: 0 18% 18%;
  --ring: 356 58% 57%;
  
  --display: "Cormorant Garamond", Georgia, serif;
  --mono: "DM Mono", monospace;
  --body: "DM Sans", sans-serif;
}
"""
css = re.sub(r'\.mod-shell, \.mod-shell\.dark \{[\s\S]*?\}', new_vars.strip(), css, count=1)

# Modify mod-sidebar-item
old_sidebar = """.mod-sidebar-item {
  position: relative;
  transition: all 200ms ease;
}

.mod-sidebar-item::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: hsl(var(--primary));
  transform: scaleY(0);
  transition: transform 200ms ease;
  transform-origin: center;
}

.mod-sidebar-item\\[data-active="true"\\]::before {
  transform: scaleY(1);
}

.mod-sidebar-item\\[data-active="true"\\] {
  background: linear-gradient(90deg, hsl(var(--primary) / 0.1) 0%, transparent 100%);
  color: hsl(var(--primary));
}

.mod-sidebar-item:hover {
  background: linear-gradient(90deg, hsl(var(--primary) / 0.08), transparent 78%);
}"""

new_sidebar = """.mod-sidebar-item {
  position: relative;
  transition: all 250ms cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.mod-sidebar-item::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: hsl(var(--primary));
  transform: scaleY(0);
  transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: center;
  border-radius: 0 4px 4px 0;
}

.mod-sidebar-item[data-active="true"]::before {
  transform: scaleY(0.7);
}

.mod-sidebar-item[data-active="true"] {
  background: linear-gradient(90deg, hsl(var(--primary) / 0.12) 0%, transparent 100%);
  color: hsl(var(--foreground));
  font-weight: 500;
}

.mod-sidebar-item[data-active="true"] svg {
  color: hsl(var(--primary));
}

.mod-sidebar-item:hover:not([data-active="true"]) {
  background: linear-gradient(90deg, hsl(var(--primary) / 0.05), transparent 100%);
  color: hsl(var(--foreground));
  transform: translateX(4px);
}"""

if old_sidebar in css:
    css = css.replace(old_sidebar, new_sidebar)

# Replace the old mod-card and brand-mark blocks in the middle of the file with new mod-card and brand-mark.
# Wait, they are defined in multiple places.
# Let's just append the new styles and overrides to the bottom so we don't break existing selectors!
# Actually, appending overrides is safer and cleaner.

with open('src/pages/moderation/moderation.css', 'w') as f:
    f.write(css)

print("Vars updated")
